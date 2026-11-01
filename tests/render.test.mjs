import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderQuality } from '../src/render/quality.js';
import { Kit, M } from '../src/models/kit.js';
import { buildHumanoid, RACES } from '../src/models/characters.js';
import { Crowd, RIG } from '../src/render/rig.js';
import { FX } from '../src/render/fx.js';
import { PostFX } from '../src/render/post.js';
import { SkyLights, WorldClock } from '../src/render/sky.js';
import { getModel } from '../src/models/registry.js';
import { Structures } from '../src/world/structures.js';
import '../src/models/human.js';

test('auto quality responds to sustained load, recovers slowly, and bounds resolution', () => {
  const q = new RenderQuality();
  const frames = (n, dt) => { for (let i = 0; i < n; i++) q.update(dt); };
  frames(60, 1 / 30);
  assert.equal(q.name, 'balanced', 'startup stalls should not immediately lower quality');
  frames(300, 1 / 30);
  assert.equal(q.name, 'performance');
  frames(2000, 1 / 20);
  assert.equal(q.scale, 0.7);
  frames(60, 1 / 60);
  assert.equal(q.scale, 0.7, 'a short burst of fast frames must not cause oscillation');
  frames(10000, 1 / 60);
  assert.equal(q.name, 'cinematic');
  assert.equal(q.scale, 1);
  const ratio = q.pixelRatio(3840, 2160, 3);
  assert.ok(3840 * 2160 * ratio * ratio <= q.settings.pixels + 1);
  q.reset();
  q.update(8);
  assert.equal(q.name, 'cinematic', 'one stalled frame must not lower quality');
});

test('manual quality is stable and invalid stored preferences fall back to auto', () => {
  const q = new RenderQuality('cinematic');
  for (let i = 0; i < 2000; i++) assert.equal(q.update(0.1), false);
  assert.equal(q.name, 'cinematic');
  q.setMode('__proto__');
  assert.equal(q.mode, 'auto');
  assert.equal(q.update(NaN), false);
});

test('panels and animated characters retain physical surface UVs', () => {
  const k = new Kit();
  k.panel(0, 0, 0, 0.05, 0.085, [1, 1, 1], M.wood);
  const g = k.build();
  assert.ok(Math.abs(Math.max(...g.attributes.uv.array) - 0.085) < 1e-7);
  for (const race of Object.keys(RACES)) {
    const actor = buildHumanoid(race);
    assert.equal(actor.attributes.uv.count, actor.attributes.position.count);
    assert.ok([...actor.attributes.uv.array].every(Number.isFinite));
    actor.dispose();
  }
  for (const name of ['house0', 'house8', 'house13', 'cottage0', 'tavern']) {
    const m = getModel(name);
    assert.ok(m.geometry.boundingSphere.radius > 0);
    assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));
    assert.ok(m.anchors.door);
  }
  g.dispose();
});

test('growing crowds preserve actors already submitted in the same frame', () => {
  const crowd = new Crowd(new THREE.Scene(), buildHumanoid('human'), RIG.biped, 'test', 1);
  const matrix = new THREE.Matrix4().makeTranslation(1, 2, 3);
  crowd.push(matrix, 3, 0.25, 1, 2, [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0]);
  const channels = Object.fromEntries(['anim', 'colA', 'colB', 'skin', 'hair'].map(k => [k, [...crowd[k].array]]));
  const old = crowd.mesh;
  let disposed = false;
  old.addEventListener('dispose', () => { disposed = true; });
  crowd.push(matrix, 4, 0.5, 2, 3, [0, 1, 0], [1, 0, 0], [0, 1, 1], [1, 0, 1]);
  crowd.end();
  assert.equal(crowd.mesh.count, 2);
  for (const [name, data] of Object.entries(channels)) assert.deepEqual([...crowd[name].array.slice(0, data.length)], data);
  assert.equal(crowd.mesh.instanceMatrix.array[12], 1);
  assert.equal(disposed, true);
});

