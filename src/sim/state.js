import { hashString } from '../core/noise.js';
import { randomAt, DEFAULT_SEED } from './rng.js';
import { hourAt } from './time.js';

export const GOODS = ['grain', 'flour', 'bread', 'fish', 'timber', 'iron', 'tools', 'coin'];
export const SLICE = ['millbrook', 'brightwater', 'highmoor'];
export const SCHEMA_VERSION = 1;
export const STOCK_LIMIT = 1000;
export const POPULATION = { capital: 150, city: 100, port: 70, town: 64, village: 34, hamlet: 14, castle: 24, fort: 18, hold: 48, mine: 18,
  enclave: 44, glade: 18, circle: 10, camp: 40, temple: 56, necropolis: 40, barrow: 8, monastery: 14, ruin: 0, stilts: 24, lighthouse: 8 };
export const emptyGoods = () => Object.fromEntries(GOODS.map(g => [g, 0]));
const FIRST = ['Brenna', 'Aldric', 'Edda', 'Rowan', 'Tamsin', 'Perrin', 'Gwen', 'Niall'];
const LAST = ['Ashdown', 'Miller', 'Hollis', 'Marsh', 'Wren', 'Barrow', 'Cobb', 'Greaves'];
const CULTURAL = {
  elf: ['Elowen', 'Moonweaver'], dwarf: ['Dagna', 'Ironhand'], fae: ['Sorrel', 'Lanternfoot'],
  beast: ['Ursa', 'Longstride'], undead: ['Sexton Voss', 'the Restless'], draconic: ['Kesh', 'Emberclaw'],
};

// Strip the scene down to immutable, JSON-compatible simulation inputs.
export function catalogFromWorld(sites, roads) {
  const places = sites.map(site => ({
    id: site.s.id, name: site.s.name, culture: site.s.culture, kind: site.s.kind, lat: site.s.lat, lon: site.s.lon,
    plaza: { x: site.plaza[0], y: site.plaza[1] },
    buildings: site.doors.map(d => ({ id: d.item.id, model: d.item.model, kind: d.kind, x: d.x, y: d.y,
      combustible: /^(house|cottage|farmhouse)/.test(d.item.model) })),
    work: site.work.map(w => ({ kind: w.kind, x: w.x, y: w.y })),
  }));
  const edges = roads.filter(r => places.some(s => s.id === r.a) && places.some(s => s.id === r.b)).map(r => {
    let length = 0;
    for (let i = 1; i < r.dirs.length; i++) {
      const a = r.dirs[i - 1], b = r.dirs[i];
      length += Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 100;
    }
    return { id: `road:${r.a}:${r.b}`, a: r.a, b: r.b, duration: Math.max(60, Math.ceil(length / 0.07)) };
  });
  return makeCatalog(places, edges);
}

export function makeCatalog(places, edges) {
  const signature = String(hashString(JSON.stringify({ places, edges })));
  return { places, edges, signature, byId: Object.fromEntries(places.map(p => [p.id, p])) };
}

