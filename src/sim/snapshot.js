// Serialization, canonical hashing and validation of saved worlds. A save is validated in full
// before it replaces a running world: schema, layout, value types, references and conservation.
import { GOODS } from '../content/goods.js';
import { ALLOCATORS } from './ids.js';
import { balance, negativeStock } from './inventory.js';
import { SCHEMA_VERSION } from './world-state.js';

export const MAX_SAVE_BYTES = 16_000_000;
export const serialize = state => JSON.stringify(state);

// Key-sorted serialization: equal worlds hash equally whatever order their maps were built in.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

// 53-bit string hash (cyrb53), twice with different seeds, as 26 hex digits. Synchronous so the
// app can show it; tests additionally use SHA-256 over the same canonical text.
export function hashText(text) {
  const run = seed => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  };
  return run(0) + run(0x9e3779b9).slice(2);
}
export const stateHash = state => hashText(canonical(state));

class SaveError extends Error { constructor(message, code = 'invalid') { super(message); this.code = code; } }
export { SaveError };
const fail = (why, code = 'invalid') => { throw new SaveError(`The world save is incomplete or inconsistent (${why}).`, code); };
const int = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Untrusted input: bounded depth, sizes and strings, no prototype keys, only finite numbers.
function clean(v, depth = 0) {
  if (depth > 24) fail('nesting');
  if (typeof v === 'number' && !Number.isFinite(v)) fail('number');
  if (typeof v === 'string' && v.length > 4000) fail('text length');
  if (Array.isArray(v)) { if (v.length > 50000) fail('list length'); for (const x of v) clean(x, depth + 1); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    if (k === '__proto__' || k === 'prototype' || k === 'constructor' || k.length > 200) fail('key');
    clean(x, depth + 1);
  }
}

export function parseText(text) {
  if (typeof text !== 'string') throw new SaveError('A world save must be text.', 'invalid');
  if (text.length > MAX_SAVE_BYTES) throw new SaveError('World save is too large.', 'too_large');
  let s;
  try { s = JSON.parse(text); } catch { throw new SaveError('This file is not a readable world save (it may be truncated).', 'corrupt'); }
  // Exports wrap the world with a manifest.
  if (s?.format === 'sosaria-world') s = s.state;
  return s;
}

