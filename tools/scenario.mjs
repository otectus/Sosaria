// The Section 8 slice as a reproducible scenario: `npm run test:scenario [-- --out dir]`.
// Runs the Valdren grain network, burns the Highmoor granary at night in a drought with the keep
// reserve emptied into it, and prints an event trace and the resource ledger proving what happened.
// A second run saves mid-fire, reloads, and must reach the same state hash.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildWorldDefinition } from '../src/world/definition.js';
import { catalogFromWorld } from '../src/sim/catalog.js';
import { createWorld } from '../src/sim/world-state.js';
import { stepWorld, command } from '../src/sim/kernel.js';
import { balance, transfer } from '../src/sim/inventory.js';
import { serialize, stateHash } from '../src/sim/snapshot.js';
import { loadText } from '../src/sim/migrate.js';
import { resolve } from '../src/sim/history.js';
import { stamp } from '../src/sim/clock.js';
import { eventText } from '../src/ui/text.js';

const outIndex = process.argv.indexOf('--out');
const out = outIndex > 0 ? process.argv[outIndex + 1] : null;
const { world, sites } = buildWorldDefinition();
const catalog = catalogFromWorld(world, sites);
const hm = catalog.byId.highmoor, granary = hm.granaries[0];
const step = (s, n) => { for (let i = 0; i < n; i++) stepWorld(s, catalog); };

function setup(state) {
  step(state, 600);
  while ((state.tick + 570) % 1440 < 1380) step(state, 1);
  command(state, catalog, { type: 'drought', site: 'highmoor', days: 10 });
  state.settlements.highmoor.water.level = 100;
  const keep = `inv:${hm.keep}`;
  transfer(state, keep, `inv:${granary}`, { ...state.inventories[keep].goods });
  return command(state, catalog, { type: 'ignite', building: granary });
}

const a = createWorld(catalog);
const ignite = setup(a);
assert.ok(ignite.ok, ignite.message);
const fireTick = a.tick;
step(a, 20);
const midFire = serialize(a);
// Keep the incident record as it resolves: resolved incidents leave the live store after three days.
let incident = null;
for (let i = 20; i < 1440 * 6; i++) {
  step(a, 1);
  const x = Object.values(a.incidents).find(x => x.building === granary);
  if (x?.ended !== null && x && !incident) incident = structuredClone(x);
}

const b = loadText(midFire, catalog).state;
step(b, 1440 * 6 - 20);
assert.equal(stateHash(b), stateHash(a), 'save and reload mid-fire reach the same world');

const ctx = { state: a, catalog, resolve: id => resolve(a, id) };
const interesting = /fire|alarm|relief|ration|repair|project|household|shipment_delivered|contract_agreed|report_received|intervention/;
const trace = [...a.archive, ...a.events].filter(e => e.t >= fireTick - 1 && interesting.test(e.k) && (e.w === 'highmoor' || e.d?.buyer === 'highmoor' || e.k === 'report_received' && /fire/.test(resolve(a, e.d.about)?.k)))
  .map(e => ({ id: e.id, tick: e.t, when: stamp(e.t, catalog.byId[e.w]?.lon), where: e.w, kind: e.k, causes: e.c, text: eventText(ctx, e) }));
const ledger = { ...a.ledger, balance: balance(a) };
assert.ok(Object.values(ledger.balance).every(n => n === 0), 'every good balances');
const summary = {
  seed: a.seed, finalTick: a.tick, hash: stateHash(a), reloadHash: stateHash(b), fireTick,
  incident: incident && { outcome: incident.outcome, damage: incident.damage, lost: incident.lost, saved: incident.saved, water: incident.water, duration: incident.ended - incident.ignited },
  highmoor: { policy: a.settlements.highmoor.policy, outlookDays: a.settlements.highmoor.outlook / 10 },
  ledger,
};
for (const e of trace) console.log(`${e.when.padEnd(30)} ${e.where.padEnd(12)} ${e.text}`);
console.log(JSON.stringify(summary, null, 2));
if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'granary-fire-trace.json'), JSON.stringify(trace, null, 1));
  writeFileSync(join(out, 'granary-fire-ledger.json'), JSON.stringify(summary, null, 1));
}
