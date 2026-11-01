// Shared fixtures: the authored world is built once per test process (no DOM, no WebGL).
import { createHash } from 'node:crypto';
import { buildWorldDefinition } from '../src/world/definition.js';
import { catalogFromWorld } from '../src/sim/catalog.js';
import { createWorld } from '../src/sim/world-state.js';
import { stepWorld, command } from '../src/sim/kernel.js';
import { canonical } from '../src/sim/snapshot.js';
import { balance, negativeStock } from '../src/sim/inventory.js';

let cached = null;
export function world() {
  if (!cached) {
    const { world: w, sites } = buildWorldDefinition();
    cached = { world: w, sites, catalog: catalogFromWorld(w, sites) };
  }
  return cached;
}
export const fresh = (seed = 'sosaria-living-1') => createWorld(world().catalog, seed);
export const advance = (state, ticks) => { const end = state.tick + ticks; while (state.tick < end) stepWorld(state, world().catalog); return state; };
export const advanceTo = (state, tick) => { while (state.tick < tick) stepWorld(state, world().catalog); return state; };
export const cmd = (state, input) => command(state, world().catalog, input);
export const sha = state => createHash('sha256').update(canonical(state)).digest('hex');
export const balanced = state => Object.values(balance(state)).every(n => n === 0) && !negativeStock(state);
export const events = (state, kind) => [...state.archive, ...state.events].filter(e => e.k === kind);
export const granary = site => world().catalog.byId[site].granaries[0];
// Advance until a condition holds (or fail after `limit` ticks).
export function until(state, test, limit = 5000) {
  for (let i = 0; i < limit; i++) { if (test(state)) return true; stepWorld(state, world().catalog); }
  return test(state);
}
