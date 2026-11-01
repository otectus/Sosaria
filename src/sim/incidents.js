// Fire incidents (Section 8.2). Ignition, detection, alarm, response roles, bucket lines limited by
// approach slots and well capacity, building damage, bounded loss of real stored goods, spread,
// and an explicit resolution. Smoke and flames are presentation; this state machine is the fire.
import { FLAMMABLE } from '../content/goods.js';
import { OCCUPATIONS } from '../content/occupations.js';
import { allocate } from './ids.js';
import { poiNode, walkDistance, SPEED } from './catalog.js';
import { localMinute } from './clock.js';
import { weatherAt } from './weather.js';
import { random } from './rng.js';
import { held, lose, transfer } from './inventory.js';
import { commit, learn } from './history.js';
import { ensureBuilding } from './world-state.js';
import { afterDamage, usableStores, functional } from './buildings.js';
import { interrupt, remember, tie } from './residents.js';
import { carryOf } from './production.js';

export const FUEL = { granary: 900, barn: 750, home: 480, farmstead: 560, tavern: 600, mill: 520, stable: 520, bakery: 520, workshop: 500 };
const SLOTS = { granary: 10, barn: 8, mill: 6, tavern: 8 };
const ACTIVE = new Set(['burning', 'abandoned']);

export const activeFires = (state, site) => { const t = state.settlements[site]; return t && t.fires.length ? t.fires.map(id => state.incidents[id]).filter(x => x && ACTIVE.has(x.status)) : []; };

export function canIgnite(state, catalog, siteId, buildingId) {
  const place = catalog.byId[siteId], def = place?.byBuilding[buildingId];
  if (!def) return 'That building does not exist.';
  if (!def.combustible) return 'That building is stone and will not catch.';
  const b = state.buildings[buildingId];
  if (b?.incident) return 'That building is already burning.';
  if (b && b.cond <= 0) return 'That building is already a ruin.';
  if (!state.rules.destructiveIncidents) return 'Destructive emergencies are disabled by the world rules.';
  return null;
}

export function ignite(state, catalog, siteId, buildingId, { cause = null, origin = 'natural', detail = {} } = {}) {
  if (canIgnite(state, catalog, siteId, buildingId)) return null;
  const place = catalog.byId[siteId], b = ensureBuilding(state, catalog, buildingId), inv = `inv:${buildingId}`;
  const stored = FLAMMABLE.reduce((n, g) => n + held(state, inv, g), 0);
  const fuel = Math.min(2000, (FUEL[b.use] || 450) * b.cond / 100 + Math.floor(stored / 4));
  const id = allocate(state, 'incident');
  const e = commit(state, 'fire_started', siteId, { incident: id, building: buildingId, use: b.use, origin, ...detail },
    { causes: [cause], importance: 2, local: false });
  state.incidents[id] = { id, kind: 'fire', site: siteId, building: buildingId, use: b.use, status: 'burning', origin, ignited: state.tick,
    detected: null, alarm: null, intensity: 140, fuel, fuel0: fuel, peak: 140, water: 0, buckets: 0, responders: {}, lost: {}, damage: 0, dmgAcc: 0,
    cause: e.id, events: { start: e.id }, ended: null, outcome: null, idleSince: null, spreadTo: [] };
  b.incident = id; b.lastIncident = e.id;
  state.settlements[siteId].fires.push(id);
  return state.incidents[id];
}

// People avoid the burning building unless they have a response role.
export function closureFor(state, catalog, siteId) {
  const fires = activeFires(state, siteId);
  if (!fires.length) return null;
  const place = catalog.byId[siteId];
  const centers = fires.map(f => place.byBuilding[f.building]).filter(Boolean);
  const key = `fire:${fires.map(f => f.id).join(',')}`;
  return { key, blocked: node => centers.some(c => Math.hypot(place.nav.nodes[node][0] - c.x, place.nav.nodes[node][1] - c.y) < 0.28) };
}

function detectionDelay(state, catalog, place, x) {
  const m = localMinute(state.tick, place.offset), night = m < 360 || m >= 1260;
  const watchers = Object.values(state.residents).filter(p => p.at.site === place.id && !p.journey && p.task?.k === 'duty' && p.task.why?.duty === 'watch').length;
  const tower = Object.values(state.buildings).some(b => b.site === place.id && b.use === 'watchtower' && functional(state, b.id));
  return Math.max(2, (night ? 22 : 7) - Math.min(4, watchers) - (tower ? 5 : 0));
}

