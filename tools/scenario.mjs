// Deterministic full-atlas scenario and metrics; no DOM or GPU required.
import { createHash } from 'node:crypto';
import { buildWorld } from '../src/world/build.js';
import '../src/models/human.js';
import '../src/models/cultures.js';
import { layoutSettlements } from '../src/world/settlements.js';
import { catalogFromWorld, createState, GOODS } from '../src/sim/state.js';
import { stepWorld } from '../src/sim/step.js';
import { materialBalance } from '../src/sim/economy.js';
import { snapshot, parseSnapshot } from '../src/sim/storage.js';
import assert from 'node:assert/strict';

const world = buildWorld(), sites = layoutSettlements(world);
const catalog = catalogFromWorld(sites, world.roads);
const states = [createState(catalog), createState(catalog)];
const times = [];
for (let tick = 0; tick < 420 * 7; tick++) {
  const start = performance.now(); stepWorld(states[0], catalog); times.push(performance.now() - start);
  if (tick === 115) states[1] = parseSnapshot(snapshot(states[1]), catalog);
  stepWorld(states[1], catalog);
}
assert.equal(snapshot(states[0]), snapshot(states[1]));
assert.deepEqual(materialBalance(states[0]), Object.fromEntries(GOODS.map(g => [g, 0])));
assert.doesNotThrow(() => parseSnapshot(snapshot(states[0]), catalog));
assert.ok(states[0].facts.some(f => f.type === 'repair_completed'));
assert.ok(states[0].facts.some(f => f.type === 'shipment_delivered'));
const ids = sites.flatMap(s => s.items.map(i => i.id));
assert.equal(new Set(ids).size, ids.length);
times.sort((a, b) => a - b);
console.log(JSON.stringify({ seed: states[0].seed, tick: states[0].tick, sites: sites.length, residents: Object.keys(states[0].residents).length,
  buildings: ids.length, roads: catalog.edges.length, hash: createHash('sha256').update(snapshot(states[0])).digest('hex'),
  snapshotBytes: snapshot(states[0]).length, rulesP95Ms: times[Math.floor(times.length * 0.95)], rulesMaxMs: times.at(-1), materialBalance: materialBalance(states[0]),
  facts: states[0].facts.length, reports: states[0].reports.length, recentTrips: states[0].trips.length }, null, 2));
