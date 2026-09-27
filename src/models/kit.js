// Procedural modeling kit: flat-shaded primitives with vertex colors, a material id per vertex
// and world-scaled UVs, merged into one BufferGeometry. Models are authored in world units
// with +Y up and the front facing +Z.

import * as THREE from 'three';

// Material ids read by the building shader.
export const M = {
  plain: 0, stone: 1, wood: 2, tile: 3, thatch: 4, plaster: 5, metal: 6, window: 7, rune: 8, fire: 9,
  cloth: 10, leaf: 11, crystal: 12, ghost: 13, gold: 14, cobble: 15, ice: 16, obsidian: 17, bark: 18, skin: 19,
  glowwhite: 20, lava: 21, water: 22, scales: 23,
};

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export function col(hex, jitter = 0) {
  const c = new THREE.Color(hex);
  if (jitter) c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
  return [c.r, c.g, c.b];
}

export class Kit {
  constructor(rig = false) {
    this.P = []; this.N = []; this.C = []; this.A = []; this.UV = [];
    this.stack = [];
    this.mat = new THREE.Matrix4();
    // Optional rig channels: part id, pivot, color slot, tool id.
    this.rig = rig;
    this.RP = []; this.RV = []; this.RS = []; this.RT = [];
    this.part = 0; this.pivot = [0, 0, 0]; this.slot = 0; this.tool = 0;
  }
  setPart(part, pivot, slot = this.slot) { this.part = part; this.pivot = pivot; this.slot = slot; return this; }

  push() { this.stack.push(this.mat.clone()); return this; }
  pop() { this.mat.copy(this.stack.pop()); return this; }
  at(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
    _q.setFromAxisAngle(_v.set(0, 1, 0), ry);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
    this.mat.multiply(_m);
    return this;
  }
  rot(rx, ry, rz) {
    _m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    this.mat.multiply(_m);
    return this;
  }

