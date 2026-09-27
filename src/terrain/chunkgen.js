// Builds one cube-sphere terrain chunk as typed arrays. Pure JS; runs inside terrain workers.

import { faceUVToDir, PLANET_RADIUS } from '../core/sphere.js';
import { INFO_SIZE } from '../world/field.js';

const R = PLANET_RADIUS;
export const CHUNK_N = 32;

let sharedIndex = null;

// Index buffer shared by all chunks: grid triangles plus two-sided skirts.
export function chunkIndex(N = CHUNK_N) {
  if (sharedIndex) return sharedIndex;
  const V = N + 1;
  const idx = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V + 1, d = a + V;
      if ((i + j) & 1) { idx.push(a, b, c, a, c, d); } else { idx.push(a, b, d, b, c, d); }
    }
  }
  // Skirt vertices follow the grid: 4 edges x V verts, in order bottom, right, top, left.
  const base = V * V;
  const edges = [];
  for (let i = 0; i < V; i++) edges.push([i, base + i]);                       // bottom (j=0)
  for (let j = 0; j < V; j++) edges.push([j * V + N, base + V + j]);          // right (i=N)
  for (let i = 0; i < V; i++) edges.push([N * V + i, base + 2 * V + i]);      // top (j=N)
  for (let j = 0; j < V; j++) edges.push([j * V, base + 3 * V + j]);          // left (i=0)
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < N; k++) {
      const [t0, s0] = edges[e * V + k], [t1, s1] = edges[e * V + k + 1];
      idx.push(t0, s0, t1, t1, s0, s1, t0, t1, s0, t1, s1, s0);
    }
  }
  sharedIndex = new Uint16Array(idx);
  return sharedIndex;
}

export function chunkSpacing(level, N = CHUNK_N) {
  return (Math.PI / 2 * R) / (1 << level) / N;
}

