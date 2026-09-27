// All static structures (settlements, landmarks, bridges, aqueduct) in one BatchedMesh, plus the
// world-space anchors the living systems hook into: smoke, fires, forges, lights, banners, sails...

import * as THREE from 'three';
import { getModel } from '../models/registry.js';
import { makeKitMaterial } from '../render/materials.js';
import { PLANET_RADIUS, tangentFrame, slerp, arcDist } from '../core/sphere.js';

const R = PLANET_RADIUS;
const _m = new THREE.Matrix4();

// Build a world matrix from a unit dir, height, forward (world, tangent) and scale.
export function frameMatrix(dir, h, fwd, sx = 1, sy = 1, sz = 1, out = new THREE.Matrix4()) {
  const up = new THREE.Vector3(dir[0], dir[1], dir[2]);
  const F = fwd.clone().addScaledVector(up, -fwd.dot(up)).normalize();
  const Rw = new THREE.Vector3().crossVectors(up, F).normalize();
  const P = up.clone().multiplyScalar(R + h);
  out.makeBasis(Rw.multiplyScalar(sx), up.clone().multiplyScalar(sy), F.multiplyScalar(sz));
  out.setPosition(P);
  return out;
}

export class Structures {
  constructor(scene, world, sites) {
    this.world = world;
    this.sites = sites;
    this.field = world.field;
    this.records = []; // {model, matrix, site, item}
    this.anchors = { smoke: [], fire: [], forge: [], light: [], banner: [], sails: [], wheel: [], rune: [], beam: [], seat: [], work: [], door: [] };

    for (const site of sites) this.addSite(site);
    this.addLandmarks(world.landmarks);
    this.addBridges(world.bridges);
    this.addAqueduct(world.aqueduct);

    // Batch everything.
    const models = [...new Set(this.records.map(r => r.model))];
    let vcount = 0;
    for (const name of models) vcount += getModel(name).geometry.attributes.position.count;
    this.material = makeKitMaterial({ key: 'buildings', side: THREE.DoubleSide, rim: 0.4 });
    const bm = new THREE.BatchedMesh(this.records.length + 16, vcount + 64, 0, this.material);
    bm.perObjectFrustumCulled = true;
    bm.sortObjects = false;
    bm.castShadow = true;
    bm.receiveShadow = true;
    const ids = new Map();
    for (const name of models) ids.set(name, bm.addGeometry(getModel(name).geometry));
    for (const r of this.records) {
      r.instance = bm.addInstance(ids.get(r.model));
      bm.setMatrixAt(r.instance, r.matrix);
    }
    bm.computeBoundingSphere();
    bm.name = 'structures';
    this.buildHeightHash();
    this.mesh = bm;
    scene.add(bm);
    this.geometryIds = ids;
  }

  // Swap a placed record's model (for construction sites that progress over days).
  setModel(rec, name) {
    if (rec.model === name) return;
    let id = this.geometryIds.get(name);
    if (id === undefined) return;
    this.mesh.setGeometryIdAt(rec.instance, id);
    rec.model = name;
  }

  push(model, matrix, site = null, item = null) {
    const rec = { model, matrix, site, item };
    this.records.push(rec);
    const m = getModel(model);
    const A = m.anchors;
    const tmp = new THREE.Vector3();
    const tx = (p) => tmp.set(p[0], p[1], p[2]).applyMatrix4(matrix).clone();
    for (const key of ['smoke', 'fire', 'forge', 'light', 'rune', 'seat', 'work']) {
      for (const p of A[key]) this.anchors[key].push({ p: tx(p), site, rec, strength: p[3] ?? 1 });
    }
    for (const b of A.banner) this.anchors.banner.push({ p: tx(b), site, rec, size: b[3] ?? 0.3, matrix });
    for (const s of A.sails) this.anchors.sails.push({ p: tx(s), site, rec, size: s[3], matrix });
    for (const w of A.wheel) this.anchors.wheel.push({ p: tx(w), site, rec, size: w[3], matrix });
    for (const b of A.beam) this.anchors.beam.push({ p: tx(b), site, rec, size: b[3] ?? 1, matrix });
    if (A.door) this.anchors.door.push({ p: tx(A.door), site, rec });
    return rec;
  }

