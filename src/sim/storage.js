import { SCHEMA_VERSION, GOODS, STOCK_LIMIT, createState } from './state.js';
import { materialBalance } from './economy.js';

export const SAVE_KEY = 'sosaria-world-v1';
export const BACKUP_KEY = `${SAVE_KEY}-previous`;
const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = () => { throw new Error('The world save is incomplete or inconsistent.'); };

// Schema v1 is the first persisted world format. Future migrations enter here;
// unknown schemas and changed authored layouts must never be loaded optimistically.
export function parseSnapshot(text, catalog) {
  if (typeof text !== 'string' || text.length > 4_000_000) throw new Error('World save is too large.');
  const s = JSON.parse(text);
  if (s?.schemaVersion !== SCHEMA_VERSION) throw new Error('This world save uses an unsupported version.');
  if (s.catalog !== catalog.signature) throw new Error('This save belongs to a different world layout.');
  if (typeof s.seed !== 'string' || !s.seed.length || s.seed.length > 80 || !integer(s.tick) || !integer(s.nextId, 1)) fail();
  const clean = (v, depth = 0) => {
    if (depth > 15) fail();
    if (typeof v === 'number' && !Number.isFinite(v)) fail();
    if (typeof v === 'string' && v.length > 3000) fail();
    if (v && typeof v === 'object') for (const [k, value] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(k)) fail();
      clean(value, depth + 1);
    }
  };
  clean(s);
  const base = createState(catalog, s.seed);
  for (const key of ['settlements', 'residents', 'buildings', 'routes', 'ledger']) if (!object(s[key])) fail();
  for (const key of ['trips', 'facts', 'reports', 'commands']) if (!Array.isArray(s[key]) || s[key].length > 4000) fail();
  for (const key of ['settlements', 'residents', 'routes']) if (Object.keys(s[key]).sort().join('|') !== Object.keys(base[key]).sort().join('|')) fail();
  for (const [id, t] of Object.entries(s.settlements)) {
    if (t.id !== id || t.population !== base.settlements[id].population || !object(t.stocks) || GOODS.some(g => !integer(t.stocks[g], 0, STOCK_LIMIT)) || !integer(t.water, 0, 100) ||
      typeof t.shortage !== 'boolean' || !integer(t.lastFire, -4200) || !integer(t.outcomes) || !integer(t.unmetMeals) ||
      !Array.isArray(t.known) || t.known.length > 32 || !Array.isArray(t.history) || t.history.length > 24) fail();
  }
  for (const [id, r] of Object.entries(s.residents)) {
    const b = base.residents[id];
    if (r.id !== id || r.site !== b.site || !s.settlements[r.location] || !integer(r.returnAfter) || r.name !== b.name || r.role !== b.role || JSON.stringify(r.home) !== JSON.stringify(b.home) ||
      JSON.stringify(r.work) !== JSON.stringify(b.work) || !Array.isArray(r.memories) || r.memories.length > 8) fail();
  }
  const ids = new Set();
  for (const records of [s.facts, s.trips, s.reports, s.commands]) for (const r of records) {
    if (!object(r) || typeof r.id !== 'string' || !/^(event|trip|report|command):[1-9]\d*$/.test(r.id) || ids.has(r.id) || +r.id.split(':')[1] >= s.nextId) fail();
    ids.add(r.id);
  }
  const factIds = new Set(s.facts.map(f => f.id));
  for (const f of s.facts) if (!integer(f.tick, 0, s.tick) || typeof f.text !== 'string' || typeof f.type !== 'string' || !s.settlements[f.where] ||
    !['happening', 'resolved', 'reported', 'legend', 'disputed'].includes(f.status) || !Array.isArray(f.actors) || !Array.isArray(f.causeIds) || f.causeIds.some(id => !factIds.has(id))) fail();
  for (const t of Object.values(s.settlements)) if ([...t.known, ...t.history, ...(t.shortageFact ? [t.shortageFact] : [])].some(id => !factIds.has(id))) fail();
  for (const r of Object.values(s.residents)) if (r.memories.some(id => !factIds.has(id))) fail();
  for (const [id, b] of Object.entries(s.buildings)) {
    if (b.id !== id || !catalog.byId[b.site]?.buildings.some(x => x.id === id && x.combustible) || !integer(b.condition, 0, 100) ||
      !['burning', 'damaged', 'repairing', 'repaired'].includes(b.status) || !integer(b.started, 0, s.tick) || !integer(b.endTick, b.started) ||
      !integer(b.repairAt, b.endTick) || !factIds.has(b.fact) || b.repairFact && !factIds.has(b.repairFact)) fail();
  }
  for (const r of Object.values(s.routes)) if (!integer(r.closedUntil) || r.cause !== null && typeof r.cause !== 'string') fail();
  for (const t of s.trips) {
    const edge = catalog.edges.find(e => e.id === t.route);
    if (!edge || !s.residents[t.carrier] || ![edge.a, edge.b].includes(t.from) || ![edge.a, edge.b].includes(t.to) || t.from === t.to ||
      !['travelling', 'delivered', 'lost'].includes(t.status) || !integer(t.departed, 0, s.tick) || t.duration !== edge.duration || !integer(t.progress, 0, t.duration) ||
      !integer(t.etaTick) || !object(t.cargo) || Object.entries(t.cargo).some(([g, n]) => !GOODS.includes(g) || !integer(n, 1, STOCK_LIMIT)) || !Array.isArray(t.reports) ||
      t.status === 'travelling' && (!factIds.has(t.fact) || t.completed !== null) || t.status !== 'travelling' && !integer(t.completed, t.departed, s.tick)) fail();
  }
  for (const r of s.reports) if (!factIds.has(r.factId) || !s.settlements[r.from] || !s.settlements[r.to] || !s.residents[r.carrier] ||
    !integer(r.sent, 0, s.tick) || r.received !== null && !integer(r.received, r.sent, s.tick) || r.received === null && !s.trips.some(t => t.id === r.trip) ||
    !['reported', 'legend'].includes(r.truthStatus)) fail();
  for (const key of ['initial', 'produced', 'consumed', 'lost']) if (!object(s.ledger[key]) || GOODS.some(g => !integer(s.ledger[key][g]))) fail();
  if (Object.values(materialBalance(s)).some(n => n !== 0)) fail();
  return s;
}

export const snapshot = state => JSON.stringify(state);

export function loadWorld(storage, catalog) {
  let warning = '';
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const state = parseSnapshot(raw, catalog);
      return { state, warning: key === BACKUP_KEY ? 'Recovered the previous world snapshot. The unreadable save has been retained.' : warning };
    } catch (error) { warning = `Could not restore a world snapshot: ${error.message}`; }
  }
  return { state: null, warning };
}

export function saveWorld(storage, state, catalog) {
  const data = snapshot(state);
  // Validate before writing, and never replace the recovery slot with a corrupt primary.
  parseSnapshot(data, catalog);
  const previous = storage.getItem(SAVE_KEY);
  if (previous) {
    try { parseSnapshot(previous, catalog); storage.setItem(BACKUP_KEY, previous); }
    catch { storage.setItem(`${SAVE_KEY}-unreadable`, previous); }
  }
  storage.setItem(SAVE_KEY, data);
}
