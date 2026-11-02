// Section 8: the Valdren grain network and the granary fire, end to end. Each branch changes a
// real condition and the outcome follows from it; the slice is identical watched or unwatched,
// at every speed, paused between steps, and across a save mid-incident.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Simulation } from '../src/sim/kernel.js';
import { serialize } from '../src/sim/snapshot.js';
import { loadText } from '../src/sim/migrate.js';
import { transfer, held } from '../src/sim/inventory.js';
import { relationKey } from '../src/sim/world-state.js';
import { settlementView, supplyChain } from '../src/sim/explain.js';
import { priceOf } from '../src/sim/markets.js';
import { TICKS_PER_REAL_SECOND } from '../src/sim/clock.js';
import { Structures } from '../src/world/structures.js';
import { Crowds } from '../src/life/crowds.js';
import { People } from '../src/life/people.js';
import { world, fresh, advance, advanceTo, cmd, until, events, balanced, granary, sha } from './helpers.mjs';

const { world: w, sites, catalog } = world();
const hm = catalog.byId.highmoor, keep = `inv:${hm.keep}`, granaryInv = `inv:${granary('highmoor')}`;
const lateNight = s => { while ((s.tick + 570) % 1440 < 1380) advance(s, 1); };
const burnGranary = s => {
  const r = cmd(s, { type: 'ignite', building: granary('highmoor') });
  assert.ok(r.ok, r.message);
  const id = Object.values(s.incidents).at(-1).id;
  assert.ok(until(s, st => st.incidents[id].ended !== null, 2000), 'the fire resolves');
  return s.incidents[id];
};
const noRedundancy = s => transfer(s, keep, granaryInv, { ...s.inventories[keep].goods });
const drought = s => { cmd(s, { type: 'drought', site: 'highmoor', days: 10 }); s.settlements.highmoor.water.level = 100; };

test('normal operation: Millbrook grain, Brightwater flour, Highmoor bread, traceable through the inspector', () => {
  const s = fresh();
  advance(s, 1440 * 4);
  assert.ok(events(s, 'harvest').some(e => e.w === 'millbrook'), 'Millbrook harvests');
  const flour = events(s, 'shipment_delivered').filter(e => e.w === 'highmoor' && e.d.from === 'brightwater' && e.d.cargo.flour);
  assert.ok(flour.length, 'Brightwater flour reaches Highmoor by road');
  assert.ok(events(s, 'shipment_departed').some(e => e.w === 'brightwater' && e.d.route.includes('road:highmoor:brightwater')), 'it travels the generated road');
  assert.ok(s.ledger.produced.flour > 0 && s.ledger.produced.bread > 0 && s.ledger.eaten.bread > 0);
  const chain = supplyChain(s, catalog, 'highmoor', 'flour');
  assert.ok(chain.some(c => c.kind === 'delivery' && c.from === 'brightwater'));
  // Grain for Brightwater's mills comes from Millbrook once its own stock runs down.
  assert.ok(until(s, st => events(st, 'shipment_delivered').some(e => e.w === 'brightwater' && e.d.from === 'millbrook' && e.d.cargo.grain), 1440 * 20));
  assert.ok(balanced(s));
});

test('the granary fire: alarm, roles, buckets, damage, recorded losses, resolution, repair, memory and news', () => {
  const s = fresh();
  advance(s, 600);
  const priceBefore = priceOf(s, hm, 'grain');
  const burnedBefore = { ...s.ledger.burned };
  const x = burnGranary(s);
  // 1-3: a burning incident, an alarm through the town, and assigned response roles.
  assert.ok(events(s, 'fire_started').some(e => e.d.incident === x.id));
  assert.ok(x.detected !== null && x.alarm !== null);
  const roles = new Set(Object.values(x.responders));
  for (const r of ['buckets', 'water', 'guard', 'shelter']) assert.ok(roles.has(r), `role ${r}`);
  // 4: the bucket line drew real water from the well.
  assert.ok(x.water > 0);
  // 5: building damage and bounded, once-only losses of stored goods.
  assert.ok(x.damage > 0 && s.buildings[granary('highmoor')].cond === 100 - x.damage);
  const burned = Object.fromEntries(Object.entries(s.ledger.burned).map(([g, n]) => [g, n - (burnedBefore[g] || 0)]).filter(([, n]) => n));
  assert.deepEqual(burned, x.lost, 'the ledger records exactly the incident losses');
  // 6: prices respond to the loss.
  assert.ok(priceOf(s, hm, 'grain') >= priceBefore);
  // 8: explicit resolution.
  assert.ok(['extinguished', 'burned_out', 'destroyed', 'abandoned'].includes(x.outcome));
  const resolved = events(s, 'fire_resolved').find(e => e.d.incident === x.id);
  // 10: those who answered remember; distant towns do not know yet.
  const liners = Object.entries(x.responders).filter(([, r]) => r === 'buckets').map(([id]) => id);
  assert.ok(liners.every(id => s.residents[id].memories.some(m => m.e === resolved.id)));
  assert.ok(!s.settlements.millbrook.known.includes(resolved.id), 'news is not instant');
  // 9: repair consumes materials and labor, then restores the building and its capacity.
  assert.ok(until(s, st => st.buildings[granary('highmoor')].cond === 100, 1440 * 10), 'repaired');
  assert.ok(events(s, 'project_completed').some(e => e.d.kind === 'repair' && e.d.building === granary('highmoor')));
  assert.ok(until(s, st => ['brightwater', 'saltmere', 'millbrook', 'kingsinn', 'oakhollow'].some(t => st.settlements[t].known.includes(resolved.id)), 1440 * 6), 'word travels with real journeys');
  assert.ok(balanced(s));
});

