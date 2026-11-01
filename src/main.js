// Sosaria: bootstrap, main loop and wiring between systems.

import * as THREE from 'three';
import { buildWorld } from './world/build.js';
import { WorkerPool } from './terrain/pool.js';
import { Terrain } from './terrain/terrain.js';
import { GlobeCamera } from './core/camera.js';
import { PostFX } from './render/post.js';
import { RenderQuality } from './render/quality.js';
import { WorldClock, SkyLights } from './render/sky.js';
import { U } from './render/shared.js';
import { latLonToDir, PLANET_RADIUS } from './core/sphere.js';
import { mulberry32 } from './core/noise.js';
import './models/human.js';
import './models/cultures.js';
import { layoutSettlements, streetSegments } from './world/settlements.js';
import { Structures } from './world/structures.js';
import { Vegetation } from './world/vegetation.js';
import { Waters } from './render/rivers.js';
import { Particles, PT, WeatherVolume } from './render/particles.js';
import { Bubbles } from './life/bubbles.js';
import { NightLights } from './render/nightlights.js';
import { Clouds } from './render/clouds.js';
import { Props } from './render/props.js';
import { VOLCANO } from './world/atlas.js';
import { People } from './life/people.js';
import { Crowds } from './life/crowds.js';
import { Traffic } from './life/traffic.js';
import { Wildlife } from './life/wildlife.js';
import { Dragons } from './life/dragons.js';
import { FX } from './render/fx.js';
import { Events } from './life/events.js';
import { HUD } from './ui/hud.js';
import { catalogFromWorld, createState } from './sim/state.js';
import { Simulation } from './sim/step.js';
import { loadWorld, saveWorld, snapshot, parseSnapshot } from './sim/storage.js';

const R = PLANET_RADIUS;

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const loadingBar = document.getElementById('loading-bar');

function progress(p, msg) {
  if (loadingBar) loadingBar.style.width = `${Math.round(p * 100)}%`;
  if (loadingText && msg) loadingText.textContent = msg;
}

async function frameYield() { await new Promise(r => requestAnimationFrame(() => r())); }

