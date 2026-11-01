// A small pool of real point lights that follows the nearest lanterns, forges, braziers and runes,
// so streets glow after dark. The count stays fixed to avoid shader recompiles. Lights follow
// building state: a burnt, burning or unfinished building does not light its lanterns, and a fire
// lights its surroundings by its real intensity.

import * as THREE from 'three';

const POOL = 6;
const TYPES = {
  light: { color: 0xffb46a, intensity: 0.035, dist: 0.55 },
  fire: { color: 0xff7a2a, intensity: 0.07, dist: 0.8 },
  forge: { color: 0xff6a1a, intensity: 0.07, dist: 0.7 },
  rune: { color: 0x5fe3ff, intensity: 0.05, dist: 0.7 },
};

export class NightLights {
  constructor(scene, anchors, structures = null) {
    this.lights = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffb46a, 0, 0.6, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
    this.cell = 2;
    this.frame = 0;
    this.rebuild(anchors);
    // Anchors move when a building changes model; keep the candidate set in agreement (F11).
    if (structures) this.off = structures.onChange(c => { if (c.kind === 'model') this.rebuild(structures.anchors); });
  }
  rebuild(anchors) {
    this.cands = [];
    for (const key of ['light', 'fire', 'forge', 'rune']) for (const a of anchors[key]) this.cands.push({ p: a.p, t: TYPES[key], building: a.rec?.item?.id, ghost: a.rec && /ghost|crypt|mausoleum|gothic/.test(a.rec.model) });
    this.hash = new Map();
    for (const c of this.cands) {
      const k = this.key(c.p);
      if (!this.hash.has(k)) this.hash.set(k, []);
      this.hash.get(k).push(c);
    }
  }
  key(p) { return `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)},${Math.floor(p.z / this.cell)}`; }

  update(focus, camPos, night, alt, state = null, time = performance.now() / 1000, structures = null) {
    this.frame++;
    if (this.frame % 4 !== 0) return;
    const active = night > 0.05 && alt < 5;
    if (!active) { for (const l of this.lights) l.intensity = 0; return; }
    const near = [];
    const cx = Math.floor(focus.x / this.cell), cy = Math.floor(focus.y / this.cell), cz = Math.floor(focus.z / this.cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const arr = this.hash.get(`${cx + i},${cy + j},${cz + k}`);
      if (arr) for (const c of arr) {
        const b = state?.buildings[c.building];
        if (b && (b.incident || b.cond < 60 || b.stage === 'construction')) continue;
        near.push([c.p.distanceToSquared(focus) + c.p.distanceToSquared(camPos) * 0.5, c, 1]);
      }
    }
    if (state && structures) for (const town of Object.values(state.settlements)) for (const id of town.fires) {
      const x = state.incidents[id], rec = structures.byBuilding.get(x?.building);
      if (!rec) continue;
      const p = new THREE.Vector3().setFromMatrixPosition(rec.matrix);
      near.push([p.distanceToSquared(focus) * 0.5, { p, t: TYPES.fire, ghost: false }, 1 + 3 * x.intensity / 1000]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < POOL; i++) {
      const l = this.lights[i];
      const c = near[i] && near[i][1];
      if (!c) { l.intensity = 0; continue; }
      l.position.copy(c.p).addScaledVector(c.p.clone().normalize(), 0.03);
      l.color.set(c.ghost ? 0x6bff9a : c.t.color);
      l.distance = c.t.dist * Math.min(2, near[i][2]);
      l.intensity = c.t.intensity * night * near[i][2] * (0.9 + 0.1 * Math.sin(time * 8 + i));
    }
  }
  dispose() { this.off?.(); for (const l of this.lights) { l.removeFromParent(); l.dispose?.(); } }
}