export function createState(catalog, seed = DEFAULT_SEED) {
  const state = { schemaVersion: SCHEMA_VERSION, catalog: catalog.signature, seed: String(seed).trim().slice(0, 80) || DEFAULT_SEED, tick: 0,
    nextId: 1, settlements: {}, residents: {}, buildings: {}, routes: {}, trips: [], facts: [], reports: [],
    commands: [], ledger: { initial: emptyGoods(), produced: emptyGoods(), consumed: emptyGoods(), lost: emptyGoods() } };
  for (const p of catalog.places) {
    const stocks = { grain: 12, flour: 12, bread: 24, fish: 20, timber: 30, iron: 10, tools: 12, coin: 80 };
    if (p.id === 'millbrook') stocks.grain = 120;
    if (p.id === 'brightwater') { stocks.grain = 24; stocks.flour = 40; }
    if (p.id === 'highmoor') { stocks.flour = 6; stocks.bread = 12; }
    state.settlements[p.id] = { id: p.id, population: POPULATION[p.kind] ?? 20, stocks, water: 100, shortage: false, shortageFact: null,
      lastFire: -4200, known: [], history: [], outcomes: 0, unmetMeals: 0 };
    for (const g of GOODS) state.ledger.initial[g] += stocks[g];
    const homes = p.buildings.filter(b => b.kind === 'home' || b.kind === 'farm');
    const craft = p.id === 'millbrook' ? 'farmer' : p.id === 'brightwater' ? 'miller' : 'baker';
    const roles = p.culture === 'ruin' ? [] : p.culture === 'human' ? ['guard', craft, 'merchant', 'innkeeper', 'smith', 'farmer'] : ['guard', 'merchant', 'priest'];
    roles.forEach((role, i) => {
      const id = `person:${p.id}:${i}`;
      const h = homes[i % Math.max(1, homes.length)] || p.plaza;
      const work = role === 'farmer' ? p.work.find(w => w.kind === 'field') : role === 'merchant' ? p.work.find(w => w.kind === 'stall') :
        role === 'baker' ? p.buildings.find(b => b.model === 'granary') :
        p.buildings.find(b => b.kind === ({ innkeeper: 'tavern', smith: 'smithy', miller: 'mill', guard: 'guard', priest: 'temple' }[role] || role));
      const n = Math.floor(randomAt(state.seed, 'name', id) * FIRST.length);
      const [first, last] = CULTURAL[p.culture] || [FIRST[n], LAST[(n + i) % LAST.length]];
      state.residents[id] = { id, site: p.id, location: p.id, returnAfter: 0, role, name: `${first} ${last}${p.culture !== 'human' && i ? ` ${i + 1}` : ''}`,
        home: { x: h.x, y: h.y, building: h.id || null }, work: { x: (work || p.plaza).x, y: (work || p.plaza).y, building: work?.id || null },
        memories: [] };
    });
  }
  for (const edge of catalog.edges) state.routes[edge.id] = { closedUntil: 0, cause: null };
  const origin = state.settlements.highmoor || Object.values(state.settlements)[0];
  if (origin) for (const text of [
    'They say the Drifting Spire sinks a finger-width every winter and rises again by spring.',
    'The monks at Hollowmere say Old Aurum has not landed in living memory.',
  ]) {
    const f = { id: nextId(state, 'event'), tick: 0, type: 'legend', where: origin.id, text, status: 'legend', causeIds: [], actors: [], evidence: 'An unverified traditional account' };
    state.facts.push(f); origin.known.push(f.id); origin.history.push(f.id);
  }
  return state;
}

export function nextId(state, type) { return `${type}:${state.nextId++}`; }
export function remember(person, factId) {
  if (!person.memories.includes(factId)) person.memories.push(factId);
  person.memories = person.memories.slice(-8);
}

// An absolute-time itinerary: inspecting or unloading a person cannot change their life.
export function residentSchedule(state, person, catalog, seconds = state.tick) {
  const p = catalog.byId[person.site], town = state.settlements[person.site];
  const hour = hourAt(seconds, p.lon), day = Math.floor(seconds / 420);
  const fire = Object.values(state.buildings).find(b => b.site === person.site && b.status === 'burning');
  const home = state.buildings[person.home.building]?.condition < 70 ? p.plaza : person.home;
  const night = p.culture === 'undead' ? hour > 7 && hour < 18 : hour < 6 || hour > 21;
  if (fire) {
    const b = p.buildings.find(b => b.id === fire.id);
    return { from: p.plaza, to: b || p.plaza, progress: Math.min(1, (seconds - fire.started) / 15),
      activity: 'passing buckets', inside: false, key: fire.fact };
  }
  if (person.role === 'guard') {
    const phase = seconds % 80 / 80;
    return { from: phase < 0.5 ? person.work : p.plaza, to: phase < 0.5 ? p.plaza : person.work,
      progress: phase % 0.5 * 2, activity: 'keeping watch', inside: false, key: `patrol:${Math.floor(seconds / 40)}` };
  }
  const atWork = hour >= 7 && hour < 18;
  const to = night ? home : atWork ? person.work : p.plaza;
  const from = night ? p.plaza : atWork ? home : person.work;
  const since = night ? (hour >= 21 ? hour - 21 : hour + 3) : atWork ? hour - 7 : hour >= 18 ? hour - 18 : hour - 6;
  let activity = night ? (home === p.plaza ? 'sheltering after the fire' : 'at home') : atWork ? `working as ${person.role}` : 'visiting the market';
  if (atWork && person.role === 'baker' && town.stocks.flour < 2) activity = 'waiting for flour';
  return { from, to, progress: Math.min(1, Math.max(0, since * 420 / 24 / 18)), activity,
    inside: night && home !== p.plaza && since > 1, key: `${day}:${night ? 'home' : atWork ? 'work' : 'market'}:${home === p.plaza ? 'displaced' : 'housed'}` };
}
