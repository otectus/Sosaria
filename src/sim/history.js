// Durable causal history (finding F04). IDs are allocated when an event is committed, never from
// a list length. Recent events keep full payloads; referenced or important older events move to a
// compact archive; routine unreferenced events become counted summaries. Every ID still resolves.
import { allocate, idNumber } from './ids.js';
import { worldDay, dateOf } from './clock.js';

export const LIVE_LIMIT = 1600, LIVE_KEEP = 1200, ARCHIVE_LIMIT = 5000, KNOWN_LIMIT = 48, RECENT_LIMIT = 24;

// importance: 0 routine, 1 notable, 2 significant (kept), 3 historic (kept).
export function commit(state, kind, where, data = {}, { actors = [], causes = [], importance = 1, local = true } = {}) {
  const e = { id: allocate(state, 'event'), t: state.tick, k: kind, w: where, a: actors.filter(Boolean), c: [...new Set(causes.filter(Boolean))], d: data, i: importance };
  state.events.push(e);
  const town = state.settlements[where];
  if (town && local) {
    learn(town, e.id);
    town.recent.push(e.id);
    if (town.recent.length > RECENT_LIMIT) town.recent.splice(0, town.recent.length - RECENT_LIMIT);
  }
  return e;
}

export function learn(town, id) {
  if (town.known.includes(id)) return false;
  town.known.push(id);
  if (town.known.length > KNOWN_LIMIT) town.known.splice(0, town.known.length - KNOWN_LIMIT);
  return true;
}

const search = (list, n) => {
  let lo = 0, hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, m = idNumber(list[mid].id);
    if (m === n) return list[mid];
    if (m < n) lo = mid + 1; else hi = mid - 1;
  }
  return null;
};

// Full event, archived record, or an explicit summary marker. Never undefined for a valid ID.
export function resolve(state, id) {
  if (typeof id !== 'string' || !id.startsWith('event:')) return null;
  const n = idNumber(id);
  if (!(n > 0) || n >= state.ids.event) return null;
  return search(state.events, n) || search(state.archive, n) || { id, k: 'summarized', archived: true, summarized: true };
}

export function referencedEvents(state) {
  const keep = new Set();
  const add = id => { if (id) keep.add(id); };
  for (const t of Object.values(state.settlements)) { t.known.forEach(add); t.recent.forEach(add); add(t.shortage); add(t.lastDecision?.event); }
  for (const p of Object.values(state.residents)) for (const m of p.memories) add(m.e);
  for (const x of Object.values(state.incidents)) { add(x.cause); Object.values(x.events).forEach(add); }
  for (const x of Object.values(state.projects)) { add(x.cause); add(x.event); }
  for (const x of Object.values(state.contracts)) { add(x.cause); add(x.event); }
  for (const x of Object.values(state.shipments)) { add(x.event); add(x.cause); }
  for (const b of Object.values(state.buildings)) { add(b.event); add(b.lastIncident); }
  for (const r of state.reports) add(r.e);
  for (const c of Object.values(state.closures)) add(c.cause);
  for (const c of state.commands) add(c.event);
  for (const t of state.threads || []) add(t);
  return keep;
}

function summarize(state, e) {
  const d = dateOf(worldDay(e.t));
  const key = `${d.year}|${e.w}|${e.k}`;
  state.summaries[key] = (state.summaries[key] || 0) + 1;
}

export function compactHistory(state) {
  if (state.events.length <= LIVE_LIMIT && state.archive.length <= ARCHIVE_LIMIT) return 0;
  const keep = referencedEvents(state);
  // Causes of retained events stay resolvable as archive entries.
  let moved = 0;
  if (state.events.length > LIVE_LIMIT) {
    const out = state.events.splice(0, state.events.length - LIVE_KEEP);
    for (const e of state.events) e.c.forEach(id => keep.add(id));
    for (const e of out) {
      if (keep.has(e.id) || e.i >= 2) state.archive.push({ ...e, archived: true });
      else summarize(state, e);
      moved++;
    }
  }
  if (state.archive.length > ARCHIVE_LIMIT) {
    const kept = [];
    let excess = state.archive.length - ARCHIVE_LIMIT;
    for (const e of state.archive) {
      if (excess > 0 && !keep.has(e.id) && e.i < 3) { summarize(state, e); excess--; }
      else kept.push(e);
    }
    state.archive = kept;
  }
  return moved;
}

// Link everything that names a vanished cause to the summary marker instead of a dangling ID.
export function causeChain(state, id, depth = 6) {
  const out = [];
  const seen = new Set();
  const walk = (eid, d) => {
    if (d > depth || seen.has(eid)) return;
    seen.add(eid);
    const e = resolve(state, eid);
    if (!e) return;
    out.push(e);
    for (const c of e.c || []) walk(c, d + 1);
  };
  walk(id, 0);
  return out;
}

export function effectsOf(state, id, limit = 12) {
  const out = [];
  for (const e of state.events) if (e.c.includes(id)) { out.push(e); if (out.length >= limit) break; }
  return out;
}
