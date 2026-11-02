// Creates the authoritative world from the catalog and scenario. Every person in every settlement
// gets a persistent record with a deterministic ID; rendering only ever projects these records.
import { SCENARIO } from '../content/scenario.js';
import { OCCUPATIONS, SPECIES, NAMES, TRAITS } from '../content/occupations.js';
import { PROJECTS } from '../content/recipes.js';
import { initAllocators, allocate, residentId, householdId, fieldId } from './ids.js';
import { initStreams, hashRandom, DEFAULT_SEED } from './rng.js';
import { emptyLedger, seed as seedStock } from './inventory.js';
import { commit } from './history.js';
import { schedule } from './schedule.js';
import { dateAt, localMinute, TICKS_PER_DAY } from './clock.js';

export const SCHEMA_VERSION = 2;
export const CULTURE_SPECIES = { human: 'human', elf: 'elf', dwarf: 'dwarf', fae: 'fae', beast: 'beast', draconic: 'draconic', undead: 'undead', ruin: 'human' };
export const GROWTH_FULL = 2400;
const DAWN = 5 * 60;

export function relationKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

// Occupations for a settlement: authored for the detailed towns, a cultural mix elsewhere.
export function occupationMix(place, scenario = SCENARIO) {
  const total = scenario.population[place.kind] ?? 20;
  if (!total) return [];
  const list = [];
  const push = (o, n) => { for (let i = 0; i < n && list.length < total; i++) list.push(o); };
  const profile = scenario.profiles[place.id];
  if (profile) {
    for (const [o, n] of Object.entries(profile.occupations)) push(o, n);
  } else {
    // Specialists are a share of the people, so every community keeps hands for daily food.
    const c = place.culture, forges = place.smithies.length, fields = place.fields.length;
    const share = (f, min = 0) => Math.max(min, Math.round(total * f));
    if (c === 'human') {
      push('guard', share(0.1, 1)); push('smith', Math.min(forges * 2, share(0.06))); push('merchant', Math.min(place.stalls.length, share(0.1)));
      push('farmer', fields ? share(0.2) : 0); push('priest', place.temples.length ? share(0.04, 1) : 0); push('fisher', place.docks.length ? share(0.06, 1) : 0);
      push('bard', place.taverns.length && total >= 20 ? 1 : 0); push('child', share(0.12)); push('elder', share(0.08));
    } else if (c === 'elf') { push('guard', share(0.09)); push('priest', share(0.09)); push('hunter', share(0.15)); push('bard', share(0.04)); push('child', share(0.09)); push('elder', share(0.11)); }
    else if (c === 'dwarf') { push('guard', share(0.1)); push('smith', Math.min(Math.max(1, forges * 2), share(0.15))); push('miner', share(0.2)); push('child', share(0.07)); push('elder', share(0.07)); }
    else if (c === 'fae') { push('elder', share(0.15)); push('child', share(0.2)); push('reveler', total); }
    else if (c === 'beast') { push('hunter', share(0.15)); push('guard', share(0.1)); push('reveler', share(0.12)); push('smith', share(0.03)); push('child', share(0.12)); push('elder', share(0.1)); }
    else if (c === 'draconic') { push('guard', share(0.12)); push('priest', share(0.12)); push('smith', Math.min(Math.max(1, forges * 2), share(0.08))); push('merchant', share(0.06, 1)); push('child', share(0.1)); }
    else if (c === 'undead') { push('priest', share(0.12)); push('guard', share(0.1)); push('smith', share(0.03)); push('elder', share(0.15)); }
  }
  while (list.length < total) list.push('laborer');
  return list;
}

function makeName(seed, id, species, taken) {
  const N = NAMES[species] || NAMES.human;
  const first = N.first[Math.floor(hashRandom(seed, 'first', id) * N.first.length)];
  const last = N.last[Math.floor(hashRandom(seed, 'last', id) * N.last.length)];
  let name = `${first} ${last}`;
  for (let n = 2; taken.has(name); n++) name = `${first} ${last} ${['', '', 'the Younger', 'the Third', 'the Fourth'][n] || `(${n})`}`.trim();
  taken.add(name);
  return name;
}

function ageOf(occupation) { return occupation === 'child' ? 'child' : occupation === 'elder' ? 'elder' : 'adult'; }