export function buildChunk(field, face, level, ix, iy, N = CHUNK_N) {
  const V = N + 1, G = N + 3; // G includes a 1-sample ring for normals
  const size = 2 / (1 << level);
  const u0 = -1 + ix * size, v0 = -1 + iy * size;
  const lod = chunkSpacing(level, N);

  const cdir = faceUVToDir(face, u0 + size / 2, v0 + size / 2);
  const cx = cdir[0] * R, cy = cdir[1] * R, cz = cdir[2] * R;

  const gp = new Float64Array(G * G * 3); // world positions on the ring grid
  const gd = new Float64Array(G * G * 3); // unit directions
  const infos = new Float64Array(V * V * INFO_SIZE);
  const info = new Float64Array(INFO_SIZE);
  const d = [0, 0, 0];
  let minH = 1e9, maxH = -1e9;

  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const u = u0 + ((i - 1) / N) * size, v = v0 + ((j - 1) / N) * size;
      faceUVToDir(face, u, v, d);
      const inner = i >= 1 && i <= V && j >= 1 && j <= V;
      let h;
      if (inner) {
        h = field.heightInfo(d[0], d[1], d[2], lod, info);
        infos.set(info, ((j - 1) * V + (i - 1)) * INFO_SIZE);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      } else h = field.heightInfo(d[0], d[1], d[2], lod, null);
      const k = (j * G + i) * 3;
      const rr = R + h;
      gd[k] = d[0]; gd[k + 1] = d[1]; gd[k + 2] = d[2];
      gp[k] = d[0] * rr; gp[k + 1] = d[1] * rr; gp[k + 2] = d[2] * rr;
    }
  }

  const nv = V * V + 4 * V;
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const surf = new Float32Array(nv * 4);
  const magic = new Float32Array(nv * 3);
  const farm = new Float32Array(nv * 4);
  const road = new Float32Array(nv * 4);
  const river = new Float32Array(nv * 4);
  const s = {};

  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const gi = i + 1, gj = j + 1;
      const k = (gj * G + gi) * 3;
      const kl = (gj * G + gi - 1) * 3, kr = (gj * G + gi + 1) * 3;
      const kd = ((gj - 1) * G + gi) * 3, ku = ((gj + 1) * G + gi) * 3;
      const ax = gp[kr] - gp[kl], ay = gp[kr + 1] - gp[kl + 1], az = gp[kr + 2] - gp[kl + 2];
      const bx = gp[ku] - gp[kd], by = gp[ku + 1] - gp[kd + 1], bz = gp[ku + 2] - gp[kd + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const dx = gd[k], dy = gd[k + 1], dz = gd[k + 2];
      const slope = Math.max(0, 1 - (nx * dx + ny * dy + nz * dz));
      const vi = j * V + i;
      pos[vi * 3] = gp[k] - cx; pos[vi * 3 + 1] = gp[k + 1] - cy; pos[vi * 3 + 2] = gp[k + 2] - cz;
      nrm[vi * 3] = nx; nrm[vi * 3 + 1] = ny; nrm[vi * 3 + 2] = nz;
      const inf = infos.subarray(vi * INFO_SIZE, vi * INFO_SIZE + INFO_SIZE);
      // slope measured in 1 - cos; map to a 0..1 steepness
      field.surface(dx, dy, dz, inf, Math.min(1, slope * 3.2), lod, s);
      col[vi * 3] = s.r; col[vi * 3 + 1] = s.g; col[vi * 3 + 2] = s.b;
      surf[vi * 4] = s.rock; surf[vi * 4 + 1] = s.snow; surf[vi * 4 + 2] = s.lava; surf[vi * 4 + 3] = s.town;
      magic[vi * 3] = s.mr; magic[vi * 3 + 1] = s.mg; magic[vi * 3 + 2] = s.mb;
      farm[vi * 4] = s.fu; farm[vi * 4 + 1] = s.fv; farm[vi * 4 + 2] = s.fs; farm[vi * 4 + 3] = s.fw;
      road[vi * 4] = s.rx; road[vi * 4 + 1] = s.ry; road[vi * 4 + 2] = s.rz; road[vi * 4 + 3] = s.rw;
      river[vi * 4] = s.vx; river[vi * 4 + 1] = s.vy; river[vi * 4 + 2] = s.vz; river[vi * 4 + 3] = s.vw;
    }
  }

  // Skirts: copies of the edge vertices pushed down toward the planet center.
  const skirt = lod * 2.5 + 0.08;
  const edgeOf = (e, k) => e === 0 ? k : e === 1 ? k * V + N : e === 2 ? N * V + k : k * V;
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < V; k++) {
      const src = edgeOf(e, k), dst = V * V + e * V + k;
      const px = pos[src * 3] + cx, py = pos[src * 3 + 1] + cy, pz = pos[src * 3 + 2] + cz;
      const l = Math.hypot(px, py, pz);
      const f = (l - skirt) / l;
      pos[dst * 3] = px * f - cx; pos[dst * 3 + 1] = py * f - cy; pos[dst * 3 + 2] = pz * f - cz;
      nrm.copyWithin(dst * 3, src * 3, src * 3 + 3);
      col.copyWithin(dst * 3, src * 3, src * 3 + 3);
      surf.copyWithin(dst * 4, src * 4, src * 4 + 4);
      magic.copyWithin(dst * 3, src * 3, src * 3 + 3);
      farm.copyWithin(dst * 4, src * 4, src * 4 + 4);
      road.copyWithin(dst * 4, src * 4, src * 4 + 4);
      river.copyWithin(dst * 4, src * 4, src * 4 + 4);
    }
  }

  let rad = 0;
  for (let v = 0; v < V * V; v++) {
    const l = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    if (l > rad) rad = l;
  }

  return { center: [cx, cy, cz], pos, nrm, col, surf, magic, farm, road, river, minH, maxH, radius: rad + 0.1 };
}
