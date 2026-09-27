// Sphere and cube-sphere helpers on plain arrays. Worker-safe (no three.js).
// Convention: +Y is the planet axis; lat/lon in degrees; lon increases toward +Z... see latLonToDir.

export const PLANET_RADIUS = 100;
export const DEG = Math.PI / 180;

export function latLonToDir(lat, lon, out = [0, 0, 0]) {
  const la = lat * DEG, lo = lon * DEG;
  const c = Math.cos(la);
  out[0] = c * Math.cos(lo);
  out[1] = Math.sin(la);
  out[2] = -c * Math.sin(lo);
  return out;
}

export function dirToLatLon(d) {
  const lat = Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG;
  const lon = Math.atan2(-d[2], d[0]) / DEG;
  return [lat, lon];
}

export function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}

export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export function cross(a, b, out = [0, 0, 0]) {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function len(a) { return Math.hypot(a[0], a[1], a[2]); }

// Local tangent frame at unit direction d: east, north (both unit, tangent to sphere).
export function tangentFrame(d) {
  let e = cross([0, 1, 0], d);
  if (Math.hypot(e[0], e[1], e[2]) < 1e-6) e = [1, 0, 0];
  normalize(e);
  const n = cross(d, e);
  return { east: e, north: n };
}

// Move from unit dir d by (dx east, dy north) in surface units, returning a new unit dir.
export function offsetDir(d, dx, dy, radius = PLANET_RADIUS) {
  const { east, north } = tangentFrame(d);
  const p = [
    d[0] + (east[0] * dx + north[0] * dy) / radius,
    d[1] + (east[1] * dx + north[1] * dy) / radius,
    d[2] + (east[2] * dx + north[2] * dy) / radius,
  ];
  return normalize(p);
}

// Offset along an arbitrary local frame (e, n) that was computed once for a settlement.
export function offsetInFrame(d, e, n, dx, dy, radius = PLANET_RADIUS) {
  return normalize([
    d[0] + (e[0] * dx + n[0] * dy) / radius,
    d[1] + (e[1] * dx + n[1] * dy) / radius,
    d[2] + (e[2] * dx + n[2] * dy) / radius,
  ]);
}

export function slerp(a, b, t) {
  const c = Math.max(-1, Math.min(1, dot(a, b)));
  const om = Math.acos(c);
  if (om < 1e-6) return normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  const s = Math.sin(om);
  const wa = Math.sin((1 - t) * om) / s, wb = Math.sin(t * om) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

// Great-circle distance between unit vectors, in surface units.
export function arcDist(a, b, radius = PLANET_RADIUS) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * radius;
}

// ---------- Cube sphere ----------
// Face frames: normal n, u axis, v axis with cross(u, v) = n so CCW (u,v) triangles face outward.
export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const QPI = Math.PI / 4;

// (u, v) in [-1, 1] on face f -> unit direction. Tangent warp keeps cells close to equal area.
export function faceUVToDir(f, u, v, out = [0, 0, 0]) {
  const F = FACES[f];
  const tu = Math.tan(u * QPI), tv = Math.tan(v * QPI);
  const x = F.n[0] + F.u[0] * tu + F.v[0] * tv;
  const y = F.n[1] + F.u[1] * tu + F.v[1] * tv;
  const z = F.n[2] + F.u[2] * tu + F.v[2] * tv;
  const l = Math.hypot(x, y, z);
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

export function dirToFace(d) {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
  if (ax >= ay && ax >= az) return d[0] > 0 ? 0 : 1;
  if (ay >= az) return d[1] > 0 ? 2 : 3;
  return d[2] > 0 ? 4 : 5;
}

// Unit direction -> { f, u, v } with u, v in [-1, 1].
export function dirToFaceUV(d, out = { f: 0, u: 0, v: 0 }) {
  const f = dirToFace(d);
  const F = FACES[f];
  const dn = d[0] * F.n[0] + d[1] * F.n[1] + d[2] * F.n[2];
  const cu = (d[0] * F.u[0] + d[1] * F.u[1] + d[2] * F.u[2]) / dn;
  const cv = (d[0] * F.v[0] + d[1] * F.v[1] + d[2] * F.v[2]) / dn;
  out.f = f;
  out.u = Math.atan(cu) / QPI;
  out.v = Math.atan(cv) / QPI;
  return out;
}

// Cell index on a G x G grid per face.
export function dirToCell(d, G, tmp = { f: 0, u: 0, v: 0 }) {
  dirToFaceUV(d, tmp);
  let i = Math.floor((tmp.u * 0.5 + 0.5) * G);
  let j = Math.floor((tmp.v * 0.5 + 0.5) * G);
  if (i < 0) i = 0; else if (i >= G) i = G - 1;
  if (j < 0) j = 0; else if (j >= G) j = G - 1;
  return tmp.f * G * G + j * G + i;
}

export function cellCenterDir(cell, G, out = [0, 0, 0]) {
  const f = Math.floor(cell / (G * G));
  const r = cell - f * G * G;
  const j = Math.floor(r / G), i = r - j * G;
  return faceUVToDir(f, ((i + 0.5) / G) * 2 - 1, ((j + 0.5) / G) * 2 - 1, out);
}

// Catmull-Rom through unit directions; returns densely resampled unit directions.
export function smoothPath(dirs, samplesPerSeg = 8) {
  const out = [];
  const n = dirs.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = dirs[Math.max(0, i - 1)], p1 = dirs[i], p2 = dirs[i + 1], p3 = dirs[Math.min(n - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const p = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        p[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      }
      out.push(normalize(p));
    }
  }
  out.push(dirs[n - 1].slice());
  return out;
}

// Resample a polyline of unit dirs at a fixed surface spacing.
export function resamplePath(dirs, spacing, radius = PLANET_RADIUS) {
  const out = [dirs[0].slice()];
  let carry = 0;
  for (let i = 0; i < dirs.length - 1; i++) {
    const a = dirs[i], b = dirs[i + 1];
    const L = arcDist(a, b, radius);
    let pos = spacing - carry;
    while (pos <= L) {
      out.push(slerp(a, b, pos / L));
      pos += spacing;
    }
    carry = L - (pos - spacing);
  }
  const last = dirs[dirs.length - 1];
  if (arcDist(out[out.length - 1], last, radius) > spacing * 0.3) out.push(last.slice());
  return out;
}

export function pathLength(dirs, radius = PLANET_RADIUS) {
  let L = 0;
  for (let i = 0; i < dirs.length - 1; i++) L += arcDist(dirs[i], dirs[i + 1], radius);
  return L;
}
