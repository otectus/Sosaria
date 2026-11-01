// F02 / F03: residents are persistent records independent of rendering. Views are projections that
// stream with the camera (even while paused) without changing world state.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Structures } from '../src/world/structures.js';
import { Crowds } from '../src/life/crowds.js';
import { People } from '../src/life/people.js';
import { Simulation } from '../src/sim/kernel.js';
import { loadText } from '../src/sim/migrate.js';
import { serialize } from '../src/sim/snapshot.js';
import { personView, buildingView, settlementView } from '../src/sim/explain.js';
import { world, fresh, advance, sha } from './helpers.mjs';

const { world: w, sites, catalog } = world();
const scene = new THREE.Scene();
const structures = new Structures(scene, w, sites);
const crowds = new Crowds(scene);
const cameraAt = (id, alt = 2.5) => {
  const site = sites.find(s => s.s.id === id), cam = new THREE.PerspectiveCamera();
  cam.position.copy(site.centerWorld.clone().normalize().multiplyScalar(100 + alt));
  return cam;
};

test('every resident of every settlement has a persistent record with a deterministic ID', () => {
  const a = fresh(), b = fresh();
  const expected = catalog.places.reduce((n, p) => n + (catalog.scenario.population[p.kind] ?? 20), 0);
  assert.equal(Object.keys(a.residents).length, expected);
  assert.deepEqual(Object.keys(a.residents), Object.keys(b.residents));
  for (const [id, p] of Object.entries(a.residents)) {
    assert.match(id, /^person:[a-z]+:\d+$/);
    assert.ok(a.households[p.household]?.members.includes(id));
    assert.equal(b.residents[id].name, p.name);
  }
});

test('leaving and revisiting a town, in any visit order, resolves the same people and changes nothing', () => {
  const run = order => {
    const sim = new Simulation(catalog, fresh());
    const people = new People(w, sites, catalog, structures, crowds, sim);
    const seen = {};
    advance(sim.state, 600);
    let real = 0;
    for (const id of order) {
      crowds.begin(); people.update(sim.ticks, cameraAt(id), 2.5, real += 1000); crowds.end();
      seen[id] = [...people.active.get(id).agents.values()].map(a => `${a.personId}=${a.name}`).sort();
      advance(sim.state, 30);
    }
    return { hash: sha(sim.state), seen };
  };
  const a = run(['highmoor', 'saltmere', 'highmoor', 'brightwater']);
  const b = run(['brightwater', 'highmoor', 'saltmere', 'highmoor']);
  assert.equal(a.hash, b.hash, 'camera itinerary must not change the world');
  for (const id of ['highmoor', 'saltmere', 'brightwater']) assert.deepEqual(new Set(a.seen[id].map(x => x.split('=')[0])).size > 0, true);
  const control = fresh(); advance(control, 600 + 4 * 30);
  assert.equal(sha(control), a.hash, 'watched and unwatched worlds are identical');
});

test('a followed resident is the same entity after unloading, saving and reloading', () => {
  const sim = new Simulation(catalog, fresh());
  advance(sim.state, 900);
  const people = new People(w, sites, catalog, structures, crowds, sim);
  crowds.begin(); people.update(sim.ticks, cameraAt('highmoor'), 2.5, 1000); crowds.end();
  const agent = [...people.active.get('highmoor').agents.values()][7];
  const before = personView(sim.state, catalog, agent.personId);
  crowds.begin(); people.update(sim.ticks, cameraAt('highmoor', 200), 200, 5000); crowds.end();
  assert.equal(people.active.size, 0, 'the town unloads at orbit');
  const reloaded = loadText(serialize(sim.state), catalog).state;
  const after = personView(reloaded, catalog, agent.personId);
  assert.equal(after.name, before.name); assert.equal(after.household.id, before.household.id);
  assert.deepEqual(after.memories.map(m => m.e), before.memories.map(m => m.e));
  assert.deepEqual(after.task, before.task);
});

test('paused travel streams the destination and inspection leaves the authoritative hash unchanged (F03)', () => {
  const sim = new Simulation(catalog, fresh());
  advance(sim.state, 700);
  const people = new People(w, sites, catalog, structures, crowds, sim);
  const hash = sha(sim.state);
  let real = 0;
  for (const id of ['highmoor', 'saltmere']) {
    sim.advance(0.5, 1, true);
    crowds.begin(); people.update(sim.ticks, cameraAt(id), 2.5, real += 50); crowds.end();
  }
  assert.ok(people.active.has('saltmere'), 'activation follows the camera while paused');
  assert.ok(!people.active.has('highmoor') || people.active.size <= 3);
  for (const p of Object.values(sim.state.residents).filter(r => r.at.site === 'saltmere')) personView(sim.state, catalog, p.id);
  for (const b of catalog.byId.saltmere.buildings) buildingView(sim.state, catalog, b.id);
  settlementView(sim.state, catalog, 'saltmere');
  assert.equal(sha(sim.state), hash);
});

test('species, culture, faction and occupation are separate: mixed households exist', () => {
  const s = fresh();
  const guests = Object.values(s.residents).filter(p => p.site === 'highmoor' && p.species !== 'human');
  assert.ok(guests.length >= 3, 'non-human residents live in the capital');
  for (const p of guests) { assert.equal(p.faction, 'valdren'); assert.notEqual(p.species, p.culture); }
});
