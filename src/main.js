// Sosaria: composition, lifecycle and the frame loop. The simulation kernel owns world state; every
// system here reads it (or submits commands) and owns only its own presentation resources.

import * as THREE from 'three';
import { buildWorldDefinition } from './world/definition.js';
import { WorkerPool } from './terrain/pool.js';
import { Terrain } from './terrain/terrain.js';
import { GlobeCamera } from './core/camera.js';
import { PostFX } from './render/post.js';
import { RenderQuality } from './render/quality.js';
import { WorldClock, SkyLights } from './render/sky.js';
import { U } from './render/shared.js';
import { latLonToDir, PLANET_RADIUS } from './core/sphere.js';
import { mulberry32 } from './core/noise.js';
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
import { IncidentFX } from './life/events.js';
import { HUD } from './ui/hud.js';
import { showError, hideError } from './ui/errors.js';
import { catalogFromWorld } from './sim/catalog.js';
import { createWorld } from './sim/world-state.js';
import { Simulation } from './sim/kernel.js';
import { weatherSeconds } from './sim/weather.js';
import { stateHash } from './sim/snapshot.js';
import { IndexedDBBackend, MemoryBackend } from './persistence/backend.js';
import { SaveService, acquireWorldLock } from './persistence/saves.js';
import { validateAll } from './content/validate.js';

const R = PLANET_RADIUS;
const AUTOSAVE_MS = 60000;

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const loadingBar = document.getElementById('loading-bar');

function progress(p, msg) {
  if (loadingBar) loadingBar.style.width = `${Math.round(p * 100)}%`;
  if (loadingText && msg) loadingText.textContent = msg;
}
const frameYield = () => new Promise(r => requestAnimationFrame(() => r()));

function loadSettings() {
  try { return { reducedMotion: 'system', calmEffects: false, ...JSON.parse(localStorage.getItem('sosaria-settings') || '{}') }; }
  catch { return { reducedMotion: 'system', calmEffects: false }; }
}

async function openSaves() {
  const lock = await acquireWorldLock();
  try {
    const backend = await IndexedDBBackend.open();
    return { saves: new SaveService(backend, { tabId: Math.random().toString(36).slice(2, 10), readOnly: !lock.held }), lock, warning: lock.held ? '' : 'This world is already open in another tab. This tab can explore but will not save.' };
  } catch (e) {
    return { saves: new SaveService(new MemoryBackend(), { tabId: 'memory', readOnly: !lock.held }), lock, warning: `${e.message} Saves last only until this tab closes.` };
  }
}

