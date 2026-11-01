// F08: explicit traversability. Unreachable destinations produce a waiting state with a reason,
// connectors never pass through buildings, closures are respected locally and between towns,
// and journeys reroute or wait instead of teleporting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NavGraph, segmentHitsBox } from '../src/world/navgraph.js';
import { startTask } from '../src/sim/residents.js';
import { planRoute } from '../src/sim/travel.js';
import { world, fresh, advance, cmd, until, events } from './helpers.mjs';

const { catalog } = world();
const box = (x, y, w, d) => ({ x, y, hw: w / 2, hd: d / 2, fx: 0, fy: 1, rx: 1, ry: 0 });

test('disconnected streets: no route is invented and the destination is never appended', () => {
  const g = NavGraph.fromLayout({ streets: [{ pts: [[0, 0], [1, 0]] }, { pts: [[5, 5], [6, 5]] }], plaza: [0, 0] });
  const far = g.nearest(6, 5), near = g.nearest(0.5, 0);
  // The fragment is joined only across clear, short open ground (2.5 units); 7 units is too far.
  assert.equal(g.route(near, far), null);
});

test('connectors do not pass through buildings; weighted A* prefers the shorter way', () => {
  assert.ok(segmentHitsBox(-1, 0, 1, 0, box(0, 0, 0.5, 0.5)));
  assert.ok(!segmentHitsBox(-1, 1, 1, 1, box(0, 0, 0.5, 0.5)));
  const g = NavGraph.fromLayout({ streets: [{ pts: [[0, 0], [2, 0]] }], plaza: [0, 0],
    boxes: [box(1, 0.6, 0.6, 0.3)], pois: [{ key: 'door', kind: 'home', x: 1, y: 1.2, reach: 1.5 }] });
  const door = g.pois[0];
  assert.ok(door.reachable);
  for (const [n] of g.adj[door.node]) assert.ok(!segmentHitsBox(1, 1.2, g.nodes[n][0], g.nodes[n][1], box(1, 0.6, 0.6, 0.3), 0.06), 'connector clears the building');
  const a = g.nearest(0, 0), b = g.nearest(2, 0);
  assert.ok(Math.abs(g.pathLength(g.route(a, b)) - 2) < 1e-6);
});

test('every point of interest in the detailed towns is reachable from the plaza', () => {
  for (const id of catalog.scenario.detailed) {
    const place = catalog.byId[id], d = place.nav.distances(place.pois[place.poi.plaza].node);
    const unreachable = place.pois.filter(p => !Number.isFinite(d[p.node]));
    assert.deepEqual(unreachable.map(p => p.key), [], id);
  }
});

test('a blocked destination becomes a waiting task with a reason, without movement', () => {
  const s = fresh();
  const p = s.residents['person:highmoor:10'];
  const place = catalog.byId.highmoor;
  const before = p.at.node;
  const target = place.pois[place.poi.market].node;
  // Cut every lane into the market (as a closed gate would), in both directions.
  const saved = place.nav.adj.map(list => list.slice());
  for (const [n] of place.nav.adj[target]) place.nav.adj[n] = place.nav.adj[n].filter(([m]) => m !== target);
  place.nav.adj[target] = [];
  place.distanceCache.clear();
  try {
    const t = startTask(s, catalog, p, { k: 'errand', node: target, dur: 30, why: { key: 'errand' } });
    assert.equal(t.k, 'wait'); assert.equal(t.why.key, 'unreachable');
    assert.equal(p.at.node, before, 'no teleport');
  } finally { place.nav.adj = saved; place.distanceCache.clear(); }
});

test('a fire closes nearby lanes to ordinary traffic while responders may approach', async () => {
  const { closureFor } = await import('../src/sim/incidents.js');
  const s = fresh();
  advance(s, 300);
  assert.ok(cmd(s, { type: 'ignite', building: catalog.byId.highmoor.granaries[0] }).ok);
  const c = closureFor(s, catalog, 'highmoor');
  const place = catalog.byId.highmoor, g = place.byBuilding[place.granaries[0]];
  const near = place.nav.nearest(g.x, g.y);
  assert.ok(c.blocked(near), 'lanes beside the fire are closed');
});

test('a closed bridge makes journeys reroute or wait; reopening restores the direct road', () => {
  const s = fresh();
  const bridge = catalog.bridges.find(b => b.road === 'road:highmoor:saltmere');
  assert.ok(bridge, 'the Saltmere road crosses the Aln');
  const direct = planRoute(s, catalog, 'saltmere', 'highmoor');
  assert.deepEqual(direct.edges, ['road:highmoor:saltmere']);
  assert.ok(cmd(s, { type: 'close_route', route: bridge.id, hours: 48 }).ok);
  const detour = planRoute(s, catalog, 'saltmere', 'highmoor');
  assert.ok(detour && !detour.edges.includes('road:highmoor:saltmere') && detour.ticks > direct.ticks, 'a longer real route is found');
  advance(s, 49 * 60);
  assert.deepEqual(planRoute(s, catalog, 'saltmere', 'highmoor').edges, ['road:highmoor:saltmere']);
});

test('a wagon caught before a closed bridge stops, waits and resumes from where it stood', () => {
  const s = fresh();
  assert.ok(until(s, st => Object.values(st.shipments).some(x => x.status === 'travelling' && x.route[x.leg] === 'road:highmoor:brightwater'), 1440 * 2));
  const sh = Object.values(s.shipments).find(x => x.status === 'travelling' && x.route[x.leg] === 'road:highmoor:brightwater');
  const road = catalog.edgeById['road:highmoor:brightwater'];
  assert.ok(cmd(s, { type: 'close_route', route: road.id, hours: 3 }).ok);
  assert.equal(s.shipments[sh.id].status, 'waiting');
  const at = s.shipments[sh.id].wait.progress;
  advance(s, 60);
  assert.equal(s.shipments[sh.id].wait.progress, at, 'no movement while closed');
  assert.ok(until(s, st => st.shipments[sh.id]?.status !== 'waiting', 400));
  assert.ok(events(s, 'journey_waiting').some(e => e.d.shipment === sh.id));
});