// Response roles, assigned once per person in a stable order when the alarm sounds.
function assignRoles(state, catalog, x, place) {
  const fire = place.byBuilding[x.building], slots = SLOTS[x.use] || 6;
  const present = Object.values(state.residents).filter(p => p.at.site === place.id && !p.journey).sort((a, b) => (a.id < b.id ? -1 : 1));
  let buckets = 0, water = 0, guards = 0, salvage = 0;
  const stock = FLAMMABLE.reduce((n, g) => n + held(state, `inv:${x.building}`, g), 0);
  for (const p of present) {
    let role;
    const h = state.households[p.household];
    const home = h?.home ? place.byBuilding[h.home] : null;
    const near = home && Math.hypot(home.x - fire.x, home.y - fire.y) < 0.6;
    const hasChildren = h && h.members.some(m => state.residents[m].age === 'child');
    if (p.species === 'undead' && place.culture !== 'undead') role = 'watch';
    else if (p.age === 'child' || p.age === 'elder') role = 'shelter';
    else if (near && hasChildren && !p.traits.includes('brave')) role = 'protect';
    else if (p.occupation === 'guard' && guards < 2) { role = 'guard'; guards++; }
    else if ((p.occupation === 'storekeeper' || x.use === 'granary' && p.occupation === 'baker') && stock > 0 && salvage < 3) { role = 'salvage'; salvage++; }
    else if (buckets < slots) { role = 'buckets'; buckets++; }
    else if (water < 8) { role = 'water'; water++; }
    else role = 'watch';
    x.responders[p.id] = role;
    p.needs.safety = Math.max(0, p.needs.safety - (near ? 5000 : 2500));
  }
}

export function fireRole(state, catalog, p, place) {
  const x = activeFires(state, place.id).find(f => f.alarm !== null && f.alarm <= state.tick && f.responders[p.id]);
  if (!x) return null;
  const role = x.responders[p.id];
  const fire = place.byBuilding[x.building];
  const firePoi = fire.poi, dur = 30;
  const why = { key: 'respond', incident: x.id, role };
  if (role === 'buckets') return { k: 'respond', node: poiNode(place, firePoi), dur, run: true, ignoreClosures: true, why, pose: ['carry', 'bucket'] };
  if (role === 'water') return { k: 'respond', node: poiNode(place, place.wells[p.appearance % place.wells.length]), dur, run: true, why, pose: ['carry', 'bucket'] };
  if (role === 'guard') return { k: 'respond', node: poiNode(place, place.poi.plaza), dur, run: true, why, pose: ['guard', 'spear'] };
  if (role === 'salvage') {
    if (x.intensity > 700) return { k: 'respond', node: poiNode(place, place.poi.plaza), dur, run: true, why: { ...why, role: 'salvage_halted' }, pose: ['point', 'none'] };
    const carry = carryOf(p);
    if (Object.keys(state.inventories[carry]?.goods || {}).length) {
      const safe = usableStores(state, place, 'reserve')[0] || usableStores(state, place, 'food')[0];
      const node = safe?.startsWith('inv:building:') ? poiNode(place, place.byBuilding[safe.slice(4)].poi) : poiNode(place, place.poi.market);
      return { k: 'salvage', node, dur: 6, run: true, why: { ...why, stage: 'carry_out', to: safe }, pose: ['carry', 'sack'] };
    }
    return { k: 'salvage', node: poiNode(place, firePoi), dur: 8, run: true, ignoreClosures: true, why: { ...why, stage: 'load' }, pose: ['carry', 'sack'] };
  }
  const h = state.households[p.household];
  const home = h?.home && !h.displaced ? place.byBuilding[h.home] : null;
  const safeHome = home && Math.hypot(home.x - fire.x, home.y - fire.y) > 0.6;
  const refuge = place.temples[0] ? poiNode(place, place.byBuilding[place.temples[0]].poi) : poiNode(place, place.poi.plaza);
  if (role === 'protect') return { k: 'respond', node: home ? poiNode(place, home.poi) : refuge, dur, run: true, ignoreClosures: true, why, pose: ['run', 'none'] };
  if (role === 'shelter') return { k: 'respond', node: safeHome ? poiNode(place, home.poi) : refuge, dur, run: true, inside: !!safeHome, why, pose: ['flee', 'none'] };
  return { k: 'respond', node: poiNode(place, place.gathers[p.appearance % Math.max(1, place.gathers.length)] ?? place.poi.plaza), dur, why, pose: ['point', 'none'] };
}