export function validateState(s, catalog) {
  if (!obj(s)) fail('not an object');
  if (s.schemaVersion > SCHEMA_VERSION) throw new SaveError(`This world was saved by a newer version of Sosaria (schema ${s.schemaVersion}). It has been left untouched.`, 'future');
  if (s.schemaVersion !== SCHEMA_VERSION) throw new SaveError('This world save uses an unsupported version.', 'unsupported');
  if (s.catalog !== catalog.signature) throw new SaveError('This save belongs to a different world layout.', 'layout');
  clean(s);
  if (typeof s.seed !== 'string' || !s.seed.length || s.seed.length > 80 || !int(s.tick) || !int(s.queueSeq)) fail('header');
  for (const k of ALLOCATORS) if (!int(s.ids?.[k], 1)) fail(`allocator ${k}`);
  if (!obj(s.rng) || Object.values(s.rng).some(v => !int(v, 0, 0xffffffff))) fail('random streams');
  for (const k of ['settlements', 'households', 'residents', 'buildings', 'fields', 'inventories', 'jobs', 'projects', 'shipments', 'contracts', 'incidents', 'closures', 'drought', 'relations', 'summaries', 'rules']) if (!obj(s[k])) fail(k);
  for (const k of ['events', 'archive', 'reports', 'commands', 'queue', 'interventions', 'threads']) if (!Array.isArray(s[k])) fail(k);
  const places = new Set(catalog.places.map(p => p.id));
  if (Object.keys(s.settlements).length !== places.size || Object.keys(s.settlements).some(id => !places.has(id))) fail('settlements');
  for (const [id, t] of Object.entries(s.settlements)) {
    if (t.id !== id || !['normal', 'rationing', 'emergency'].includes(t.policy) || !Array.isArray(t.known) || !Array.isArray(t.recent) || !Array.isArray(t.open) || !Array.isArray(t.fires) || !int(t.people)) fail(`settlement ${id}`);
    if (!obj(t.water) || !int(t.water.level) || !int(t.water.max) || !int(t.woodland) || !int(t.fish)) fail(`settlement ${id} resources`);
  }
  for (const [id, h] of Object.entries(s.households)) {
    if (h.id !== id || !places.has(h.site) || !Array.isArray(h.members) || h.members.some(m => s.residents[m]?.household !== id)) fail(`household ${id}`);
    if (h.home !== null && catalog.buildingSite[h.home] !== h.site) fail(`household ${id} home`);
  }
  const people = new Set();
  for (const [id, p] of Object.entries(s.residents)) {
    if (p.id !== id || !/^person:[a-z]+:\d+$/.test(id) || typeof p.name !== 'string' || !p.name || p.name.length > 120 || !places.has(p.site) || !places.has(p.at?.site)) fail(`resident ${id}`);
    if (!s.households[p.household] || !int(p.at.node) || p.at.node >= catalog.byId[p.at.site].nav.nodes.length || !int(p.token) || !Array.isArray(p.memories) || p.memories.length > 8) fail(`resident ${id} state`);
    if (!obj(p.needs) || Object.values(p.needs).some(v => !int(v, 0, 10000))) fail(`resident ${id} needs`);
    if (p.journey !== null && !s.shipments[p.journey]) fail(`resident ${id} journey`);
    if (p.job !== null && !s.jobs[p.job]) fail(`resident ${id} job`);
    people.add(id);
  }
  for (const [id, inv] of Object.entries(s.inventories)) {
    if (!/^inv:/.test(id) || !obj(inv?.goods) || !obj(inv?.reserved)) fail(`inventory ${id}`);
    for (const [g, n] of Object.entries(inv.goods)) if (!GOODS[g] || !int(n, 1)) fail(`inventory ${id}.${g}`);
    for (const [g, n] of Object.entries(inv.reserved)) if (!GOODS[g] || !int(n, 1) || n > (inv.goods[g] || 0)) fail(`inventory ${id} reservation`);
  }
  for (const [id, b] of Object.entries(s.buildings)) if (b.id !== id || catalog.buildingSite[id] !== b.site || !int(b.cond, 0, 100)) fail(`building ${id}`);
  for (const [id, f] of Object.entries(s.fields)) if (f.id !== id || !places.has(f.site) || !['fallow', 'growing', 'ripe'].includes(f.stage) || !int(f.growth)) fail(`field ${id}`);
  for (const [id, j] of Object.entries(s.jobs)) if (j.id !== id || !places.has(j.site) || j.worker !== null && !people.has(j.worker) || !int(j.labor) || !Array.isArray(j.fetches)) fail(`job ${id}`);
  for (const [id, x] of Object.entries(s.shipments)) {
    if (x.id !== id || !places.has(x.from) || !places.has(x.to) || !Array.isArray(x.route) || x.route.some(e => !catalog.edgeById[e])) fail(`shipment ${id}`);
    if (x.carrier !== null && !people.has(x.carrier)) fail(`shipment ${id} carrier`);
  }
  for (const [id, c] of Object.entries(s.contracts)) if (c.id !== id || !places.has(c.buyer) || !places.has(c.seller) || !int(c.escrow)) fail(`contract ${id}`);
  for (const [id, x] of Object.entries(s.incidents)) if (x.id !== id || !places.has(x.site) || !catalog.buildingSite[x.building] || !int(x.intensity, 0, 1000)) fail(`incident ${id}`);
  for (const [id, c] of Object.entries(s.closures)) if (!catalog.edgeById[id] && !catalog.bridgeById[id] || !int(c.until)) fail(`closure ${id}`);
  // History: ascending, unique, allocated IDs; causes resolve or are explicitly archived.
  let last = 0;
  for (const list of [s.archive, s.events]) {
    last = 0;
    for (const e of list) {
      const n = +String(e.id).split(':')[1];
      if (!/^event:[1-9]\d*$/.test(e.id) || n <= last || n >= s.ids.event || !int(e.t, 0, s.tick) || typeof e.k !== 'string' || !Array.isArray(e.c) || !Array.isArray(e.a) || !obj(e.d)) fail('history');
      last = n;
    }
  }
  for (const q of s.queue) if (!int(q.t) || !int(q.s) || typeof q.k !== 'string' || typeof q.e !== 'string') fail('schedule');
  const bad = negativeStock(s);
  if (bad) fail(`stock ${bad}`);
  const off = Object.entries(balance(s)).find(([, n]) => n !== 0);
  if (off) fail(`ledger ${off[0]} off by ${off[1]}`);
  return s;
}

export function manifest(state, extra = {}) {
  return {
    format: 'sosaria-world', schemaVersion: state.schemaVersion, contentVersion: state.contentVersion, generationVersion: state.generationVersion,
    scenario: state.scenario, catalog: state.catalog, seed: state.seed, tick: state.tick, altered: state.interventions.length > 0, branch: state.branch, ...extra,
  };
}
export const exportText = (state, extra = {}) => JSON.stringify({ format: 'sosaria-world', manifest: manifest(state, extra), state });
