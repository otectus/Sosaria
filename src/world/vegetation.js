// Vegetation manager: streams scatter cells from the workers around the camera and packs them
// into one InstancedMesh per species. Three tiers: far canopy clumps, trees, ground detail.

import * as THREE from 'three';
import { LAYERS, SPECIES } from './scatter-gen.js';
import { FLORA_BUILDERS, floraTint } from '../models/flora.js';
import { makeFloraMaterial } from '../render/materials.js';
import { dirToCell, cellCenterDir, PLANET_RADIUS, tangentFrame } from '../core/sphere.js';

const R = PLANET_RADIUS;
const TREE_SPECIES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DETAIL_SPECIES = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
const _tint = [1, 1, 1];

class Layer {
  constructor(name, species, scene, pool, fade, sway, castShadow) {
    this.name = name;
    this.G = LAYERS[name].G;
    this.pool = pool;
    this.cells = new Map(); // cell -> {state, bySpecies}
    this.active = new Set();
    this.dirty = false;
    this.meshes = new Map();
    const { mat, depth, uniforms } = makeFloraMaterial(name, fade, sway);
    this.uniforms = uniforms;
    for (const sp of species) {
      const geo = FLORA_BUILDERS[sp]();
      const mesh = new THREE.InstancedMesh(geo, mat, 16);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = castShadow && sp !== SPECIES.grass && sp !== SPECIES.flower && sp !== SPECIES.wheat;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = depth;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16 * 3), 3);
      mesh.name = `${name}-${sp}`;
      scene.add(mesh);
      this.meshes.set(sp, mesh);
    }
    this.inflight = 0;
  }

  request(cell) {
    const c = { state: 1, bySpecies: null };
    this.cells.set(cell, c);
    this.inflight++;
    this.pool.run({ type: 'scatter', cell, G: this.G, layer: this.name }).then(d => {
      this.inflight--;
      c.bySpecies = pack(d);
      c.state = 2;
      if (this.active.has(cell)) this.dirty = true;
    }, () => {
      this.inflight--;
      this.cells.delete(cell);
    });
  }

  setActive(cells) {
    let changed = cells.size !== this.active.size;
    if (!changed) for (const c of cells) if (!this.active.has(c)) { changed = true; break; }
    if (!changed) return;
    this.active = cells;
    for (const c of cells) if (!this.cells.has(c) && this.inflight < 24) this.request(c);
    this.dirty = true;
    // Keep the cache bounded.
    if (this.cells.size > 6000) {
      for (const [k, v] of this.cells) { if (!cells.has(k) && v.state === 2) this.cells.delete(k); if (this.cells.size < 4000) break; }
    }
  }

  topUp() {
    // Request any active cells that were skipped because too many were in flight.
    if (this.inflight >= 24) return;
    for (const c of this.active) {
      if (!this.cells.has(c)) { this.request(c); if (this.inflight >= 24) break; }
    }
  }

  rebuild() {
    this.dirty = false;
    const counts = new Map();
    for (const c of this.active) {
      const cd = this.cells.get(c);
      if (!cd || cd.state !== 2) continue;
      for (const [sp, arr] of cd.bySpecies) counts.set(sp, (counts.get(sp) || 0) + arr.n);
    }
    for (const [sp, mesh] of this.meshes) {
      const n = counts.get(sp) || 0;
      if (mesh.instanceMatrix.count < n) {
        const cap = Math.ceil(n * 1.4) + 16;
        // Release the renderer's old instance buffers before replacing the attributes.
        mesh.dispose();
        mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      }
      let o = 0;
      const M = mesh.instanceMatrix.array, Cc = mesh.instanceColor.array;
      for (const c of this.active) {
        const cd = this.cells.get(c);
        if (!cd || cd.state !== 2) continue;
        const arr = cd.bySpecies.get(sp);
        if (!arr) continue;
        M.set(arr.m, o * 16);
        Cc.set(arr.c, o * 3);
        o += arr.n;
      }
      mesh.count = o;
      mesh.instanceMatrix.needsUpdate = o > 0;
      mesh.instanceColor.needsUpdate = o > 0;
      mesh.instanceMatrix.clearUpdateRanges();
      if (o) mesh.instanceMatrix.addUpdateRange(0, o * 16);
      mesh.instanceColor.clearUpdateRanges();
      if (o) mesh.instanceColor.addUpdateRange(0, o * 3);
      mesh.visible = o > 0;
    }
  }

  get instances() { let n = 0; for (const m of this.meshes.values()) n += m.count; return n; }
}

