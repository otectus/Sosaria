// Save migrations. Schema 1 was the first living-world format (localStorage, one tick per world
// second, a six-person named cast per town). Its history, cast, damage and road closures carry
// over; its toy economy is rebased onto the schema 2 scenario stocks, and that is recorded.
import { TICKS_PER_DAY } from './clock.js';
import { createWorld, ensureBuilding } from './world-state.js';
import { commit } from './history.js';
import { afterDamage } from './buildings.js';
import { schedule } from './schedule.js';
import { OCCUPATIONS } from '../content/occupations.js';
import { parseText, validateState, SaveError } from './snapshot.js';
export { signatureV1 } from './legacy.js';

const V1_SECONDS_PER_DAY = 420;
export const v1Tick = seconds => Math.round(seconds * TICKS_PER_DAY / V1_SECONDS_PER_DAY);

export function migrateV1(raw, catalog) {
  if (!catalog.legacy?.v1 || raw.catalog !== catalog.legacy.v1) throw new SaveError('This old save belongs to a different world layout.', 'layout');
  if (typeof raw.seed !== 'string' || !Number.isSafeInteger(raw.tick) || raw.tick < 0 || !Array.isArray(raw.facts) || typeof raw.residents !== 'object') {
    throw new SaveError('The old world save is incomplete or inconsistent.', 'invalid');
  }
  const start = v1Tick(raw.tick);
  const state = createWorld(catalog, raw.seed, catalog.scenario, { start });
  const notes = [];
  const map = new Map();
  const lore = new Map(state.events.filter(e => e.k === 'legend').map(e => [e.d.text, e.id]));
  const facts = raw.facts.filter(f => f && typeof f.id === 'string' && typeof f.text === 'string').slice().sort((a, b) => a.tick - b.tick || +a.id.split(':')[1] - +b.id.split(':')[1]);
  for (const f of facts) {
    if (f.status === 'legend' && lore.has(f.text)) { map.set(f.id, lore.get(f.text)); continue; }
    const where = state.settlements[f.where] ? f.where : 'highmoor';
    const e = commit(state, 'legacy', where, { text: f.text.slice(0, 600), type: String(f.type || 'record').slice(0, 40), status: f.status, legacy: f.id },
      { importance: f.type?.includes('fire') ? 2 : 1, causes: (f.causeIds || []).map(id => map.get(id)).filter(Boolean) });
    e.t = Math.min(start, v1Tick(f.tick | 0));
    map.set(f.id, e.id);
  }
  let cast = 0;
  for (const [id, r] of Object.entries(raw.residents)) {
    const p = state.residents[id];
    if (!p || typeof r?.name !== 'string') continue;
    p.name = r.name.slice(0, 120);
    if (OCCUPATIONS[r.role]) p.occupation = r.role;
    for (const m of r.memories || []) { const e = map.get(m); if (e) p.memories.push({ e, r: 'witness', t: start }); }
    p.memories = p.memories.slice(-8);
    cast++;
  }
  for (const [id, t] of Object.entries(raw.settlements || {})) {
    const town = state.settlements[id];
    if (!town) continue;
    for (const f of t.known || []) { const e = map.get(f); if (e && !town.known.includes(e)) town.known.push(e); }
    town.known = town.known.slice(-48);
  }
  let damaged = 0;
  for (const [id, b] of Object.entries(raw.buildings || {})) {
    if (!catalog.buildingSite[id] || !Number.isSafeInteger(b.condition) || b.status === 'repaired') continue;
    const rec = ensureBuilding(state, catalog, id);
    rec.cond = Math.max(1, Math.min(99, b.condition));
    afterDamage(state, catalog, id, map.get(b.repairFact) || map.get(b.fact) || null);
    damaged++;
  }
  for (const [id, r] of Object.entries(raw.routes || {})) {
    if (!catalog.edgeById[id] || !(r.closedUntil > raw.tick)) continue;
    state.closures[id] = { until: v1Tick(r.closedUntil), cause: map.get(r.cause) || null, kind: 'closed' };
    schedule(state, v1Tick(r.closedUntil), 'contract', 'reopen', { id });
  }
  const travelling = (raw.trips || []).filter(t => t.status === 'travelling').length;
  notes.push('Settlement stocks and the economy were rebased onto the schema 2 starting stocks.');
  if (travelling) notes.push(`${travelling} journeys in progress were completed before migration; their carriers start at home.`);
  commit(state, 'migration', 'highmoor', { from: 1, to: 2, facts: map.size, cast, damaged, closures: Object.keys(state.closures).length, notes, v1Tick: raw.tick }, { importance: 3 });
  state.migratedFrom = { schema: 1, tick: raw.tick, catalog: raw.catalog };
  return validateState(state, catalog);
}

// Any supported save text into a validated current-schema world. Never mutates the input.
export function loadText(text, catalog) {
  const raw = parseText(text);
  if (raw?.schemaVersion === 1) return { state: migrateV1(raw, catalog), migrated: 1 };
  return { state: validateState(raw, catalog), migrated: 0 };
}
