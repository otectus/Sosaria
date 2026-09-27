// A small pool of real point lights that follows the nearest lanterns, forges, braziers and runes,
// so streets glow after dark. The count stays fixed to avoid shader recompiles.

import * as THREE from 'three';

const POOL = 6;
const TYPES = {
  light: { color: 0xffb46a, intensity: 0.035, dist: 0.55 },
  fire: { color: 0xff7a2a, intensity: 0.07, dist: 0.8 },
  forge: { color: 0xff6a1a, intensity: 0.07, dist: 0.7 },
  rune: { color: 0x5fe3ff, intensity: 0.05, dist: 0.7 },
};

export class NightLights {
  constructor(scene, anchors) {
    this.lights = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffb46a, 0, 0.6, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
    this.cands = [];
    for (const key of ['light', 'fire', 'forge', 'rune']) for (const a of anchors[key]) this.cands.push({ p: a.p, t: TYPES[key], ghost: a.rec && /ghost|crypt|mausoleum|gothic/.test(a.rec.model) });
    // Coarse spatial hash for fast nearest queries.
    this.cell = 2;
    this.hash = new Map();
    for (const c of this.cands) {
      const k = this.key(c.p);
      if (!this.hash.has(k)) this.hash.set(k, []);
      this.hash.get(k).push(c);
    }
    this.frame = 0;
  }
  key(p) { return `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)},${Math.floor(p.z / this.cell)}`; }

  update(focus, camPos, night, alt) {
    this.frame++;
    if (this.frame % 4 !== 0) return;
    const active = night > 0.05 && alt < 5;
    if (!active) { for (const l of this.lights) l.intensity = 0; return; }
    const near = [];
    const cx = Math.floor(focus.x / this.cell), cy = Math.floor(focus.y / this.cell), cz = Math.floor(focus.z / this.cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const arr = this.hash.get(`${cx + i},${cy + j},${cz + k}`);
      if (arr) for (const c of arr) near.push([c.p.distanceToSquared(focus) + c.p.distanceToSquared(camPos) * 0.5, c]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < POOL; i++) {
      const l = this.lights[i];
      const c = near[i] && near[i][1];
      if (!c) { l.intensity = 0; continue; }
      l.position.copy(c.p).addScaledVector(c.p.clone().normalize(), 0.03);
      l.color.set(c.ghost ? 0x6bff9a : c.t.color);
      l.distance = c.t.dist;
      l.intensity = c.t.intensity * night * (0.9 + 0.1 * Math.sin(performance.now() * 0.008 + i));
    }
  }
}