test('event particles stay bounded, recycle storage, sort smoke, and stop empty uploads', () => {
  const fx = new FX(new THREE.Scene());
  const p = new THREE.Vector3(100, 0, 0), v = new THREE.Vector3(0, 0, 0);
  fx.emit('fire', p, v, 3500, 0, 0.1, 1);
  assert.equal(fx.p.length, 3000);
  const instances = new Set(fx.p);
  fx.update(2);
  assert.equal(fx.p.length, 0);
  assert.equal(fx.free.length, 3000);
  const version = fx.systems.add.pos.version;
  fx.update(1 / 60);
  assert.equal(fx.systems.add.pos.version, version);
  fx.emit('smoke', p, v, 2, 0, 0.1, 10);
  assert.ok(fx.p.every(q => instances.has(q)));
  fx.p[1].x.set(200, 0, 0);
  fx.update(0);
  assert.equal(fx.systems.alpha.pos.getX(0), 200);
  assert.equal(fx.systems.alpha.g.instanceCount, 2);
  assert.deepEqual(p.toArray(), [100, 0, 0]);
  assert.deepEqual(v.toArray(), [0, 0, 0]);
});

test('post targets survive tiny viewports, avoid redundant allocations, and obey MSAA limits', () => {
  const renderer = { capabilities: { maxSamples: 2 }, setRenderTarget() {}, render() {} };
  const post = new PostFX(renderer);
  post.setSize(0, 0, 4, 6);
  assert.equal(post.scene.width, 1);
  assert.equal(post.scene.samples, 2);
  assert.equal(post.bloomLevels.length, 1);
  const target = post.scene;
  post.setSize(0, 0, 4, 6);
  assert.equal(post.scene, target);
  post.setSize(800, 600, 0, 4);
  assert.equal(post.bloomLevels.length, 4);
  assert.equal(post.finalMat.uniforms.uFXAA.value, 1);
});

test('sun shadows snap in light space, skip night, and release resized maps', () => {
  const sky = new SkyLights(new THREE.Scene()), clock = new WorldClock();
  const sun = clock.sunDir();
  const right = new THREE.Vector3(0, 1, 0).cross(sun).normalize();
  const texel = 2.4 / 4096;
  const focus = sun.clone().multiplyScalar(100).addScaledVector(right, texel * 0.1);
  sky.update(clock, focus, 1.2, true);
  assert.equal(sky.sun.castShadow, true);
  const target = sky.sun.target.position.clone();
  sky.update(clock, focus.clone().addScaledVector(right, texel * 0.1), 1.2, true);
  assert.ok(target.distanceTo(sky.sun.target.position) < 1e-9);
  sky.update(clock, focus.clone().negate(), 1.2, true);
  assert.equal(sky.sun.castShadow, false);
  let disposed = false;
  sky.sun.shadow.map = { dispose() { disposed = true; } };
  sky.setShadowSize(1024);
  assert.equal(disposed, true);
  assert.equal(sky.sun.shadow.map, null);
});

test('repair scaffolding is instanced, stays attached to its building and releases GPU resources', () => {
  const structures = Object.create(Structures.prototype);
  const rec = { instance: 0, model: 'house0', matrix: new THREE.Matrix4().makeTranslation(10, 20, 30) };
  structures.byBuilding = new Map([['home', rec]]);
  structures.mesh = { setColorAt() {} };
  structures.changeOverlays = new THREE.Group();
  structures.damageColors = { repairing: new THREE.Color(), repaired: new THREE.Color() };
  structures.applyState({ buildings: { home: { status: 'repairing' } } });
  const scaffold = rec.scaffold;
  assert.ok(scaffold.isInstancedMesh);
  assert.deepEqual(scaffold.position.toArray(), [10, 20, 30]);
  let disposed = 0;
  for (const resource of [scaffold, scaffold.geometry, scaffold.material]) resource.addEventListener('dispose', () => disposed++);
  structures.applyState({ buildings: { home: { status: 'repaired' } } });
  assert.equal(disposed, 3);
  assert.equal(structures.changeOverlays.children.length, 0);
  assert.equal(rec.scaffold, null);
});