test('branches: a full well in daylight contains the fire; drought at night destroys far more', () => {
  const a = fresh(); advance(a, 600);
  const day = burnGranary(a);
  const b = fresh(); advance(b, 600); lateNight(b); drought(b);
  const night = burnGranary(b);
  const lost = x => Object.values(x.lost).reduce((n, k) => n + k, 0);
  assert.ok(night.damage > day.damage, `damage ${night.damage} > ${day.damage}`);
  assert.ok(lost(night) > lost(day), `losses ${lost(night)} > ${lost(day)}`);
  assert.ok(night.detected - night.ignited > day.detected - day.ignited, 'detection is slower at night');
});

test('branches: warehouse redundancy turns a lost granary into an inconvenience; without it the town rations until imports arrive', () => {
  const run = (setup) => {
    const s = fresh(); advance(s, 600); lateNight(s); drought(s); setup?.(s);
    const x = burnGranary(s);
    let worst = Infinity, policy = 'normal';
    for (let i = 0; i < 8; i++) { advance(s, 720); worst = Math.min(worst, s.settlements.highmoor.outlook); if (s.settlements.highmoor.policy !== 'normal') policy = s.settlements.highmoor.policy; }
    return { s, x, worst, policy };
  };
  const reserve = run(null), single = run(noRedundancy);
  assert.ok(reserve.worst > single.worst, `outlook with the keep reserve ${reserve.worst} > without ${single.worst}`);
  assert.equal(reserve.policy, 'normal');
  assert.notEqual(single.policy, 'normal');
  const food = events(single.s, 'shipment_delivered').filter(e => e.w === 'highmoor' && e.t > single.x.ended && ['grain', 'flour', 'fish', 'provisions', 'bread'].some(g => e.d.cargo[g]));
  assert.ok(food.length, 'imports arrive after the loss, by road and over time');
  assert.equal(single.s.settlements.highmoor.policy, 'normal', 'and rationing ends');
});

// A lean week across the grain network: Millbrook and Brightwater hold only their own reserves,
// so regular trade has nothing to sell and the steward must ask neighbours for relief.
const STASH = 'inv:test-lean-week';
const leanWeek = s => {
  for (const id of ['millbrook', 'brightwater']) {
    const place = catalog.byId[id];
    for (const g of ['grain', 'flour']) {
      let spare = [...place.stores.dry, ...place.stores.reserve, ...place.stores.food].reduce((n, inv) => n + held(s, inv, g), 0) - (place.profile.targets[g] || 0);
      for (const inv of [...place.stores.dry, ...place.stores.reserve, ...place.stores.food]) {
        const n = Math.min(spare, held(s, inv, g) - (s.inventories[inv]?.reserved[g] || 0));
        if (n > 0) { transfer(s, inv, STASH, { [g]: n }); spare -= n; }
      }
    }
  }
};
// An empty treasury means no regular order can be placed either, so nothing is already on the way.
const broke = s => transfer(s, hm.stores.treasury, STASH, { coin: held(s, hm.stores.treasury, 'coin') });
function relief(setup) {
  const s = fresh(); leanWeek(s); broke(s); advance(s, 600); lateNight(s); drought(s); noRedundancy(s); leanWeek(s); setup?.(s);
  burnGranary(s);
  until(s, st => events(st, 'shipment_delivered').some(e => e.w === 'highmoor' && e.d.kind === 'relief'), 1440 * 5);
  const asked = events(s, 'relief_requested').find(e => e.w === 'highmoor');
  const agreed = events(s, 'relief_agreed').find(e => e.d.buyer === 'highmoor');
  const delivered = events(s, 'shipment_delivered').find(e => e.w === 'highmoor' && e.d.kind === 'relief');
  return { s, asked, agreed, delivered };
}

test('branches: in a lean week with an empty treasury, the steward asks for relief and a trusted neighbour sends a gift', () => {
  const r = relief(null);
  assert.ok(r.asked, 'relief is requested automatically');
  assert.ok(r.agreed && r.delivered, 'relief is agreed and delivered');
  assert.equal(r.agreed.w, 'saltmere'); assert.equal(r.agreed.d.terms, 'gift');
  assert.ok(r.delivered.t > r.agreed.t, 'the delivery takes time and follows a route');
});

