// World clock, sun and moons. The planet stays still; the sun and moons circle it.

import * as THREE from 'three';
import { latLonToDir, PLANET_RADIUS } from '../core/sphere.js';
import { U } from './shared.js';
import { REAL_SECONDS_PER_DAY, TICKS_PER_DAY, dayAt, declinationAt, localDayAt } from '../sim/clock.js';

const R = PLANET_RADIUS;

// Presentation view of canonical time. It never advances itself: the simulation's tick (plus the
// interpolation fraction) is the only source, so the sky cannot run ahead of skipped work.
export class WorldClock {
  constructor() {
    this.dayLength = REAL_SECONDS_PER_DAY;
    this.speed = 1;
    this.paused = false;
    this.ticks = 0;
    this.day = dayAt(0);
  }
  sync(ticks) { this.ticks = ticks; this.day = dayAt(ticks); }
  // World seconds at the original pacing, for animation that predates the tick clock.
  get seconds() { return this.ticks * REAL_SECONDS_PER_DAY / TICKS_PER_DAY; }
  get subsolarLon() { return wrapLon(-360 * this.day); }
  get declination() { return declinationAt(this.ticks); }
  // Hour of day (0..24) at a longitude.
  hourAt(lon) {
    let h = ((lon - this.subsolarLon) / 15 + 12) % 24;
    if (h < 0) h += 24;
    return h;
  }
  sunDir(out = new THREE.Vector3()) {
    const d = latLonToDir(this.declination, this.subsolarLon);
    return out.set(d[0], d[1], d[2]);
  }
  moonDir(out = new THREE.Vector3()) {
    const d = latLonToDir(9 * Math.sin((2 * Math.PI * this.day) / 4.3), wrapLon(-360 * this.day * 0.93 + 150));
    return out.set(d[0], d[1], d[2]);
  }
  moon2Dir(out = new THREE.Vector3()) {
    const d = latLonToDir(24 * Math.sin((2 * Math.PI * this.day) / 2.7 + 1), wrapLon(-360 * this.day * 0.81 + 40));
    return out.set(d[0], d[1], d[2]);
  }
  get dayNumber() { return this.localDay(0); }
  // Days turn over at local midnight.
  localDay(lon) { return localDayAt(this.ticks, lon); }
}

function wrapLon(l) {
  l = ((l + 180) % 360 + 360) % 360 - 180;
  return l;
}

export function timeOfDayName(h) {
  if (h < 4.5) return 'Deep Night';
  if (h < 6) return 'Dawn';
  if (h < 8) return 'Morning';
  if (h < 11) return 'Forenoon';
  if (h < 13.5) return 'Midday';
  if (h < 16.5) return 'Afternoon';
  if (h < 18.5) return 'Dusk';
  if (h < 20) return 'Evening';
  if (h < 23) return 'Night';
  return 'Deep Night';
}

export class SkyLights {
  constructor(scene) {
    this.sun = new THREE.DirectionalLight(0xfff4e6, 3.1);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(4096, 4096);
    s.bias = -0.0004;
    s.normalBias = 0.02;
    s.camera.near = 0.1;
    s.camera.far = 400;
    s.radius = 1.5;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9fb4ff, 0.55);
    scene.add(this.moon);
    scene.add(this.moon.target);
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.moon2Dir = new THREE.Vector3();
    this.shadowRight = new THREE.Vector3();
    this.shadowUp = new THREE.Vector3();
    this.shadowFocus = new THREE.Vector3();
  }

  // focusPoint: surface point under the camera; span: half-size of the shadow frustum.
  setShadowSize(size) {
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x === size) return;
    shadow.map?.dispose();
    shadow.map = null;
    shadow.mapSize.set(size, size);
    shadow.needsUpdate = true;
  }

  update(clock, focusPoint, span, shadowsOn) {
    clock.sunDir(this.sunDir);
    clock.moonDir(this.moonDir);
    clock.moon2Dir(this.moon2Dir);
    U.uSunDir.value.copy(this.sunDir);
    U.uMoonDir.value.copy(this.moonDir);
    // Moon brightness from its phase (lit fraction seen from the planet).
    const phase = 0.5 * (1 - this.sunDir.dot(this.moonDir));
    U.uMoonLight.value = 0.25 + 0.95 * phase;
    this.phase = phase;

    // Snap the light's target in its own projection plane to stabilize small camera movements.
    const texel = (2 * span) / this.sun.shadow.mapSize.x;
    const right = this.shadowRight.set(0, Math.abs(this.sunDir.y) < 0.95 ? 1 : 0, Math.abs(this.sunDir.y) < 0.95 ? 0 : 1).cross(this.sunDir).normalize();
    const up = this.shadowUp.crossVectors(this.sunDir, right);
    const x = focusPoint.dot(right), y = focusPoint.dot(up);
    const target = this.shadowFocus.copy(focusPoint)
      .addScaledVector(right, Math.round(x / texel) * texel - x)
      .addScaledVector(up, Math.round(y / texel) * texel - y);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 60);
    this.moon.target.position.copy(focusPoint);
    this.moon.position.copy(focusPoint).addScaledVector(this.moonDir, 60);
    this.sun.castShadow = shadowsOn && focusPoint.dot(this.sunDir) / focusPoint.length() > -0.05;
    const cam = this.sun.shadow.camera;
    if (cam.right !== span) {
      cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
      cam.near = 1; cam.far = 120;
      cam.updateProjectionMatrix();
    }
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = texel * 1.2;
  }
}