function pack(d) {
  const by = new Map();
  const n = d.count, data = d.data, cx = d.center[0], cy = d.center[1], cz = d.center[2];
  const tmp = new Map();
  for (let i = 0; i < n; i++) {
    const sp = data[i * 7 + 5];
    tmp.set(sp, (tmp.get(sp) || 0) + 1);
  }
  for (const [sp, c] of tmp) by.set(sp, { m: new Float32Array(c * 16), c: new Float32Array(c * 3), n: 0 });
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    const sp = data[o + 5];
    const e = by.get(sp);
    _p.set(data[o] + cx, data[o + 1] + cy, data[o + 2] + cz);
    _up.copy(_p).normalize();
    _q.setFromUnitVectors(_Y, _up);
    _q2.setFromAxisAngle(_Y, data[o + 3]);
    _q.multiply(_q2);
    const s = data[o + 4];
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    _m.toArray(e.m, e.n * 16);
    floraTint(sp, data[o + 6], _tint);
    e.c[e.n * 3] = _tint[0]; e.c[e.n * 3 + 1] = _tint[1]; e.c[e.n * 3 + 2] = _tint[2];
    e.n++;
  }
  return by;
}

export class Vegetation {
  constructor(scene, pool) {
    this.canopy = new Layer('canopy', [SPECIES.clump], scene, pool, new THREE.Vector3(0, 0, 1), 0.0, false);
    this.trees = new Layer('trees', TREE_SPECIES, scene, pool, new THREE.Vector3(10, 12, 0), 0.9, true);
    this.detail = new Layer('detail', DETAIL_SPECIES, scene, pool, new THREE.Vector3(2.4, 3.2, 0), 2.5, false);
    this.frame = 0;
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    // Precompute canopy cell centers.
    const G = LAYERS.canopy.G;
    this.canopyCenters = [];
    for (let c = 0; c < 6 * G * G; c++) this.canopyCenters.push(new THREE.Vector3(...cellCenterDir(c, G)).multiplyScalar(R));
    this.tmp = { f: 0, u: 0, v: 0 };
  }

  cellsAround(center, radius, G) {
    const set = new Set();
    const cellLen = (Math.PI / 2 * R) / G;
    const step = cellLen * 0.5;
    const d = center.clone().normalize();
    const { east, north } = tangentFrame([d.x, d.y, d.z]);
    const n = Math.ceil(radius / step);
    const p = [0, 0, 0];
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const x = i * step, y = j * step;
      if (x * x + y * y > radius * radius) continue;
      p[0] = d.x + (east[0] * x + north[0] * y) / R; p[1] = d.y + (east[1] * x + north[1] * y) / R; p[2] = d.z + (east[2] * x + north[2] * y) / R;
      const l = Math.hypot(p[0], p[1], p[2]); p[0] /= l; p[1] /= l; p[2] /= l;
      set.add(dirToCell(p, G, this.tmp));
    }
    return set;
  }

  update(camera, alt) {
    this.frame++;
    const cam = camera.position;
    const camLen = cam.length();
    const ground = cam.clone().multiplyScalar(R / camLen);
    const treeR = alt < 32 ? Math.min(13, Math.max(5, 3.5 + alt * 0.85)) : 0;
    const detailR = alt < 2.6 ? 3.2 : 0;
    this.trees.uniforms.uFade.value.set(treeR * 0.78, treeR * 0.98, 0);
    this.canopy.uniforms.uFade.value.set(treeR * 0.72, treeR * 0.95, 1);
    this.detail.uniforms.uFade.value.set(detailR * 0.7, detailR * 0.97, 0);
    this.treeR = treeR;

    const moved = cam.distanceTo(this.lastPos);
    if (this.frame % 12 === 0 && moved > 0.08) {
      this.lastPos.copy(cam);
      // Trees and detail around the camera.
      this.trees.setActive(treeR > 0 ? this.cellsAround(ground, treeR + 1.5, this.trees.G) : new Set());
      this.detail.setActive(detailR > 0 ? this.cellsAround(ground, detailR + 0.5, this.detail.G) : new Set());
      // Canopy clumps over the visible cap, out to a range.
      const range = alt < 140 ? Math.min(110, Math.sqrt(Math.max(0, camLen * camLen - R * R)) + 25) : 0;
      const set = new Set();
      if (range > 0) {
        for (let c = 0; c < this.canopyCenters.length; c++) {
          const p = this.canopyCenters[c];
          if (p.distanceToSquared(cam) < range * range && p.dot(cam) > R * R * 0.6) set.add(c);
        }
      }
      this.canopy.setActive(set);
    }
    for (const L of [this.canopy, this.trees, this.detail]) {
      if (this.frame % 6 === 0) L.topUp();
      if (L.dirty && this.frame % 3 === 0) L.rebuild();
    }
  }

  get stats() { return { canopy: this.canopy.instances, trees: this.trees.instances, detail: this.detail.instances }; }
}