test('branches: distrust changes terms and slows the answer; a closed bridge forces another way or another helper', () => {
  const friendly = relief(null);
  const wary = relief(s => { s.relations[relationKey('highmoor', 'saltmere')] = 30; });
  assert.ok(wary.agreed, 'help is still found');
  assert.ok(wary.agreed.w !== 'saltmere' || wary.agreed.d.terms !== 'gift', 'distrust changes the helper or the terms');
  assert.ok(wary.agreed.d.respondsIn >= friendly.agreed.d.respondsIn);
  const bridge = catalog.bridges.find(b => b.road === 'road:highmoor:saltmere');
  const closed = relief(s => cmd(s, { type: 'close_route', route: bridge.id, hours: 96 }));
  assert.ok(closed.agreed, 'relief is still arranged');
  if (closed.agreed.w === 'saltmere') {
    const dep = events(closed.s, 'shipment_departed').find(e => e.d.contract === closed.agreed.d.contract);
    if (dep) assert.ok(!dep.d.route.includes('road:highmoor:saltmere'), 'the relief wagon avoids the closed bridge');
  } else assert.notEqual(closed.agreed.w, 'saltmere', 'another neighbour helps');
  const took = r => (r.delivered?.t ?? Infinity) - r.asked.t;
  assert.ok(took(closed) > took(friendly), `relief is delayed by the closure (${took(closed)} > ${took(friendly)})`);
});

test('branches: with no assistance the town rations and adapts, and recovers instead of breaking', () => {
  const s = fresh(); advance(s, 600); lateNight(s); drought(s); noRedundancy(s);
  cmd(s, { type: 'set_rules', relief: false });
  burnGranary(s);
  let rationed = false;
  for (let i = 0; i < 8; i++) { advance(s, 360); rationed ||= s.settlements.highmoor.policy !== 'normal'; }
  assert.equal(events(s, 'relief_agreed').filter(e => e.d.buyer === 'highmoor').length, 0);
  assert.ok(rationed, 'the steward rations');
  assert.ok(until(s, st => st.settlements.highmoor.policy === 'normal', 1440 * 20), 'the supply chain and harvests restore normal rations');
  assert.ok(Object.values(s.residents).filter(p => p.site === 'highmoor').length >= 120, 'the capital is not emptied');
  assert.ok(balanced(s));
});

test('a world rule disables destructive emergencies without stopping production or trade', () => {
  const s = fresh();
  cmd(s, { type: 'set_rules', destructiveIncidents: false });
  assert.equal(cmd(s, { type: 'ignite', building: granary('highmoor') }).ok, false);
  advance(s, 1440 * 3);
  assert.equal(events(s, 'fire_started').length, 0);
  assert.ok(events(s, 'shipment_delivered').length > 0 && s.ledger.produced.bread > 0);
  assert.ok(s.interventions.some(i => i.type === 'set_rules'), 'altered rules are recorded');
});

test('completion gate: watched, unwatched, every speed, paused steps and a mid-fire save all agree', () => {
  const plan = s => { advance(s, 600); };
  const target = 600 + 1440;
  const reference = fresh(); plan(reference); cmd(reference, { type: 'ignite', building: granary('highmoor') }); advanceTo(reference, target);
  // Saved mid-incident and reloaded.
  const a = fresh(); plan(a); cmd(a, { type: 'ignite', building: granary('highmoor') }); advance(a, 8);
  assert.ok(Object.values(a.incidents).some(x => x.status === 'burning'));
  const reloaded = loadText(serialize(a), catalog).state;
  advanceTo(reloaded, target);
  assert.equal(sha(reloaded), sha(reference));
  // Watched at 64x through the real frame path, with pauses and a camera on the fire.
  const scene = new THREE.Scene();
  const people = (sim) => new People(w, sites, catalog, new Structures(scene, w, sites), new Crowds(scene), sim);
  const sim = new Simulation(catalog, fresh()); plan(sim.state); sim.command({ type: 'ignite', building: granary('highmoor') });
  const view = people(sim);
  const cam = new THREE.PerspectiveCamera(); cam.position.copy(sites.find(x => x.s.id === 'highmoor').centerWorld.clone().normalize().multiplyScalar(102));
  let frame = 0;
  while (sim.state.tick < target) {
    const left = target - sim.state.tick - sim.clock.debt;
    sim.advance(Math.min(1 / 30, Math.max(1e-6, left / 64 / TICKS_PER_REAL_SECOND)), 64, frame % 50 < 5, { budgetMs: 1e9, maxTicks: Math.max(1, left) });
    if (frame++ % 3 === 0) view.update(sim.ticks, cam, 2, frame * 33);
  }
  assert.equal(sha(sim.state), sha(reference));
  const v = settlementView(reference, catalog, 'highmoor');
  assert.ok(v.recent.some(e => e.k === 'fire_resolved'));
});
