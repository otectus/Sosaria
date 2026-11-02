// F05: sea routes stay in navigable water over their full length, reach valid harbor approaches,
// and ships wait or reroute when a passage closes. Validation runs on the final world, after
// settlement streets have been cut into the terrain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeaNetwork, validateRoute, segmentInWater, DRAFT } from '../src/world/sealanes.js';
import { SEA_LANES } from '../src/world/atlas.js';
import { dirToFace, latLonToDir, dirToLatLon } from '../src/core/sphere.js';
import { planRoute } from '../src/sim/travel.js';
import { world, fresh, advance, cmd } from './helpers.mjs';

const { world: w, sites, catalog } = world();

test('every ordinary route sample and segment is in water deeper than the vessel draft', () => {
  const ordinary = w.lanes.filter(r => !r.supernatural);
  assert.equal(ordinary.length + w.lanes.filter(r => r.supernatural).length, SEA_LANES.length, 'every authored lane produced a route');
  for (const r of ordinary) {
    const check = validateRoute(w.field, r.dirs, DRAFT[r.vessel]);
    assert.ok(check.ok, `${r.id}: ${check.bad} shallow samples or joins (shallowest ${check.shallowest})`);
    assert.ok(r.dirs.length > 10, `${r.id} has a real path`);
  }
});

test('the original authored lanes did cross land; the ghost ship keeps an explicit supernatural route', () => {
  const crossed = SEA_LANES.filter(l => l.kind !== 'ghost').filter(l => l.pts.some(([la, lo]) => { const d = latLonToDir(la, lo); return w.field.height(d[0], d[1], d[2]) > 0.1; }));
  assert.ok(crossed.length >= 4, 'the regression reproduces the old defect');
  const ghost = w.lanes.find(r => r.kind === 'ghost');
  assert.equal(ghost.supernatural, true);
});

test('harbor approaches are in water connected to the open sea; Saltmere berths at its dock', () => {
  for (const h of w.harbors) assert.ok(w.field.height(...h.anchor) < -0.1, `${h.site} anchor is navigable`);
  const salt = w.harbors.find(h => h.site === 'saltmere');
  assert.ok(salt?.berth, 'Saltmere ships reach a dock approach');
  assert.ok(segmentInWater(w.field, salt.anchor, salt.berth, 0.05));
  for (const e of catalog.edges.filter(x => x.mode === 'sea')) assert.ok(e.ticks > 0 && e.dirs.length > 2, `${e.id} is a sea edge with geometry`);
});

test('routes cross cube-face boundaries and the dateline without leaving water', () => {
  const faces = new Set();
  for (const r of w.lanes.filter(x => !x.supernatural)) for (const d of r.dirs) faces.add(dirToFace(d));
  assert.ok(faces.size >= 3, `routes span ${faces.size} cube faces`);
  // A synthetic lane across the ±180° seam in the open ocean north of the Gloamfen.
  const seam = buildSeaNetwork(w, sites, [{ id: 'seam', kind: 'merchant', pts: [[2, 172], [4, -174]] }]).routes[0];
  assert.ok(seam.valid, seam.reason || 'seam route valid');
  const lons = seam.dirs.map(d => dirToLatLon(d)[1]);
  assert.ok(lons.some(l => l > 170) && lons.some(l => l < -170), 'the route really crosses the dateline');
});

test('narrow passages: loop lanes for fishers, pirates and canoes all validate at their drafts', () => {
  for (const id of ['storm', 'pirate', 'reach']) {
    const r = w.lanes.find(x => x.id === id);
    assert.ok(r, `${id} produced a route`);
    assert.ok(validateRoute(w.field, r.dirs, DRAFT[r.vessel]).ok, id);
  }
});

test('a ship waits in port while its passage is closed, then sails', () => {
  const s = fresh();
  const edge = catalog.edges.find(e => e.mode === 'sea' && e.a === 'saltmere' && e.b === 'scalegate' || e.mode === 'sea' && e.b === 'saltmere' && e.a === 'scalegate');
  assert.ok(edge);
  assert.ok(cmd(s, { type: 'close_route', route: edge.id, hours: 24 }).ok);
  assert.equal(planRoute(s, catalog, 'scalegate', 'saltmere', 'sea'), null, 'no open passage while closed');
  advance(s, 25 * 60);
  assert.ok(planRoute(s, catalog, 'scalegate', 'saltmere', 'sea'), 'the passage reopens on schedule');
});
