// F07: identical seeds and commands give identical authoritative results regardless of frame rate,
// camera path, view activation, graphics settings or pause durations. Presentation randomness
// (effects, particles) never touches simulation streams.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Simulation } from '../src/sim/kernel.js';
import { Structures } from '../src/world/structures.js';
import { Crowds } from '../src/life/crowds.js';
import { People } from '../src/life/people.js';
import { FX } from '../src/render/fx.js';
import { TICKS_PER_REAL_SECOND } from '../src/sim/clock.js';
import { random } from '../src/sim/rng.js';
import { world, fresh, sha, granary } from './helpers.mjs';

const { world: w, sites, catalog } = world();
const scene = new THREE.Scene();
const structures = new Structures(scene, w, sites);
const crowds = new Crowds(scene);
const fx = new FX(scene);

// Commands at fixed ticks; frames, cameras and pauses vary between runs.
function run({ fps, speed, camera, pauses = [], quality = 'balanced' }) {
  const sim = new Simulation(catalog, fresh('determinism'));
  const people = new People(w, sites, catalog, structures, crowds, sim);
  const plan = { 400: { type: 'ignite', building: granary('brightwater') }, 900: { type: 'close_route', route: 'road:highmoor:brightwater', hours: 6 } };
  const end = 1440 * 2;
  let frame = 0, real = 0;
  while (sim.state.tick < end) {
    const due = Object.keys(plan).map(Number).find(t => t === sim.state.tick);
    if (due !== undefined) { sim.command(plan[due]); delete plan[due]; }
    const paused = pauses.some(([a, b]) => frame >= a && frame < b);
    const nextCommand = Math.min(...Object.keys(plan).map(Number).filter(t => t > sim.state.tick), end);
    const room = nextCommand - sim.state.tick - sim.clock.debt;
    const dt = Math.min(1 / fps, Math.max(1e-6, room / speed / TICKS_PER_REAL_SECOND));
    sim.advance(dt, speed, paused, { budgetMs: 1e9, maxTicks: Math.max(1, nextCommand - sim.state.tick) });
    frame++; real += dt * 1000;
    if (camera && frame % 7 === 0) {
      const id = camera[Math.floor(frame / 50) % camera.length];
      const site = sites.find(s => s.s.id === id), cam = new THREE.PerspectiveCamera();
      cam.position.copy(site.centerWorld.clone().normalize().multiplyScalar(102.5));
      crowds.begin(); people.update(sim.ticks, cam, 2.5, real); crowds.end();
      // Cosmetic effects use their own randomness.
      fx.emit('fire', site.centerWorld, new THREE.Vector3(0, 0.1, 0), quality === 'cinematic' ? 6 : 2, 0.05, 0.04, 1);
    }
  }
  return sha(sim.state);
}

test('frame rate, speed, camera path, view activation, quality and pauses do not change outcomes', () => {
  const reference = run({ fps: 60, speed: 16 });
  assert.equal(run({ fps: 30, speed: 64, camera: ['brightwater', 'highmoor'] }), reference);
  assert.equal(run({ fps: 144, speed: 4, camera: ['saltmere', 'millbrook', 'brightwater'], quality: 'cinematic' }), reference);
  assert.equal(run({ fps: 60, speed: 64, pauses: [[3, 40], [100, 400]], camera: ['highmoor'] }), reference);
});

test('different seeds give different histories; streams are explicit and saved', () => {
  const a = fresh('alpha'), b = fresh('beta');
  assert.notEqual(Object.values(a.residents)[0].name + Object.values(a.residents)[5].name, Object.values(b.residents)[0].name + Object.values(b.residents)[5].name);
  const x = random(a, 'incidents'), state = a.rng.incidents;
  const y = random(a, 'incidents');
  a.rng.incidents = state;
  assert.equal(random(a, 'incidents'), y, 'a stream continues from its saved state');
  assert.notEqual(x, y);
});

test('incident scheduling never reads the camera: events are not biased toward the observer', () => {
  const one = new Simulation(catalog, fresh('watch'));
  const two = new Simulation(catalog, fresh('watch'));
  const people = new People(w, sites, catalog, structures, crowds, two);
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(sites.find(s => s.s.id === 'saltmere').centerWorld.clone().normalize().multiplyScalar(102.5));
  for (let i = 0; i < 1440 * 4; i++) { one.run(1); two.run(1); if (i % 120 === 0) { crowds.begin(); people.update(two.ticks, cam, 2.5, i); crowds.end(); } }
  assert.equal(sha(one.state), sha(two.state));
});
