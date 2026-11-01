// Conserved goods. Every change goes through these functions, which keep a per-good ledger:
// initial + produced = held + eaten + used + spoiled + burned + lost. Reservation is not
// consumption: reserved units stay in the store until the reserving job takes or releases them.
import { GOOD_IDS, GOODS } from '../content/goods.js';

export const SINKS = ['eaten', 'used', 'spoiled', 'burned', 'lost'];
export const emptyLedger = () => ({ initial: {}, produced: {}, ...Object.fromEntries(SINKS.map(s => [s, {}])) });

const bump = (bucket, g, n) => { bucket[g] = (bucket[g] || 0) + n; };
const valid = (g, n) => GOODS[g] && Number.isSafeInteger(n) && n >= 0;

export function inventory(state, id) {
  let inv = state.inventories[id];
  if (!inv) inv = state.inventories[id] = { goods: {}, reserved: {} };
  return inv;
}
export const held = (state, id, g) => state.inventories[id]?.goods[g] || 0;
export const reservedOf = (state, id, g) => state.inventories[id]?.reserved[g] || 0;
export const available = (state, id, g) => held(state, id, g) - reservedOf(state, id, g);
export const total = (state, ids, g) => ids.reduce((n, id) => n + held(state, id, g), 0);
export const totalAvailable = (state, ids, g) => ids.reduce((n, id) => n + available(state, id, g), 0);

function take(inv, g, n) {
  inv.goods[g] -= n;
  if (!inv.goods[g]) delete inv.goods[g];
}
function put(inv, g, n) { if (n) inv.goods[g] = (inv.goods[g] || 0) + n; }

// Authored starting stock; counted once as an initial source.
export function seed(state, id, goods) {
  const inv = inventory(state, id);
  for (const [g, n] of Object.entries(goods)) {
    if (!valid(g, n)) throw new Error(`Invalid starting stock ${g}=${n}`);
    put(inv, g, n); bump(state.ledger.initial, g, n);
  }
}

export function produce(state, id, goods) {
  const inv = inventory(state, id);
  for (const [g, n] of Object.entries(goods)) {
    if (!valid(g, n) || GOODS[g].money) throw new Error(`Invalid production ${g}=${n}`);
    put(inv, g, n); bump(state.ledger.produced, g, n);
  }
}

// Remove goods into a sink. All-or-nothing: returns false and changes nothing if any are missing.
// `reserved` consumes from the caller's own reservation instead of free stock.
export function consume(state, id, goods, sink, reserved = false) {
  if (!SINKS.includes(sink)) throw new Error(`Unknown sink ${sink}`);
  const inv = state.inventories[id];
  const entries = Object.entries(goods).filter(([, n]) => n > 0);
  if (!entries.length) return true;
  if (!inv || entries.some(([g, n]) => !valid(g, n) || (reserved ? (inv.reserved[g] || 0) < n || (inv.goods[g] || 0) < n : available(state, id, g) < n))) return false;
  for (const [g, n] of entries) {
    if (reserved) { inv.reserved[g] -= n; if (!inv.reserved[g]) delete inv.reserved[g]; }
    take(inv, g, n); bump(state.ledger[sink], g, n);
  }
  return true;
}

// Atomic move between holders. Nothing is created or destroyed.
export function transfer(state, from, to, goods, reserved = false) {
  const src = state.inventories[from];
  const entries = Object.entries(goods).filter(([, n]) => n > 0);
  if (!entries.length) return true;
  if (!src || from === to || entries.some(([g, n]) => !valid(g, n) || (reserved ? (src.reserved[g] || 0) < n || (src.goods[g] || 0) < n : available(state, from, g) < n))) return false;
  const dst = inventory(state, to);
  for (const [g, n] of entries) {
    if (reserved) { src.reserved[g] -= n; if (!src.reserved[g]) delete src.reserved[g]; }
    take(src, g, n); put(dst, g, n);
  }
  return true;
}

export function reserve(state, id, goods) {
  const inv = state.inventories[id];
  const entries = Object.entries(goods).filter(([, n]) => n > 0);
  if (!inv || entries.some(([g, n]) => !valid(g, n) || available(state, id, g) < n)) return false;
  for (const [g, n] of entries) bump(inv.reserved, g, n);
  return true;
}

export function release(state, id, goods) {
  const inv = state.inventories[id];
  if (!inv) return;
  for (const [g, n] of Object.entries(goods)) {
    const r = Math.min(inv.reserved[g] || 0, n);
    if (r) { inv.reserved[g] -= r; if (!inv.reserved[g]) delete inv.reserved[g]; }
  }
}

// Remove up to `n` of g (for losses that are bounded by what exists). Returns the amount removed.
export function lose(state, id, g, n, sink) {
  const inv = state.inventories[id];
  if (!inv || n <= 0) return 0;
  const k = Math.min(n, inv.goods[g] || 0);
  if (!k) return 0;
  // Losses come out of free stock first, then cancel reservations that can no longer be met.
  take(inv, g, k);
  const over = (inv.reserved[g] || 0) - (inv.goods[g] || 0);
  if (over > 0) { inv.reserved[g] -= over; if (!inv.reserved[g]) delete inv.reserved[g]; }
  bump(state.ledger[sink], g, k);
  return k;
}

export function heldEverywhere(state) {
  const out = Object.fromEntries(GOOD_IDS.map(g => [g, 0]));
  for (const inv of Object.values(state.inventories)) for (const [g, n] of Object.entries(inv.goods)) out[g] += n;
  return out;
}

// Zero for every good when nothing has been created or destroyed outside the ledger.
export function balance(state) {
  const h = heldEverywhere(state), L = state.ledger;
  return Object.fromEntries(GOOD_IDS.map(g => [g, (L.initial[g] || 0) + (L.produced[g] || 0) - SINKS.reduce((n, s) => n + (L[s][g] || 0), 0) - h[g]]));
}

export function negativeStock(state) {
  for (const [id, inv] of Object.entries(state.inventories)) {
    for (const [g, n] of Object.entries(inv.goods)) if (!(n > 0)) return `${id}.${g}=${n}`;
    for (const [g, n] of Object.entries(inv.reserved)) if (!(n > 0) || n > (inv.goods[g] || 0)) return `${id}.reserved.${g}=${n}`;
  }
  return null;
}