// Salvage completes in steps: load goods from the burning store, carry them to a safe one.
export function salvageStep(state, catalog, p) {
  const t = p.task;
  if (!t || t.k !== 'salvage' || state.tick < t.end) return;
  const x = state.incidents[t.why.incident];
  const carry = carryOf(p);
  if (t.why.stage === 'load' && x && ACTIVE.has(x.status)) {
    const inv = `inv:${x.building}`;
    let room = 24;
    for (const g of ['flour', 'grain', 'bread', 'provisions']) {
      const n = Math.min(room, held(state, inv, g) - (state.inventories[inv]?.reserved[g] || 0));
      if (n > 0 && transfer(state, inv, carry, { [g]: n })) { room -= n; x.saved = x.saved || {}; x.saved[g] = (x.saved[g] || 0) + n; }
      if (room <= 0) break;
    }
  } else if (t.why.stage === 'carry_out') {
    const goods = { ...state.inventories[carry]?.goods };
    const to = t.why.to || catalog.byId[p.at.site].stores.food[0];
    if (Object.keys(goods).length) transfer(state, carry, to, goods);
  }
}

// One tick of every active fire.
export function incidentTick(state, catalog) {
  for (const town of Object.values(state.settlements)) if (town.fires.length) for (const id of [...town.fires]) {
    const x = state.incidents[id];
    if (!x || !ACTIVE.has(x.status)) continue;
    const place = catalog.byId[x.site], town = state.settlements[x.site], t = state.tick;
    if (x.detected === null && t - x.ignited >= detectionDelay(state, catalog, place, x)) {
      x.detected = t; x.alarm = t + 2;
      const e = commit(state, 'fire_alarm', x.site, { incident: x.id, building: x.building, delay: t - x.ignited }, { causes: [x.cause], importance: 2 });
      x.events.alarm = e.id;
    }
    if (x.alarm === t) {
      assignRoles(state, catalog, x, place);
      for (const id of Object.keys(x.responders)) interrupt(state, catalog, state.residents[id]);
    }
    const w = weatherAt(place, t);
    // Bucket line: arrived liners pass water drawn by arrived carriers, limited by the well.
    let liners = 0, carriers = 0;
    for (const [id, role] of Object.entries(x.responders)) {
      const p = state.residents[id];
      if (!p || p.journey || p.task?.k !== 'respond' || p.task.why?.incident !== x.id || t < p.task.arr) continue;
      if (role === 'buckets') liners++; else if (role === 'water') carriers++;
    }
    const drawn = Math.min(liners + Math.floor(carriers / 2), Math.floor(town.water.level / 4), 12);
    town.water.level = Math.max(0, town.water.level - drawn * 4);
    x.water += drawn; x.buckets = drawn;
    const grow = x.fuel > 0 ? Math.floor(x.intensity * (40 + town.dryness * 0.6 + w.wind * 0.4) / 4000) + 4 : -25;
    x.intensity = Math.max(0, Math.min(1000, x.intensity + grow - drawn * 7 - Math.floor(w.rain / 4)));
    x.peak = Math.max(x.peak, x.intensity);
    x.fuel = Math.max(0, x.fuel - Math.ceil(x.intensity / 40));
    // Damage and bounded losses of what is really stored there; each lost unit is recorded once.
    x.dmgAcc += x.intensity;
    const dmg = Math.floor(x.dmgAcc / 300);
    if (dmg) { x.dmgAcc -= dmg * 300; const b = ensureBuilding(state, catalog, x.building); const d = Math.min(dmg, b.cond); b.cond -= d; x.damage += d; }
    const inv = `inv:${x.building}`;
    for (const g of FLAMMABLE) {
      const h = held(state, inv, g);
      if (!h) continue;
      const n = Math.floor(h * x.intensity / 60000) + (x.intensity > 500 && h > 0 ? 1 : 0);
      const k = lose(state, inv, g, n, 'burned');
      if (k) x.lost[g] = (x.lost[g] || 0) + k;
    }
    // Spread to a neighbouring combustible building in strong wind.
    if (x.intensity > 600 && w.wind > 45 && t % 10 === 0 && x.spreadTo.length < 2) {
      const src = place.byBuilding[x.building];
      const next = place.buildings.filter(b => b.combustible && b.id !== x.building && !state.buildings[b.id]?.incident && Math.hypot(b.x - src.x, b.y - src.y) < 0.4)
        .sort((a, b) => Math.hypot(a.x - src.x, a.y - src.y) - Math.hypot(b.x - src.x, b.y - src.y) || (a.id < b.id ? -1 : 1))[0];
      if (next && random(state, 'incidents') < (x.intensity - 600) / 1500 * (w.wind / 100)) {
        const y = ignite(state, catalog, x.site, next.id, { cause: x.cause, origin: 'spread', detail: { from: x.building, wind: w.wind } });
        if (y) { x.spreadTo.push(y.id); y.detected = t; y.alarm = t + 1; }
      }
    }
    // Unattended fires are left to burn out; a contained fire is put out.
    if (x.alarm !== null && t > x.alarm + 45 && liners === 0) x.idleSince ??= t;
    if (liners) x.idleSince = null;
    if (x.status === 'burning' && x.idleSince !== null && t - x.idleSince > 60 && x.intensity > 250) {
      x.status = 'abandoned';
      x.events.abandoned = commit(state, 'fire_abandoned', x.site, { incident: x.id, building: x.building, intensity: x.intensity }, { causes: [x.cause], importance: 2 }).id;
    }
    if (x.intensity <= 30 && (drawn > 0 || x.fuel <= 0) || x.intensity === 0) resolveFire(state, catalog, x, drawn > 0 && x.fuel > 0 ? 'extinguished' : 'burned_out');
  }
}