// `start` lets a migrated world begin at its original time without inventing the hours before it.
export function createWorld(catalog, seed = DEFAULT_SEED, scenario = catalog.scenario || SCENARIO, { start = 0 } = {}) {
  seed = String(seed).trim().slice(0, 80) || DEFAULT_SEED;
  const state = {
    schemaVersion: SCHEMA_VERSION, scenario: scenario.id, contentVersion: scenario.contentVersion, generationVersion: scenario.generationVersion,
    catalog: catalog.signature, seed, tick: start, queueSeq: 0, ids: initAllocators(), rng: initStreams(seed), rules: { ...scenario.rules },
    interventions: [], branch: null, settlements: {}, households: {}, residents: {}, buildings: {}, fields: {}, inventories: {},
    jobs: {}, projects: {}, shipments: {}, contracts: {}, incidents: {}, closures: {}, drought: {}, relations: {},
    events: [], archive: [], summaries: {}, reports: [], commands: [], pending: [], threads: [], queue: [], ledger: emptyLedger(),
  };
  for (const place of catalog.places) createSettlement(state, catalog, place, scenario);
  for (const [k, v] of Object.entries(scenario.relations)) {
    const [a, b] = k.split('|');
    if (state.settlements[a] && state.settlements[b]) state.relations[relationKey(a, b)] = v;
  }
  for (const lore of scenario.lore) if (state.settlements[lore.where]) commit(state, 'legend', lore.where, { lore: lore.id, text: lore.text }, { importance: 3 });
  // Recurring work, in stable order.
  for (const place of catalog.places) {
    const first = (DAWN - localMinute(start, place.offset) + TICKS_PER_DAY) % TICKS_PER_DAY || TICKS_PER_DAY;
    schedule(state, start + first, 'settlement', place.id);
  }
  schedule(state, start + 60, 'weather', 'world');
  schedule(state, start + 30, 'contract', 'world');
  for (const p of Object.values(state.residents)) { p.needsAt = start; schedule(state, start + 1 + Math.floor(hashRandom(seed, 'start', p.id) * 20), 'decide', p.id, null, p.token); }
  return state;
}

function createSettlement(state, catalog, place, scenario) {
  const profile = scenario.profiles[place.id] || null;
  const detailed = place.economy === 'detailed';
  const occupations = occupationMix(place, scenario);
  const town = state.settlements[place.id] = {
    id: place.id, policy: 'normal', outlook: 0, foodNeed: 0, dryness: 30,
    water: { level: 0, max: 0, capacity: 0, yield: profile?.wellYield ?? 4 },
    woodland: profile?.woodland ?? 400, woodlandMax: profile?.woodland ?? 400, fish: profile?.fish ?? 0, fishMax: profile?.fish ?? 0,
    known: [], recent: [], unmet: 0, insecure: 0, relief: null, shortage: null, prices: {}, lastDecision: null, watch: 0,
    people: occupations.length, open: [], fires: [],
  };
  town.water.max = town.water.capacity = town.water.level = 400 + 60 * place.wells.length * (town.water.yield / 4);
  // Stores. Detailed towns follow their profile; others share a commons with a fortnight of food.
  if (detailed) {
    const s = place.stores, stock = profile.stock;
    const spread = (ids, goods) => ids.forEach((id, i) => seedStock(state, id, Object.fromEntries(Object.entries(goods).map(([g, n]) => [g, Math.floor(n / ids.length) + (i < n % ids.length ? 1 : 0)]))));
    if (s.dry.length) spread(s.dry, stock.dry || {});
    if (s.reserve.length) spread(s.reserve, stock.reserve || {});
    seedStock(state, s.food[0], stock.food || {});
    seedStock(state, s.yard[0], stock.yard || {});
    seedStock(state, s.treasury, stock.treasury || {});
  } else {
    const n = occupations.length;
    seedStock(state, place.stores.dry[0], { provisions: n * scenario.subsistence.stockDays, ...scenario.subsistence.yard });
    seedStock(state, place.stores.treasury, { coin: scenario.subsistence.treasury });
  }
  // People.
  const taken = new Set();
  const guests = [...(profile?.guests || [])];
  const species0 = CULTURE_SPECIES[place.culture] || 'human';
  const people = occupations.map((occupation, i) => {
    const id = residentId(place.id, i);
    const g = guests.findIndex(x => x.occupation === occupation);
    const species = g >= 0 ? guests.splice(g, 1)[0].species : species0;
    const traits = Object.keys(TRAITS).filter(t => hashRandom(state.seed, 'trait', t, id) < 0.25);
    const p = {
      id, name: makeName(state.seed, id, species, taken), species, culture: place.culture === 'ruin' ? 'human' : place.culture,
      faction: place.realm, occupation, age: ageOf(occupation), skill: 30 + Math.floor(hashRandom(state.seed, 'skill', id) * 61),
      traits, household: null, site: place.id, at: { site: place.id, node: place.pois[place.poi.plaza].node },
      // Needs are hundredths of a point (0-10,000); everyone starts fed and rested.
      needs: { food: 7000 + Math.floor(hashRandom(state.seed, 'food', id) * 3000), rest: 8000, social: 7000, warmth: 10000, safety: 10000 }, needsAt: 0,
      health: 'well', hungry: 0, ate: -1, task: null, token: 0, job: null, memories: [], ties: {}, journey: null,
      vehicle: occupation === 'merchant' ? 'wagon' : null, appearance: Math.floor(hashRandom(state.seed, 'look', id) * 1e9),
    };
    state.residents[id] = p;
    return p;
  });
  // Saltmere's last merchant keeps a ship for the sea trade.
  if (place.id === 'saltmere') { const sailors = people.filter(p => p.occupation === 'merchant'); if (sailors.length) sailors.at(-1).vehicle = 'ship'; }
  if (catalog.edges.some(e => e.mode === 'sea' && (e.a === place.id || e.b === place.id)) && !detailed) {
    const m = people.find(p => p.occupation === 'merchant'); if (m) m.vehicle = 'ship';
  }
  createHouseholds(state, place, people);
  if (detailed) createFields(state, place, profile);
  if (profile?.project) {
    const b = place.buildings.find(x => x.tag === profile.project.tag);
    if (b) createProject(state, catalog, place.id, b.id, profile.project.kind, null, 0);
  }
  return town;
}