async function main() {
  progress(0.02, 'Kindling the forge');
  await frameYield();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);

  const world = buildWorld(progress);
  await frameYield();
  progress(0.82, 'Founding the towns');
  await frameYield();
  const tLay = performance.now();
  const sites = layoutSettlements(world);
  world.addSegments(streetSegments(sites, world.field));
  const layMs = performance.now() - tLay;
  progress(0.85, 'Waking the world');

  const pool = new WorkerPool(world.features);
  const terrain = new Terrain(scene, world.features, { pool, maxInFlight: 12 });
  terrain.preload(2);

  const clock = new WorldClock();
  const catalog = catalogFromWorld(sites, world.roads);
  let restored = { state: null, warning: '' };
  try { restored = loadWorld(localStorage, catalog); } catch { restored.warning = 'Browser storage is unavailable. Export your world to keep it.'; }
  const sim = new Simulation(catalog, restored.state || createState(catalog));
  clock.sync(sim.seconds);
  let simTime = sim.seconds;
  const structures = new Structures(scene, world, sites);
  const vegetation = new Vegetation(scene, pool);
  const waters = new Waters(scene, world);
  const props = new Props(scene, structures);
  const clouds = new Clouds(scene);
  const particles = buildEmitters(new Particles(scene), world, structures, waters, sites).build();
  const crowds = new Crowds(scene);
  const people = new People(world, sites, clock, structures, crowds, sim);
  const traffic = new Traffic(world, sites, crowds, sim);
  const wildlife = new Wildlife(world, crowds);
  const fx = new FX(scene);
  const dragons = new Dragons(scene, world, fx);
  const bubbles = new Bubbles(scene);
  const nightLights = new NightLights(scene, structures.anchors);
  const weather = new WeatherVolume(scene);
  console.log(`world ${world.buildMs.toFixed(0)}ms, towns ${layMs.toFixed(0)}ms, structures ${structures.count}`);

  const sky = new SkyLights(scene);
  const post = new PostFX(renderer);

  const field = world.field;
  // Camera ground: terrain, or the roof of whatever stands there.
  const heightAt = (v) => Math.max(field.height(v.x, v.y, v.z), structures.roofAt(v));
  const controls = new GlobeCamera(camera, canvas, heightAt);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  controls.reducedMotion = motion.matches;
  motion.addEventListener('change', () => { controls.reducedMotion = motion.matches; });
  const start = latLonToDir(30, -32);
  controls.setView(new THREE.Vector3(...latLonToDir(18, -62)), 420, 0);

  let savedQuality = 'auto';
  try { savedQuality = localStorage.getItem('sosaria-quality') || 'auto'; } catch {}
  const quality = new RenderQuality(savedQuality);
  const drawSize = new THREE.Vector2();
  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(quality.pixelRatio(w, h, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(drawSize);
    post.setSize(drawSize.x, drawSize.y, quality.settings.samples, quality.settings.bloom);
    post.atmoMat.uniforms.uAtmoSteps.value = quality.settings.atmosphere;
    sky.setShadowSize(quality.settings.shadow);
    U.uDetail.value = quality.settings.detail;
  }
  window.addEventListener('resize', resize);
  resize();

  const app = { renderer, scene, camera, world, terrain, clock, sky, post, controls, pool, field, sites, structures, vegetation, waters, props, clouds, particles, people, crowds, traffic, wildlife, dragons, fx, bubbles, nightLights, weather, quality, THREE, sim, stats: {}, simTime: () => simTime, saveStatus: restored.warning || (restored.state ? 'World restored.' : 'A new history has begun.') };
  app.save = () => {
    try { saveWorld(localStorage, sim.state, catalog); app.events?.saveView(); app.saveStatus = `Saved at world second ${sim.state.tick}.`; return true; }
    catch (e) { app.saveStatus = `Save unavailable: ${e.message} Export your world to keep it.`; return false; }
  };
  app.exportWorld = () => snapshot(sim.state);
  app.replaceWorld = state => {
    sim.replace(state); simTime = sim.seconds; clock.sync(simTime);
    people.active.clear(); people.lastScan = null; traffic.shipments.clear();
    app.hud?.stopFollow(); app.events?.reset(); structures.applyState(state);
    app.save();
  };
  app.importWorld = text => { const state = parseSnapshot(text, catalog); app.save(); app.replaceWorld(state); };
  app.newWorld = seed => { app.save(); app.replaceWorld(createState(catalog, seed)); };
  app.setQuality = mode => {
    quality.setMode(mode);
    try { localStorage.setItem('sosaria-quality', quality.mode); } catch {}
    resize();
  };
  window.__sosaria = app;

  // Wait until the coarse globe exists before revealing it.
  const t0 = performance.now();
  controls.update(0.016);
  while (terrain.queue.length + terrain.pending.size > 0 && performance.now() - t0 < 20000) {
    terrain.update(camera, performance.now());
    progress(0.85 + 0.15 * Math.min(1, terrain.readyCount / 102), 'Raising mountains');
    await new Promise(r => setTimeout(r, 30));
  }
  app.events = new Events(app);
  app.hud = new HUD(app);
  // Drift in from deep space toward Aldmere.
  controls.flyTo(new THREE.Vector3(...start), 235, { duration: 5.5 });
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 1200);

  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  let lastSave = performance.now(), lastStructuresTick = -1;

  let errors = 0;
  document.addEventListener('visibilitychange', () => { last = performance.now(); quality.reset(); if (document.hidden) app.save(); });
  window.addEventListener('pagehide', () => app.save());
  const fogZones = [[19, -177, 9, 1.0], [-36, 134, 6, 0.6], [47.3, -14.2, 2.5, 0.35]].map(([la, lo, r, k]) => ({
    d: latLonToDir(la, lo), chord: 1 - Math.cos(r * Math.PI / 180), k,
  }));
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    try { step(now); } catch (e) { if (errors++ < 3) console.error(e); }
  }
  function step(now) {
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.1, elapsed);
    last = now;
    if (quality.update(elapsed)) resize();
    const before = sim.seconds, simStart = performance.now();
    sim.advance(elapsed, clock.speed, clock.paused);
    app.stats.simMs = performance.now() - simStart;
    simTime = sim.seconds;
    const simDt = simTime - before;
    clock.sync(simTime);
    U.uTime.value = simTime;

    controls.update(dt);
    U.uCamPos.value.copy(camera.position);
    U.uFocus.value.copy(controls.surfacePoint);

    const alt = controls.alt;
    const span = Math.min(30, Math.max(1.2, alt * 1.6));
    sky.update(clock, controls.surfacePoint, span, alt < 30);
    const sunUp = controls.focus.dot(sky.sunDir);
    const day = THREE.MathUtils.smoothstep(sunUp, -0.18, 0.2);

    terrain.update(camera, now);
    vegetation.update(camera, alt);
    const gameSeconds = simTime;
    const cover = 0.5 + 0.25 * Math.sin(clock.day * 0.9) + 0.1 * Math.sin(clock.day * 2.3);
    clouds.update(simDt, gameSeconds, cover, field, camera.position);
    clouds.mesh.castShadow = sunUp > 0.35;
    props.update(U.uTime.value);
    const lifeStart = performance.now();
    if (app.events) app.events.update(simDt);
    if (lastStructuresTick !== sim.state.tick) { structures.applyState(sim.state); lastStructuresTick = sim.state.tick; }
    crowds.begin();
    people.update(simDt, camera, alt);
    traffic.update(gameSeconds, camera, alt);
    wildlife.update(simTime, camera, alt, clock);
    crowds.end();
    dragons.update(simDt, simTime, clock, camera.position);
    app.stats.lifeMs = performance.now() - lifeStart;
    fx.update(simDt, camera);
    bubbles.update(people, camera, U.uTime.value);
    nightLights.update(controls.surfacePoint, camera.position, 1 - day, alt, sim.state, simTime);
    weather.update(controls.surfacePoint, field, alt);
    if (app.hud) app.hud.update();
    if (now - lastSave > 30000) { app.save(); lastSave = now; }

    // Morning mist and night fog; the Gloamfen and the Thornwood are always shrouded.
    const hourHere = clock.hourAt(Math.atan2(-controls.focus.z, controls.focus.x) * 180 / Math.PI);
    const fogAmount = 0.35 * Math.exp(-Math.pow((hourHere - 6.2) / 1.6, 2)) + 0.12 * (1 - day) + 0.25 * clouds.stormNear;
    // Exposure from the local daylight at the focus, flattened out at orbit.
    const localExp = THREE.MathUtils.lerp(2.1, 1.0, day);
    const orbitK = THREE.MathUtils.smoothstep(alt, 25, 140);
    const exposure = THREE.MathUtils.lerp(localExp, 1.15, orbitK);

    renderer.info.reset();
    post.render(scene, camera, {
      sunDir: sky.sunDir, moonDir: sky.moonDir, moon2Dir: sky.moon2Dir, time: U.uTime.value,
      exposure, outline: 0.55 * (1 - THREE.MathUtils.smoothstep(alt, 6, 30)), outlineFar: Math.min(14, Math.max(2.5, alt * 3)), bloom: 0.4, sunI: 24, moonI: 0.35 + sky.phase * 0.6,
      storm: clouds.stormNear,
      fog: fogAmount, fogZones,
    });

    app.stats.extra = { ...vegetation.stats, people: people.count };
    app.stats.calls = renderer.info.render.calls;
    app.stats.frameMs = elapsed * 1000;
    app.stats.heapMB = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    app.stats.tris = renderer.info.render.triangles;
    fpsAcc += elapsed; fpsN++;
    if (fpsAcc > 0.5) { app.stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; app.stats.scale = quality.scale; app.stats.quality = quality.name; }
  }
  requestAnimationFrame(frame);
}