function resolveFire(state, catalog, x, outcome) {
  const place = catalog.byId[x.site], b = ensureBuilding(state, catalog, x.building);
  if (b.cond <= 0) outcome = 'destroyed';
  x.status = outcome; x.outcome = outcome; x.ended = state.tick;
  b.incident = null;
  const fires = state.settlements[x.site].fires;
  fires.splice(fires.indexOf(x.id), 1);
  const responders = Object.entries(x.responders);
  const e = commit(state, 'fire_resolved', x.site, {
    incident: x.id, building: x.building, use: x.use, outcome, cond: b.cond, damage: x.damage, lost: x.lost, saved: x.saved || {},
    duration: state.tick - x.ignited, detectedAfter: x.detected === null ? null : x.detected - x.ignited, water: x.water,
    responders: responders.filter(([, r]) => r === 'buckets' || r === 'water').length, peak: x.peak,
  }, { causes: [x.cause, x.events.alarm, x.events.abandoned], importance: 3, actors: responders.filter(([, r]) => r === 'buckets').map(([id]) => id).slice(0, 6) });
  x.events.resolved = e.id;
  b.lastIncident = x.cause;
  // Those who answered the bell remember it, and the line binds neighbours together.
  const liners = responders.filter(([, r]) => r === 'buckets' || r === 'water').map(([id]) => id);
  for (const [id, role] of responders) {
    const p = state.residents[id];
    if (!p) continue;
    if (role !== 'watch') remember(state, p, e.id, role);
    if (liners.includes(id)) for (const other of liners.slice(0, 4)) if (other !== id) tie(p, other, 'neighbour', 6);
    interrupt(state, catalog, p);
  }
  afterDamage(state, catalog, x.building, e.id);
  learn(state.settlements[x.site], e.id);
  return e;
}

// Natural ignition: dry weather and working hearths, checked hourly, never near the camera.
export function ignitionCheck(state, catalog) {
  if (!state.rules.destructiveIncidents || state.rules.ignition <= 0) return;
  for (const place of catalog.places) {
    if (place.economy !== 'detailed') continue;
    const town = state.settlements[place.id];
    if (activeFires(state, place.id).length) continue;
    const hearths = Object.values(state.jobs).filter(j => j.site === place.id && (j.recipe === 'bake' || j.recipe === 'forge') && j.step === 'work').length;
    if (!hearths) continue;
    const w = weatherAt(place, state.tick);
    if (w.rain > 30) continue;
    const risk = (town.dryness / 100) ** 2 * hearths * (0.5 + w.wind / 100) * 0.0015 * state.rules.ignition / 100;
    if (random(state, 'incidents') >= risk) continue;
    const near = place.buildings.filter(b => b.combustible && (b.use === 'bakery' || b.use === 'granary' || b.use === 'home' && place.bakeries.some(k => Math.hypot(place.byBuilding[k].x - b.x, place.byBuilding[k].y - b.y) < 0.5)));
    if (!near.length) continue;
    const b = near[Math.floor(random(state, 'incidents') * near.length)];
    const e = commit(state, 'ignition', place.id, { building: b.id, dryness: town.dryness, wind: w.wind, hearths }, { importance: 1, local: false });
    ignite(state, catalog, place.id, b.id, { cause: e.id, origin: 'natural', detail: { dryness: town.dryness, wind: w.wind } });
  }
}

export { OCCUPATIONS, SPEED, walkDistance };