  // Raw triangle with explicit uvs; points are local vectors.
  tri(a, b, c, color, mat, ua = [0, 0], ub = [1, 0], uc = [0, 1]) {
    const pa = _vec(a).applyMatrix4(this.mat), pb = _vec(b).applyMatrix4(this.mat), pc = _vec(c).applyMatrix4(this.mat);
    const n = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa)).normalize();
    for (const [p, u] of [[pa, ua], [pb, ub], [pc, uc]]) {
      this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z);
      this.C.push(color[0], color[1], color[2]); this.A.push(mat); this.UV.push(u[0], u[1]);
      if (this.rig) { this.RP.push(this.part); this.RV.push(this.pivot[0], this.pivot[1], this.pivot[2]); this.RS.push(this.slot); this.RT.push(this.tool); }
    }
    return this;
  }

  quad(a, b, c, d, color, mat, uvScale = null) {
    // a-b-c-d counter-clockwise seen from the front. UVs in model units along the edges.
    const ab = dist(a, b), ad = dist(a, d);
    const s = uvScale || [ab, ad];
    this.tri(a, b, c, color, mat, [0, 0], [s[0], 0], [s[0], s[1]]);
    this.tri(a, c, d, color, mat, [0, 0], [s[0], s[1]], [0, s[1]]);
    return this;
  }

  // Axis-aligned box: center x,z; base y; size w (x), h (y), d (z).
  box(x, y, z, w, h, d, color, mat = M.plain, opts = {}) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    const c = color, cTop = opts.top || color, mTop = opts.topMat ?? mat;
    if (!opts.noFront) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c, mat);
    if (!opts.noBack) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c, mat);
    if (!opts.noSides) {
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], c, mat);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c, mat);
    }
    if (!opts.noTop) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], cTop, mTop);
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], c, mat);
    return this;
  }

  // Gable roof along x: base at y, eaves overhang o, ridge height h.
  gable(x, y, z, w, h, d, color, mat = M.tile, o = 0.02, gableColor = null, gableMat = M.plaster) {
    const x0 = x - w / 2 - o, x1 = x + w / 2 + o, z0 = z - d / 2 - o, z1 = z + d / 2 + o, yr = y + h;
    const slope = Math.hypot(d / 2 + o, h);
    this.quad([x0, y, z1], [x1, y, z1], [x1, yr, z], [x0, yr, z], color, mat, [x1 - x0, slope]);
    this.quad([x1, y, z0], [x0, y, z0], [x0, yr, z], [x1, yr, z], color, mat, [x1 - x0, slope]);
    const gc = gableColor || color, gm = gableColor ? gableMat : mat;
    const gx0 = x - w / 2, gx1 = x + w / 2, gz0 = z - d / 2, gz1 = z + d / 2;
    this.tri([gx1, y, gz1], [gx1, y, gz0], [gx1, yr, z], gc, gm, [0, 0], [d, 0], [d / 2, h]);
    this.tri([gx0, y, gz0], [gx0, y, gz1], [gx0, yr, z], gc, gm, [0, 0], [d, 0], [d / 2, h]);
    // underside of eaves
    this.quad([x1, y, z1], [x0, y, z1], [x0, y - 0.004, z1 - o], [x1, y - 0.004, z1 - o], mulc(color, 0.5), M.wood);
    this.quad([x0, y, z0], [x1, y, z0], [x1, y - 0.004, z0 + o], [x0, y - 0.004, z0 + o], mulc(color, 0.5), M.wood);
    return this;
  }

  // Four-sided pyramid / hip roof on a rectangle.
  pyramid(x, y, z, w, h, d, color, mat = M.tile, o = 0.02, ridge = 0) {
    const x0 = x - w / 2 - o, x1 = x + w / 2 + o, z0 = z - d / 2 - o, z1 = z + d / 2 + o, yr = y + h;
    const r0 = [x - ridge / 2, yr, z], r1 = [x + ridge / 2, yr, z];
    const sl = Math.hypot(d / 2 + o, h), sw = Math.hypot(w / 2 + o, h);
    this.quad([x0, y, z1], [x1, y, z1], r1, r0, color, mat, [x1 - x0, sl]);
    this.quad([x1, y, z0], [x0, y, z0], r0, r1, color, mat, [x1 - x0, sl]);
    this.tri([x1, y, z1], [x1, y, z0], r1, color, mat, [0, 0], [d, 0], [d / 2, sw]);
    this.tri([x0, y, z0], [x0, y, z1], r0, color, mat, [0, 0], [d, 0], [d / 2, sw]);
    return this;
  }

  // Cylinder / cone frustum around the y axis.
  cyl(x, y, z, r0, r1, h, seg, color, mat = M.plain, opts = {}) {
    const top = opts.top ?? true, bottom = opts.bottom ?? false;
    const ct = opts.topColor || color, mt = opts.topMat ?? mat;
    const a0 = opts.phase || 0;
    const circ = 2 * Math.PI * Math.max(r0, r1);
    for (let i = 0; i < seg; i++) {
      const a = a0 + (i / seg) * Math.PI * 2, b = a0 + ((i + 1) / seg) * Math.PI * 2;
      const p0 = [x + Math.sin(a) * r0, y, z + Math.cos(a) * r0], p1 = [x + Math.sin(b) * r0, y, z + Math.cos(b) * r0];
      const q0 = [x + Math.sin(a) * r1, y + h, z + Math.cos(a) * r1], q1 = [x + Math.sin(b) * r1, y + h, z + Math.cos(b) * r1];
      const u0 = (i / seg) * circ, u1 = ((i + 1) / seg) * circ;
      if (r1 > 1e-5) this.quad(p0, p1, q1, q0, color, mat, null) && this.fixUV(6, u0, u1, h);
      else this.tri(p0, p1, [x, y + h, z], color, mat, [u0, 0], [u1, 0], [(u0 + u1) / 2, h]);
      if (top && r1 > 1e-5) this.tri([x, y + h, z], q0, q1, ct, mt, [0, 0], [r1, 0], [0, r1]);
      if (bottom) this.tri([x, y, z], p1, p0, color, mat);
    }
    return this;
  }

  fixUV(count, u0, u1, h) {
    // Rewrite the uvs of the last `count` vertices (a quad) to wrap around a cylinder.
    const n = this.UV.length;
    const uvs = [[u0, 0], [u1, 0], [u1, h], [u0, 0], [u1, h], [u0, h]];
    for (let i = 0; i < count; i++) { this.UV[n - count * 2 + i * 2] = uvs[i][0]; this.UV[n - count * 2 + i * 2 + 1] = uvs[i][1]; }
    return this;
  }

  cone(x, y, z, r, h, seg, color, mat = M.plain, phase = 0) { return this.cyl(x, y, z, r, 0, h, seg, color, mat, { phase }); }

  // Low-poly blob: an icosphere-ish ellipsoid with optional jitter; smooth option for foliage.
  blob(x, y, z, rx, ry, rz, color, mat = M.leaf, detail = 1, jitter = 0.12, seed = 1, smooth = false) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const pos = g.attributes.position;
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const jit = new Map();
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!jit.has(k)) jit.set(k, 1 + (rnd() - 0.5) * 2 * jitter);
      const j = jit.get(k);
      pos.setXYZ(i, pos.getX(i) * rx * j + x, pos.getY(i) * ry * j + y, pos.getZ(i) * rz * j + z);
    }
    const n0 = this.N.length;
    for (let i = 0; i < pos.count; i += 3) {
      const a = [pos.getX(i), pos.getY(i), pos.getZ(i)], b = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)], c = [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)];
      this.tri(a, b, c, color, mat, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]]);
    }
    if (smooth) {
      // Radial normals give foliage a soft, rounded cartoon shading.
      const ctr = new THREE.Vector3(x, y, z).applyMatrix4(this.mat);
      for (let i = n0; i < this.N.length; i += 3) {
        const vi = i;
        const px = this.P[vi], py = this.P[vi + 1], pz = this.P[vi + 2];
        const nx = (px - ctr.x) / rx, ny = (py - ctr.y) / ry, nz = (pz - ctr.z) / rz;
        const l = Math.hypot(nx, ny, nz) || 1;
        this.N[vi] = nx / l; this.N[vi + 1] = ny / l; this.N[vi + 2] = nz / l;
      }
    }
    g.dispose();
    return this;
  }

  // Extruded polygon prism (points in xz, counter-clockwise from above).
  prism(pts, y, h, color, mat = M.plain, topColor = null, topMat = null) {
    const n = pts.length;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + h, b[1]], [a[0], y + h, a[1]], color, mat, [L, h]);
      u += L;
    }
    const tc = topColor || color, tm = topMat ?? mat;
    for (let i = 1; i < n - 1; i++) this.tri([pts[0][0], y + h, pts[0][1]], [pts[i + 1][0], y + h, pts[i + 1][1]], [pts[i][0], y + h, pts[i][1]], tc, tm,
      [pts[0][0], pts[0][1]], [pts[i + 1][0], pts[i + 1][1]], [pts[i][0], pts[i][1]]);
    return this;
  }

  // A flat rectangle facing +z (windows, doors, signs) slightly in front of a wall.
  panel(x, y, z, w, h, color, mat, ry = 0) {
    this.push().at(x, y, z, ry);
    this.quad([-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, h, 0], [-w / 2, h, 0], color, mat, [w, h]);
    this.pop();
    return this;
  }

  // Crenellations along a straight wall top from (x0,z0) to (x1,z1).
  merlons(x0, z0, x1, z1, y, t, color, size = 0.03, gap = 0.03) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.floor(L / (size + gap)));
    const ry = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.5) / n;
      this.push().at(x0 + (x1 - x0) * t0, y, z0 + (z1 - z0) * t0, ry);
      this.box(0, 0, 0, t, size * 1.1, size, color, M.stone);
      this.pop();
    }
    return this;
  }

  get vertexCount() { return this.P.length / 3; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.A, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    if (this.rig) {
      // Packed to stay under the 16 vertex-attribute limit: part, color slot, tool, material.
      const n = this.RP.length, rig = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { rig[i * 4] = this.RP[i]; rig[i * 4 + 1] = this.RS[i]; rig[i * 4 + 2] = this.RT[i]; rig[i * 4 + 3] = this.A[i]; }
      g.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
      g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.RV, 3));
      g.deleteAttribute('aMat');
      // Authored UVs stay attached to the animated surface (15 attribute locations).
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

function _vec(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
export function mulc(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
export function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