function createHouseholds(state, place, people) {
  const order = people.slice().sort((a, b) => hashRandom(state.seed, 'hh', a.id) - hashRandom(state.seed, 'hh', b.id) || (a.id < b.id ? -1 : 1));
  const adults = order.filter(p => p.age === 'adult'), children = order.filter(p => p.age === 'child'), elders = order.filter(p => p.age === 'elder');
  const groups = [];
  for (let i = 0; i < adults.length;) {
    const pair = hashRandom(state.seed, 'pair', adults[i].id) < 0.6 && i + 1 < adults.length ? 2 : 1;
    groups.push(adults.slice(i, i + pair)); i += pair;
  }
  if (!groups.length && (children.length || elders.length)) groups.push([]);
  children.forEach((c, i) => { const families = groups.filter(g => g.length === 2); (families.length ? families[i % families.length] : groups[i % groups.length]).push(c); });
  elders.forEach((e, i) => { if (hashRandom(state.seed, 'elderhome', e.id) < 0.5 && groups.length) groups[i % groups.length].push(e); else groups.push([e]); });
  // Farmers live at farmsteads; everyone else fills homes nearest the market first.
  const farm = place.buildings.filter(b => b.use === 'farmstead').map(b => b.id);
  const homes = place.buildings.filter(b => b.use === 'home').map(b => [b.id, Math.hypot(b.x - place.plaza.x, b.y - place.plaza.y)]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(x => x[0]);
  const used = new Map();
  groups.forEach((members, i) => {
    const id = householdId(place.id, i);
    const isFarm = members.some(m => m.occupation === 'farmer');
    const pool = isFarm && farm.length ? farm : homes.length ? homes : farm;
    let home = null;
    if (pool.length) {
      home = pool.find(h => !used.has(h)) || pool[i % pool.length];
      used.set(home, (used.get(home) || 0) + 1);
    }
    state.households[id] = { id, site: place.id, home, members: members.map(m => m.id), displaced: false, hungry: 0, migrating: null };
    for (const m of members) {
      m.household = id;
      if (home) m.at = { site: place.id, node: place.pois[place.byBuilding[home].poi].node };
    }
    // Two days of food in the pantry to start; the dead keep none.
    const eaters = members.filter(m => SPECIES[m.species].eats).length;
    if (eaters) seedStock(state, `inv:${id}`, place.economy === 'detailed' ? { bread: eaters, grain: eaters } : { provisions: eaters * 2 });
  });
}

function createFields(state, place, profile) {
  const day = dateAt(state.tick).dayOfYear;
  place.fields.forEach((poi, i) => {
    const id = fieldId(place.id, i);
    const r = hashRandom(state.seed, 'field', id);
    // Late summer: many plots are ripening, some are ready, a few lie fallow.
    const stage = r < 0.18 ? 'fallow' : r < 0.45 ? 'ripe' : 'growing';
    const growth = stage === 'ripe' ? GROWTH_FULL : stage === 'growing' ? Math.floor(GROWTH_FULL * (0.45 + r * 0.6)) % GROWTH_FULL : 0;
    state.fields[id] = { id, site: place.id, poi, stage, growth, care: stage === 'fallow' ? 0 : 14, days: stage === 'fallow' ? 0 : 20, tended: -1, job: null, sown: stage === 'fallow' ? null : state.tick - day * TICKS_PER_DAY % (20 * TICKS_PER_DAY) };
  });
}

export function ensureBuilding(state, catalog, id) {
  let b = state.buildings[id];
  if (!b) {
    const site = catalog.buildingSite[id];
    const def = catalog.byId[site]?.byBuilding[id];
    if (!def) return null;
    b = state.buildings[id] = { id, site, use: def.use, cond: 100, stage: 'complete', model: def.model, project: null, incident: null, job: null, event: null, lastIncident: null };
  }
  return b;
}

export function createProject(state, catalog, site, building, kind, cause, damage = 0) {
  const def = PROJECTS[kind];
  const b = ensureBuilding(state, catalog, building);
  const id = allocate(state, 'project');
  const scale = kind === 'repair' ? Math.max(0.25, damage / 100) : 1;
  const stages = def.stages.map(s => ({ name: s.name, model: s.model || null, labor: Math.max(60, Math.round(s.labor * scale)),
    materials: Object.fromEntries(Object.entries(s.materials).map(([g, n]) => [g, Math.max(1, Math.round(n * scale))])) }));
  state.projects[id] = { id, kind, site, building, stages, stage: 0, delivered: {}, inbound: {}, labor: 0, booked: 0, crew: 0, status: 'active', blocked: null, cause, event: null, started: state.tick, completed: null };
  b.project = id;
  if (kind === 'watchtower') { b.stage = 'construction'; b.model = stages[0].model; b.use = 'construction'; }
  return state.projects[id];
}