async function main() {
  progress(0.02, 'Kindling the forge');
  await frameYield();
  const contentErrors = validateAll();
  if (contentErrors.length) throw new Error(`Content definitions are invalid: ${contentErrors.slice(0, 3).join('; ')}`);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);

  const { world, sites } = buildWorldDefinition(progress);
  await frameYield();
  console.log(`world ${world.buildMs.toFixed(0)}ms, towns ${world.layoutMs.toFixed(0)}ms, sea routes ${world.seaMs.toFixed(0)}ms`);
  progress(0.85, 'Waking the world');

  const pool = new WorkerPool(world.features);
  const terrain = new Terrain(scene, world.features, { pool, maxInFlight: 12 });
  terrain.preload(2);

  const catalog = catalogFromWorld(world, sites);
  const { saves, lock, warning: saveWarning } = await openSaves();
  let restored = { state: null, warnings: [] }, migrated = null;
  try {
    restored = await saves.latest(catalog);
    if (!restored.state) migrated = await saves.migrateLegacy(globalThis.localStorage, catalog);
  } catch (e) { restored.warnings.push(e.message); }
  const initial = restored.state || migrated?.state || createWorld(catalog);
  const sim = new Simulation(catalog, initial);
  const clock = new WorldClock();
  clock.sync(sim.ticks);
  const settings = loadSettings();

  const structures = new Structures(scene, world, sites);
  const vegetation = new Vegetation(scene, pool);
  const waters = new Waters(scene, world);
  const props = new Props(scene, structures);
  const clouds = new Clouds(scene);
  const particles = buildEmitters(new Particles(scene), world, structures, waters, sites).build();
  const crowds = new Crowds(scene);
  const people = new People(world, sites, catalog, structures, crowds, sim);
  const traffic = new Traffic(world, sites, crowds, sim, catalog);
  const wildlife = new Wildlife(world, crowds);
  const fx = new FX(scene);
  const dragons = new Dragons(scene, world, fx);
  const bubbles = new Bubbles(scene);
  const nightLights = new NightLights(scene, structures.anchors, structures);
  const weather = new WeatherVolume(scene);
  structures.applyState(sim.state);

  const sky = new SkyLights(scene);
  const post = new PostFX(renderer);

  const field = world.field;
  // Camera ground: terrain, or the roof of whatever stands there.
  const heightAt = (v) => Math.max(field.height(v.x, v.y, v.z), structures.roofAt(v));
  const controls = new GlobeCamera(camera, canvas, heightAt);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const applyMotion = () => { controls.reducedMotion = settings.reducedMotion === 'on' || settings.reducedMotion === 'system' && motion.matches; };
  applyMotion();
  motion.addEventListener('change', applyMotion);
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

  const saveStatus = [saveWarning, ...restored.warnings, restored.warning].filter(Boolean).join(' ');
  const app = {
    renderer, scene, camera, world, catalog, terrain, clock, sky, post, controls, pool, field, sites, structures, vegetation, waters, props, clouds, particles,
    people, crowds, traffic, wildlife, dragons, fx, bubbles, nightLights, weather, quality, THREE, sim, saves, settings, stats: {}, slot: restored.meta?.slot || migrated?.meta.slot || null,
    saveStatus: saveStatus || (restored.state ? `World restored from "${restored.meta.name}".` : migrated ? 'Your Sosaria 0.1 world was migrated into a new save slot.' : 'A new history has begun.'),
    readOnly: saves.readOnly,
  };
  // Saving never blocks the frame and never writes a world that failed mid-tick.
  app.save = async (slot = app.slot || 'manual-1', options = {}) => {
    if (sim.faulted) { app.saveStatus = 'Saving is disabled: the simulation stopped after an error. Your last good save is intact.'; return false; }
    try {
      const meta = await saves.save(slot, sim.state, catalog, options);
      app.slot = slot; app.saveStatus = `Saved "${meta.name}" · ${meta.date}.`; return meta;
    } catch (e) { app.saveStatus = `Not saved: ${e.message}`; return false; }
  };
  app.autosave = async () => {
    if (sim.faulted || saves.readOnly) return false;
    try { const meta = await saves.autosave(sim.state, catalog); app.lastAutosave = meta; return meta; }
    catch (e) { app.saveStatus = `Autosave failed: ${e.message} Export your world to keep it.`; return false; }
  };
  app.exportWorld = () => saves.exportWorld(sim.state, { slot: app.slot, hash: stateHash(sim.state) });
  app.replaceWorld = (state, slot = null) => {
    sim.replace(state); clock.sync(sim.ticks);
    people.reset(); traffic.shipments.clear();
    app.hud?.reset(); structures.resetState?.(); structures.applyState(state);
    app.slot = slot;
  };
  app.importWorld = async text => { const { state } = saves.importWorld(text, catalog); app.replaceWorld(state, null); return state; };
  app.loadSlot = async slot => { const r = await saves.load(slot, catalog); app.replaceWorld(r.state, slot); app.saveStatus = r.warning || `Loaded "${r.meta.name}".`; return r; };
  app.newWorld = seed => { app.replaceWorld(createWorld(catalog, seed), null); app.saveStatus = 'A new history has begun.'; };
  // An experiment is an explicit branch: a new slot that remembers where it came from.
  app.branch = async label => {
    const origin = { slot: app.slot, tick: sim.state.tick, hash: stateHash(sim.state) };
    const state = structuredClone(sim.state);
    state.branch = { label: String(label || 'Experiment').slice(0, 60), origin, created: sim.state.tick };
    app.replaceWorld(state, null);
    const slot = `branch-${Date.now().toString(36)}`;
    return app.save(slot, { name: state.branch.label });
  };
  app.setQuality = mode => {
    quality.setMode(mode);
    try { localStorage.setItem('sosaria-quality', quality.mode); } catch {}
    resize();
  };
  app.setSetting = (key, value) => {
    settings[key] = value;
    try { localStorage.setItem('sosaria-settings', JSON.stringify(settings)); } catch {}
    applyMotion();
  };
  window.__sosaria = app;

  // WebGL context loss: stop drawing, keep the world, and offer a reload from the last save.
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); contextLost = true; app.autosave();
    showError({ title: 'Graphics paused', message: 'The browser lost the graphics context. The world is safe; it was autosaved. Waiting for the browser to restore graphics.',
      actions: [{ label: 'Reload from save', run: () => location.reload() }] });
  });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; resize(); hideError(); });

  // Wait until the coarse globe exists before revealing it.
  const t0 = performance.now();
  controls.update(0.016);
  while (terrain.queue.length + terrain.pending.size > 0 && performance.now() - t0 < 20000) {
    terrain.update(camera, performance.now());
    progress(0.85 + 0.15 * Math.min(1, terrain.readyCount / 102), 'Raising mountains');
    await new Promise(r => setTimeout(r, 30));
  }
  app.incidents = new IncidentFX(app);
  app.hud = new HUD(app);
  // Drift in from deep space toward Aldmere.
  controls.flyTo(new THREE.Vector3(...start), 235, { duration: 5.5 });
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 1200);

  let last = performance.now(), raf = 0, lastAutosave = performance.now(), structuresTick = -1, fpsAcc = 0, fpsN = 0;
  // Hidden tabs do not simulate: returning never runs hours of famine in one frame.
  const onVisibility = () => { last = performance.now(); quality.reset(); if (document.hidden) app.autosave(); };
  const onHide = () => app.autosave();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onHide);
  const fogZones = [[19, -177, 9, 1.0], [-36, 134, 6, 0.6], [47.3, -14.2, 2.5, 0.35]].map(([la, lo, r, k]) => ({
    d: latLonToDir(la, lo), chord: 1 - Math.cos(r * Math.PI / 180), k,
  }));

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || contextLost) { last = now; return; }
    try { step(now); }
    catch (e) {
      // Stop instead of looping on a broken state; the last valid save is untouched.
      cancelAnimationFrame(raf);
      console.error(e);
      showError({ title: 'Sosaria stopped', message: `Something went wrong at world minute ${sim.state.tick}: ${e.message}. Nothing after the last save has been written.`,
        actions: [{ label: 'Reload last save', run: () => location.reload() }, { label: 'Export this state for a report', run: () => app.hud?.download(app.exportWorld(), 'sosaria-error-state.json') }] });
    }
  }
  function step(now) {
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.1, elapsed);
    last = now;
    if (quality.update(elapsed)) resize();
    const simStart = performance.now();
    sim.advance(elapsed, clock.speed, clock.paused);
    app.stats.simMs = performance.now() - simStart;
    const ticks = sim.ticks;
    clock.sync(ticks);
    const seconds = clock.seconds;
    U.uTime.value = seconds;

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
    const cover = 0.5 + 0.25 * Math.sin(clock.day * 0.9) + 0.1 * Math.sin(clock.day * 2.3);
    const simDt = clock.paused ? 0 : sim.lastTicks * 420 / 1440;
    clouds.update(simDt, weatherSeconds(ticks), cover, field, camera.position);
    clouds.mesh.castShadow = sunUp > 0.35;
    props.update(seconds);
    const lifeStart = performance.now();
    if (structuresTick !== sim.state.tick) { structures.applyState(sim.state); structuresTick = sim.state.tick; }
    app.incidents.update(clock.paused ? 0 : dt);
    crowds.begin();
    people.update(ticks, camera, alt, now);
    traffic.update(seconds, camera, alt, ticks);
    wildlife.update(seconds, camera, alt, clock);
    crowds.end();
    dragons.update(simDt, seconds, clock, camera.position);
    app.stats.lifeMs = performance.now() - lifeStart;
    fx.update(clock.paused && settings.photo ? 0 : dt, camera);
    bubbles.update(people, camera, seconds);
    nightLights.update(controls.surfacePoint, camera.position, 1 - day, alt, sim.state, seconds, structures);
    weather.update(controls.surfacePoint, field, alt);
    app.hud.update();
    if (now - lastAutosave > AUTOSAVE_MS) { lastAutosave = now; app.autosave(); }

    // Morning mist and night fog; the Gloamfen and the Thornwood are always shrouded.
    const hourHere = clock.hourAt(Math.atan2(-controls.focus.z, controls.focus.x) * 180 / Math.PI);
    const fogAmount = 0.35 * Math.exp(-Math.pow((hourHere - 6.2) / 1.6, 2)) + 0.12 * (1 - day) + 0.25 * clouds.stormNear;
    const localExp = THREE.MathUtils.lerp(2.1, 1.0, day);
    const orbitK = THREE.MathUtils.smoothstep(alt, 25, 140);
    const exposure = THREE.MathUtils.lerp(localExp, 1.15, orbitK);

    renderer.info.reset();
    post.render(scene, camera, {
      sunDir: sky.sunDir, moonDir: sky.moonDir, moon2Dir: sky.moon2Dir, time: seconds,
      exposure, outline: 0.55 * (1 - THREE.MathUtils.smoothstep(alt, 6, 30)), outlineFar: Math.min(14, Math.max(2.5, alt * 3)), bloom: settings.calmEffects ? 0.2 : 0.4, sunI: 24, moonI: 0.35 + sky.phase * 0.6,
      storm: clouds.stormNear, fog: fogAmount, fogZones,
    });

    app.stats.extra = { ...vegetation.stats, people: people.count };
    app.stats.calls = renderer.info.render.calls;
    app.stats.frameMs = elapsed * 1000;
    app.stats.heapMB = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
    app.stats.tris = renderer.info.render.triangles;
    app.stats.achieved = sim.clock.achieved;
    fpsAcc += elapsed; fpsN++;
    if (fpsAcc > 0.5) { app.stats.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; app.stats.scale = quality.scale; app.stats.quality = quality.name; }
  }
  raf = requestAnimationFrame(frame);

  // Explicit teardown: listeners, workers, the world lock and GPU resources.
  app.dispose = () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onHide);
    window.removeEventListener('resize', resize);
    motion.removeEventListener('change', applyMotion);
    app.hud?.dispose?.();
    nightLights.dispose();
    pool.dispose();
    lock.release?.();
    scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => x.dispose?.()); });
    renderer.dispose();
  };
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
