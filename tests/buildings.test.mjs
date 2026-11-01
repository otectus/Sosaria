// F06 / F11: buildings consume real materials and labor through visible stages, stop with a
// reason when supplies run out, complete into a working function, and persist. The render
// adapter keeps model, anchors, roof heights and bounds in agreement and publishes each change.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Structures } from '../src/world/structures.js';
import { PROJECTS } from '../src/content/recipes.js';
import { held, transfer, inventory, balance } from '../src/sim/inventory.js';
import { functional } from '../src/sim/buildings.js';
import { serialize } from '../src/sim/snapshot.js';
import { loadText } from '../src/sim/migrate.js';
import { world, fresh, advance, until, events, balanced, cmd, granary } from './helpers.mjs';

const { world: w, sites, catalog } = world();
const site = catalog.byId.highmoor;
const towerId = site.construction[0];
const tower = s => Object.values(s.projects).find(p => p.building === towerId);

test('the capital watchtower consumes stone, timber and labor stage by stage, then works and persists', () => {
  const s = fresh();
  const yard = site.stores.yard[0];
  const before = { stone: held(s, yard, 'stone'), timber: held(s, yard, 'timber') };
  assert.equal(s.buildings[towerId].model, 'construct0');
  const models = [];
  assert.ok(until(s, st => { const m = st.buildings[towerId].model; if (models.at(-1) !== m) models.push(m); return st.buildings[towerId].stage === 'complete'; }, 1440 * 12), 'tower completes');
  assert.deepEqual(models, ['construct0', 'construct1', 'construct2', 'construct3', 'tower']);
  const used = PROJECTS.watchtower.stages.reduce((m, st) => { for (const [g, n] of Object.entries(st.materials)) m[g] = (m[g] || 0) + n; return m; }, {});
  assert.ok(s.ledger.used.stone >= used.stone && s.ledger.used.timber >= used.timber, 'materials were consumed, not conjured');
  assert.ok(before.stone < used.stone, 'the capital had to import stone to finish');
  assert.ok(events(s, 'contract_agreed').some(e => e.d.goods.stone), 'a stone order was placed');
  const b = s.buildings[towerId];
  assert.equal(b.use, 'watchtower'); assert.ok(functional(s, towerId));
  assert.equal(events(s, 'project_completed').length >= 1, true);
  const back = loadText(serialize(s), catalog).state;
  assert.equal(back.buildings[towerId].model, 'tower');
  assert.ok(balanced(s));
});

test('blocked supply visibly stops progress with an explanation, and work resumes when it arrives', () => {
  const s = fresh();
  for (const inv of [...site.stores.yard, ...site.stores.dry, ...site.stores.reserve]) {
    const n = held(s, inv, 'stone');
    if (n) transfer(s, inv, catalog.byId.saltmere.stores.yard[0], { stone: n });
  }
  s.rules = { ...s.rules };
  // Without stone in the capital the first stage cannot finish.
  assert.ok(until(s, st => tower(st)?.status === 'blocked', 1440));
  const pr = tower(s);
  assert.equal(pr.blocked.key, 'materials'); assert.ok(pr.blocked.missing.stone > 0);
  assert.ok(events(s, 'project_blocked').length >= 1);
  assert.equal(s.buildings[towerId].model, 'construct0', 'no progress without materials');
  assert.ok(until(s, st => tower(st)?.stage >= 1 || st.buildings[towerId].stage === 'complete', 1440 * 6), 'stone is ordered, delivered and work resumes');
  assert.ok(events(s, 'project_resumed').length >= 1);
});

test('fire damage and repair use the same lifecycle and restore capacity', () => {
  const s = fresh();
  advance(s, 300);
  assert.ok(cmd(s, { type: 'ignite', building: granary('highmoor') }).ok);
  assert.ok(until(s, st => !st.buildings[granary('highmoor')].incident, 600));
  const b = s.buildings[granary('highmoor')];
  assert.ok(b.cond < 100 && b.project, 'damage plans a repair');
  assert.ok(until(s, st => st.buildings[granary('highmoor')].cond === 100 && !st.buildings[granary('highmoor')].project, 1440 * 8), 'repair completes');
  assert.ok(events(s, 'project_completed').some(e => e.d.kind === 'repair'));
  assert.ok(balanced(s));
});

test('the render adapter registers later-stage geometry and updates anchors, roof height and bounds', () => {
  const structures = new Structures(new THREE.Scene(), w, sites);
  const rec = structures.byBuilding.get(towerId);
  const top0 = structures.topOf(rec);
  const changes = [];
  structures.onChange(c => changes.push(c));
  const s = fresh();
  s.buildings[towerId].model = 'construct3';
  structures.applyState(s);
  assert.equal(rec.model, 'construct3');
  assert.ok(structures.topOf(rec) > top0, 'roof-height lookup follows the taller stage');
  assert.ok(changes.some(c => c.kind === 'model' && c.to === 'construct3'));
  const workAnchors = structures.anchors.work.filter(a => a.rec === rec).length;
  assert.equal(workAnchors, 4, 'anchors were rebuilt for the new model');
  assert.ok(structures.mesh.boundingSphere.radius > 0);
  // A model never placed at startup is added by growing the batch.
  const before = structures.vertexCapacity;
  structures.mesh.setGeometrySize(structures.vertexCapacity, 0);
  structures.ensureGeometry('dwarf_forge');
  structures.setModel(rec, 'dwarf_forge');
  assert.equal(rec.model, 'dwarf_forge');
  assert.ok(structures.vertexCapacity >= before);
  structures.resetState();
  assert.equal(rec.model, rec.item.model);
});