function buildEmitters(P, world, structures, waters, sites) {
  const A = structures.anchors;
  for (const a of A.smoke) P.add(PT.smoke, a.p, 1, a.rec.model === 'great_brazier' ? 4 : 1);
  for (const a of A.fire) P.add(PT.fire, a.p, a.rec.model === 'great_brazier' ? 6 : 1, 1);
  for (const a of A.fire) if (a.rec.model === 'great_brazier' || a.rec.model === 'bonfire') P.add(PT.ember, a.p, 0.6, 0.6, 6);
  for (const a of A.forge) P.add(PT.spark, a.p, 1, 1);
  for (const a of A.rune) P.add(PT.mote, a.p, a.rec.model === 'runeblade' || a.rec.model === 'elf_greatspire' ? 4 : 1, 1, a.rec.model === 'runeblade' ? 30 : 7);
  for (const f of waters.falls) P.add(PT.mist, f.p, Math.min(2, 0.6 + f.drop), 1, 26);
  if (waters.lavaMouth) P.add(PT.steam, waters.lavaMouth, 1, 1, 40);
  const vd = new THREE.Vector3(...latLonToDir(VOLCANO.lat, VOLCANO.lon));
  const vtop = vd.clone().multiplyScalar(R + VOLCANO.height - 0.9);
  P.add(PT.plume, vtop, 1, 1, 90);
  P.add(PT.ember, vtop, 4, 2.5, 60);
  P.add(PT.lava, vtop.clone().addScaledVector(vd, -0.4), 3, 2, 30);
  const rnd = mulberry32(55);
  for (const site of sites) {
    const cult = site.s.culture;
    const c = site.centerWorld;
    const up = c.clone().normalize();
    const tx = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
    const ty = new THREE.Vector3().crossVectors(up, tx);
    const around = (r, n, type, strength, size, count) => {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r;
        const p = c.clone().addScaledVector(tx, Math.cos(a) * rr).addScaledVector(ty, Math.sin(a) * rr);
        const d = p.clone().normalize();
        p.copy(d.multiplyScalar(R + Math.max(0, world.field.height(d.x, d.y, d.z)) + 0.02));
        P.add(type, p, strength, size, count);
      }
    };
    if (cult === 'fae') { around(site.s.radius * 1.4, 10, PT.fae, 1.2, 1); around(site.s.radius * 2.5, 8, PT.firefly, 1.5, 1); }
    if (cult === 'undead') around(site.s.radius * 1.3, 12, PT.ghost, 1.5, 1.3);
    if (cult === 'elf') around(site.s.radius * 1.5, 8, PT.firefly, 1.5, 1);
    if (cult === 'human' && (site.s.kind === 'village' || site.s.kind === 'hamlet')) around(site.s.pad.farmR, 5, PT.firefly, 1.5, 1);
  }
  return P;
}

main().catch(err => {
  console.error(err);
  if (loadingText) loadingText.textContent = 'Something broke while building the world: ' + err.message;
});
