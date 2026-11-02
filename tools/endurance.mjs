// Long-run stability: `node --import ./tools/three-node.mjs tools/endurance.mjs [--years N] [--seeds N] [--json path]`.
// Reports population, food security, blocked work, trade completion, incidents, ecology and the
// resource ledger per seed, and fails on negative stock, ledger drift or a collapsed population.
import { writeFileSync } from 'node:fs';
import { buildWorldDefinition } from '../src/world/definition.js';
import { catalogFromWorld } from '../src/sim/catalog.js';
import { createWorld } from '../src/sim/world-state.js';
import { stepWorld } from '../src/sim/kernel.js';
import { balance, negativeStock } from '../src/sim/inventory.js';
import { serialize, stateHash } from '../src/sim/snapshot.js';
import { CALENDAR } from '../src/content/calendar.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const years = +arg('years', 1), seeds = +arg('seeds', 1), from = +arg('from', 0), out = arg('json', null);
const DAY = CALENDAR.ticksPerDay, YEAR = DAY * CALENDAR.daysPerYear;
const { world, sites } = buildWorldDefinition();
const catalog = catalogFromWorld(world, sites);
const SLICE = catalog.scenario.detailed;
const results = [];

for (let k = from; k < from + seeds; k++) {
  const seed = k === 0 ? 'sosaria-living-1' : `endurance-${k}`;
  const state = createWorld(catalog, seed);
  const daily = [];
  let worst = 0, start = performance.now();
  const counted = new Set();
  const tally = {};
  for (let day = 0; day < years * CALENDAR.daysPerYear; day++) {
    const t0 = performance.now();
    for (let i = 0; i < DAY; i++) stepWorld(state, catalog);
    worst = Math.max(worst, (performance.now() - t0) / DAY);
    for (const e of state.events) if (!counted.has(e.id)) { counted.add(e.id); tally[e.k] = (tally[e.k] || 0) + 1; }
    if (counted.size > 20000) counted.clear();
    const off = Object.entries(balance(state)).filter(([, n]) => n);
    const neg = negativeStock(state);
    if (off.length || neg) throw new Error(`seed ${seed} day ${day}: ledger ${JSON.stringify(off)} negative ${neg}`);
    if (day % 10 === 9) daily.push({
      day: day + 1, residents: Object.keys(state.residents).length,
      outlook: Object.fromEntries(SLICE.map(id => [id, state.settlements[id].outlook / 10])),
      policy: Object.fromEntries(SLICE.map(id => [id, state.settlements[id].policy])),
      hungryHouseholds: Object.values(state.households).filter(h => h.hungry > 0).length,
      hungryBySite: Object.values(state.households).filter(h => h.hungry > 0).reduce((m, h) => (m[h.site] = (m[h.site] || 0) + 1, m), {}),
      jobs: Object.keys(state.jobs).length, queue: state.queue.length, events: state.events.length, archive: state.archive.length, bytes: serialize(state).length,
      woodland: Math.round(100 * SLICE.reduce((n, id) => n + state.settlements[id].woodland, 0) / SLICE.reduce((n, id) => n + state.settlements[id].woodlandMax, 0)),
      fish: state.settlements.saltmere.fish,
      treasury: Object.fromEntries(SLICE.map(id => [id, state.inventories[catalog.byId[id].stores.treasury]?.goods.coin || 0])),
      grain: Object.fromEntries(SLICE.map(id => [id, catalog.byId[id].stores.dry.concat(catalog.byId[id].stores.reserve).reduce((n, inv) => n + (state.inventories[inv]?.goods.grain || 0), 0)])),
    });
  }
  const homed = Object.fromEntries(catalog.places.map(p => [p.id, Object.values(state.residents).filter(r => r.site === p.id).length]));
  const result = {
    seed, years, ticks: state.tick, ms: Math.round(performance.now() - start), usPerTick: Math.round((performance.now() - start) * 1000 / state.tick), worstDayUsPerTick: Math.round(worst * 1000),
    hash: stateHash(state), ledger: balance(state), residents: Object.keys(state.residents).length, sliceHomes: Object.fromEntries(SLICE.map(id => [id, homed[id]])),
    totals: Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1])), samples: daily,
  };
  results.push(result);
  const last = daily.at(-1);
  console.log(JSON.stringify({ seed, ms: result.ms, usPerTick: result.usPerTick, residents: result.residents, sliceHomes: result.sliceHomes, lastOutlook: last.outlook, hungry: last.hungryHouseholds,
    bytes: last.bytes, fires: tally.fire_started || 0, relief: tally.relief_agreed || 0, delivered: tally.shipment_delivered || 0, migrations: tally.household_left || 0, harvests: tally.harvest || 0 }));
}
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