  addSite(site) {
    const f = this.field;
    site.records = [];
    for (const it of site.items) {
      const m = getModel(it.model);
      const c = Math.cos(it.th), s = Math.sin(it.th);
      const dir = site.dir(it.x, it.y);
      // Recompute the base on the final terrain (streets may have flattened it slightly).
      let base = it.h;
      if (it.model !== 'dock' && it.model !== 'wall') {
        const w = m.footprint[0] * it.scale, d = m.footprint[1] * it.scale;
        let mn = 1e9;
        for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0]]) {
          const lx = a * w, lz = b * d;
          const p = site.dir(it.x + (-c) * lx + s * lz, it.y + s * lx + c * lz);
          mn = Math.min(mn, f.height(p[0], p[1], p[2]));
        }
        base = it.model === 'dwarf_gate' || it.model === 'mine_entrance' ? mn - 0.12 : mn;
      } else if (it.model === 'wall') base = f.height(dir[0], dir[1], dir[2]) - 0.02;
      const e = site.e, n = site.n;
      const fwd = new THREE.Vector3(n[0] * c + e[0] * s, n[1] * c + e[1] * s, n[2] * c + e[2] * s);
      const mat = frameMatrix(dir, base, fwd, it.scale, it.sy ?? it.scale, it.scale);
      it.world = { dir, h: base, fwd, matrix: mat };
      site.records.push(this.push(it.model, mat, site, it));
    }
    // World positions for villager points of interest.
    const toWorld = (x, y) => { const p = site.dir(x, y); const h = Math.max(0, f.height(p[0], p[1], p[2])); return new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(R + h); };
    site.toWorld = toWorld;
    site.plazaWorld = toWorld(site.plaza[0], site.plaza[1]);
    site.centerWorld = toWorld(0, 0);
    for (const dd of site.doors) dd.world = toWorld(dd.x, dd.y);
    for (const w of site.work) w.world = toWorld(w.x, w.y);
    for (const dk of site.docks || []) dk.world = toWorld(dk.x, dk.y);
  }

  addLandmarks(landmarks) {
    const f = this.field;
    for (const l of landmarks) {
      if (l.model === 'none') continue;
      const d = l.d;
      let h = f.height(d[0], d[1], d[2]);
      const { east, north } = tangentFrame(d);
      const fwd = new THREE.Vector3(...north).applyAxisAngle(new THREE.Vector3(...d), (l.name.length * 0.7) % 6.28);
      let scale = 1, model = l.model;
      if (model === 'floatisle') h = 4.4;
      if (model === 'wreck') h = -0.05;
      if (model === 'drowned') h = Math.max(h, -0.1);
      if (model === 'titan') h -= 0.2;
      if (model === 'ruinkeep') model = 'ruin_keep';
      if (model === 'ruintower') model = 'ruin_tower';
      if (model === 'brazier') model = 'great_brazier';
      if (model === 'dragonstatue') { model = 'dragon_statue'; scale = 6; }
      if (model === 'stones') scale = 1.1;
      const mat = frameMatrix(d, h, fwd, scale, scale, scale);
      l.world = new THREE.Vector3(...d).multiplyScalar(R + h);
      l.rec = this.push(model, mat, null, null);
      l.rec.landmark = l;
      if (model === 'floatisle') l.floatMatrix = mat;
    }
  }

  addBridges(bridges) {
    for (const b of bridges) {
      const fwd = new THREE.Vector3(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]).normalize();
      const L = b.length + 0.25;
      const mat = frameMatrix(b.mid, b.deckH - 0.04, fwd, 1, 1, L);
      b.world = new THREE.Vector3(...b.mid).multiplyScalar(R + b.deckH);
      this.push('bridge', mat, null, null);
    }
  }

  addAqueduct(aq) {
    for (let i = 0; i < aq.length - 1; i++) {
      const a = aq[i], b = aq[i + 1];
      const mid = slerp(a.d, b.d, 0.5);
      const h = (a.h + b.h) / 2;
      const ground = this.field.height(mid[0], mid[1], mid[2]);
      if (h - ground < 0.08) continue;
      const fwd = new THREE.Vector3(b.d[0] - a.d[0], b.d[1] - a.d[1], b.d[2] - a.d[2]).normalize();
      const L = arcDist(a.d, b.d) / 0.42;
      this.push('aqueduct', frameMatrix(mid, h, fwd, 1, 1, L), null, null);
    }
  }

  // Coarse roof-height lookup so the camera never ends up inside a building.
  buildHeightHash() {
    this.hcell = 0.6;
    this.hhash = new Map();
    const pos = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const r of this.records) {
      const m = getModel(r.model);
      r.matrix.decompose(pos, q, sc);
      const radius = Math.max(m.footprint[0] * sc.x, m.footprint[1] * sc.z) * 0.5;
      if (radius < 0.03 || m.height * sc.y < 0.05) continue;
      const top = pos.length() - R + m.height * sc.y;
      const e = { p: pos.clone(), r: radius, top, up: pos.clone().normalize() };
      const k = this.hkey(pos);
      if (!this.hhash.has(k)) this.hhash.set(k, []);
      this.hhash.get(k).push(e);
    }
  }
  hkey(p) { const c = this.hcell; return `${Math.floor(p.x / c)},${Math.floor(p.y / c)},${Math.floor(p.z / c)}`; }
  // Highest roof over a unit direction (or -Infinity).
  roofAt(dir) {
    const p = dir.clone().multiplyScalar(R);
    let best = -Infinity;
    const c = this.hcell;
    const cx = Math.floor(p.x / c), cy = Math.floor(p.y / c), cz = Math.floor(p.z / c);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const arr = this.hhash.get(`${cx + i},${cy + j},${cz + k}`);
      if (!arr) continue;
      for (const e of arr) {
        const d = e.p.clone().sub(p);
        const horiz = d.addScaledVector(e.up, -d.dot(e.up)).length();
        if (horiz < e.r && e.top > best) best = e.top;
      }
    }
    return best;
  }

  get count() { return this.records.length; }
}
