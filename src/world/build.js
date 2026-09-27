// Builds the derived world: settlement pads, lakes, river profiles, A* roads, ley lines,
// bridges and the segment index used by the terrain field. Pure JS (runs on the main thread).

import { TerrainField } from './field.js';
import {
  latLonToDir, PLANET_RADIUS, DEG, smoothPath, resamplePath, tangentFrame, normalize, dot, arcDist,
  dirToCell, cellCenterDir, faceUVToDir, dirToFaceUV, offsetDir, slerp, pathLength,
} from '../core/sphere.js';
import { Simplex, hashString, smoothstep } from '../core/noise.js';
import { SETTLEMENTS, KINDS, LAKES, RIVERS, LEYLINES, ROADS, LANDMARKS, AQUEDUCT, SEA_LANES, WORLD_SEED } from './atlas.js';

const R = PLANET_RADIUS;

const GROUND = {
  human: [0.30, 0.25, 0.18], elf: [0.42, 0.44, 0.36], dwarf: [0.26, 0.25, 0.24], fae: [0.30, 0.36, 0.22],
  beast: [0.40, 0.30, 0.18], draconic: [0.12, 0.10, 0.10], undead: [0.14, 0.15, 0.12], ruin: [0.30, 0.30, 0.26],
};
const GLOW = { capital: 1.0, city: 0.9, port: 0.85, town: 0.75, village: 0.55, hamlet: 0.4, castle: 0.6, hold: 0.7,
  mine: 0.45, enclave: 0.0, glade: 0.0, circle: 0.0, camp: 0.5, temple: 0.8, necropolis: 0.0, barrow: 0.0,
  monastery: 0.4, fort: 0.5, ruin: 0.0, stilts: 0.4, lighthouse: 0.5 };

const LANDMARK_PADS = {
  runeblade: { r: 1.0, mound: 0.5 }, floatisle: null, titan: { r: 1.6 }, portal: { r: 0.9 }, stones: { r: 0.8 },
  sunshrine: { r: 0.8, mound: 0.35 }, brazier: { r: 1.4 }, icetemple: { r: 2.0 }, drowned: null, pyramid: { r: 1.8 },
  wreck: null, obelisk: { r: 0.5 }, ruintower: { r: 0.6 }, ruinkeep: { r: 1.0, mound: 0.3 }, battlefield: { r: 1.6 },
  dragonstatue: { r: 1.2 }, none: null,
};

export function buildWorld(onProgress = () => {}) {
  const t0 = performance.now();
  const base = new TerrainField(null);
  const noise = new Simplex(WORLD_SEED + 99);

  // ---- Settlements and landmark pads ----
  const pads = [];
  const settlements = SETTLEMENTS.map((s, idx) => {
    const d = latLonToDir(s.lat, s.lon);
    const K = KINDS[s.kind];
    const { east, north } = tangentFrame(d);
    // Average ground height around the center.
    let sum = 0, n = 0;
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = k === 8 ? 0 : K.r * 0.6;
      const p = offsetDir(d, Math.cos(a) * rr, Math.sin(a) * rr);
      sum += base.height(p[0], p[1], p[2]); n++;
    }
    let h = Math.max(0.16, sum / n);
    if (s.coastal) h = Math.max(0.16, Math.min(h, 0.45));
    const hs = hashString(s.id);
    const pad = {
      d, r: K.r, blend: K.r * 0.7 + 0.7, h, strength: s.kind === 'ruin' ? 0.7 : 0.95,
      moundH: s.castle ? (s.kind === 'capital' ? 0.32 : 0.22) : 0, moundR: s.kind === 'capital' ? 1.55 : K.r * 0.85,
      farmR: K.farm, farmAngle: (hs % 628) / 100, e: east, n: north,
      glow: GLOW[s.kind] ?? 0.4, ground: GROUND[s.culture] || GROUND.human, kind: s.kind, id: s.id,
    };
    pad.reach2 = Math.pow(Math.max(pad.r + pad.blend, pad.farmR * 1.2) / R, 2);
    pads.push(pad);
    return { ...s, index: idx, d, east, north, pad, radius: K.r, walls: K.walls || 0 };
  });

  const landmarks = LANDMARKS.map(l => {
    const d = latLonToDir(l.lat, l.lon);
    const { east, north } = tangentFrame(d);
    const P = LANDMARK_PADS[l.model];
    let pad = null;
    if (P) {
      const h = Math.max(0.2, base.height(d[0], d[1], d[2]));
      pad = { d, r: P.r, blend: P.r + 0.6, h, strength: 0.85, moundH: P.mound || 0, moundR: P.r, farmR: 0, farmAngle: 0,
        e: east, n: north, glow: 0, ground: GROUND.ruin, kind: 'landmark', id: l.id };
      pad.reach2 = Math.pow((pad.r + pad.blend) / R, 2);
      pads.push(pad);
    }
    return { ...l, d, east, north, pad };
  });
  onProgress(0.15, 'Raising the land');

  // ---- Lakes ----
  const lakes = LAKES.map(l => {
    const d = latLonToDir(l.lat, l.lon);
    return { ...l, d, reach2: Math.pow((l.r * 1.3 + 2.0) / R, 2) };
  });

  const emptyFeatures = (segs) => ({
    pads, lakes, segs, nRivers: RIVERS.length,
    grid: buildGrid(segs, 64),
  });
  const EMPTY = packSegs([]);
  const f1 = new TerrainField(emptyFeatures(EMPTY));

  // ---- Rivers ----
  const segList = [];
  const rivers = [];
  const riverById = {};
  RIVERS.forEach((rv, fid) => {
    let dirs = rv.pts.map(p => latLonToDir(p[0], p[1]));
    dirs = smoothPath(dirs, 10);
    // Meander
    dirs = resamplePath(dirs, 0.25);
    const mea = [];
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const nxt = dirs[Math.min(dirs.length - 1, i + 1)], prv = dirs[Math.max(0, i - 1)];
      const tan = normalize([nxt[0] - prv[0], nxt[1] - prv[1], nxt[2] - prv[2]]);
      const side = normalize([d[1] * tan[2] - d[2] * tan[1], d[2] * tan[0] - d[0] * tan[2], d[0] * tan[1] - d[1] * tan[0]]);
      const endFade = Math.min(1, i / 6, (dirs.length - 1 - i) / 6);
      const m = noise.fbm(d[0] * 40 + fid, d[1] * 40, d[2] * 40, 2) * 0.55 * endFade * (rv.lava ? 0.4 : 1);
      mea.push(normalize([d[0] + side[0] * m / R, d[1] + side[1] * m / R, d[2] + side[2] * m / R]));
    }
    dirs = resamplePath(mea, 0.3);
    const n = dirs.length;
    const hb = dirs.map(d => f1.height(d[0], d[1], d[2]));
    const levels = new Array(n);
    let endLevel = 0;
    if (rv.into) endLevel = LAKES.find(l => l.id === rv.into).level;
    let startLevel = hb[0] - 0.1;
    const fromLake = LAKES.find(l => arcDist(latLonToDir(l.lat, l.lon), dirs[0]) < l.r * 1.6);
    if (fromLake) startLevel = fromLake.level;
    // Waterfall indices mapped to resampled positions.
    const fallsAt = (rv.falls || []).map(k => {
      const wp = latLonToDir(...rv.pts[k]);
      let best = 0, bd = 1e9;
      dirs.forEach((d, i) => { const dd = arcDist(d, wp); if (dd < bd) { bd = dd; best = i; } });
      return best;
    });
    let cur = startLevel;
    const firstFall = fallsAt.length ? fallsAt[0] : -1;
    for (let i = 0; i < n; i++) {
      if (i <= firstFall) { levels[i] = startLevel; continue; }
      if (i === firstFall + 1 && rv.fallDrop) cur = Math.max(endLevel, startLevel - rv.fallDrop);
      const want = rv.lava ? hb[i] - 0.06 : hb[i] - 0.12;
      cur = Math.min(cur, Math.max(want, endLevel));
      levels[i] = cur;
    }
    // Ease into the end level over the last few samples.
    for (let i = 0; i < n; i++) {
      const k = smoothstep(n - 8, n - 1, i);
      levels[i] = levels[i] + (Math.min(levels[i], endLevel + 0.02) - levels[i]) * k;
      if (i === n - 1) levels[i] = endLevel;
    }
    // Keep monotone.
    for (let i = 1; i < n; i++) levels[i] = Math.min(levels[i], levels[i - 1]);
    const widths = dirs.map((_, i) => rv.width[0] + (rv.width[1] - rv.width[0]) * Math.pow(i / (n - 1), 0.8));
    for (let i = 0; i < n - 1; i++) {
      segList.push({ a: dirs[i], b: dirs[i + 1], wa: widths[i], wb: widths[i + 1], la: levels[i], lb: levels[i + 1],
        kind: rv.lava ? 3 : 0, fid, reach: widths[i] * 3.5 + 2.2 });
    }
    const falls = [];
    for (let i = 0; i < n - 1; i++) {
      if (levels[i] - levels[i + 1] > 0.18) falls.push(i);
    }
    const river = { ...rv, fid, dirs, levels, widths, falls, length: pathLength(dirs) };
    rivers.push(river);
    riverById[rv.id] = river;
  });
  onProgress(0.3, 'Carving the rivers');

  // ---- Roads via A* ----
  const nodeOf = {};
  settlements.forEach(s => { nodeOf[s.id] = s; });
  landmarks.forEach(l => { nodeOf[l.id] = l; });
  const G = 176;
  const astar = new GridAStar(f1, G, lakes);
  const roads = [];
  const roadHash = new Map();
  for (const [a, b] of ROADS) {
    if (a === b || !nodeOf[a] || !nodeOf[b]) continue;
    const A = nodeOf[a], B = nodeOf[b];
    const cells = astar.find(A.d, B.d);
    if (!cells) { console.warn('No road path', a, b); continue; }
    astar.markRoad(cells);
    let pts = cells.map(c => cellCenterDir(c, G));
    pts[0] = A.d.slice(); pts[pts.length - 1] = B.d.slice();
    pts = simplifyPath(pts, 0.35);
    for (let k = 0; k < 3; k++) pts = chaikin(pts);
    pts = resamplePath(pts, 0.22);
    // Gentle wiggle so roads never look ruled.
    pts = pts.map((d, i) => {
      const endFade = Math.min(1, i / 8, (pts.length - 1 - i) / 8);
      const m = noise.noise3(d[0] * 90, d[1] * 90, d[2] * 90) * 0.12 * endFade;
      return offsetDir(d, m, m * 0.5);
    });
    // Merge with earlier roads: snap points that run alongside an existing road onto it.
    pts = snapToRoads(pts, roadHash);
    pts = resamplePath(dedupe(pts), 0.22);
    const hraw = pts.map(d => f1.height(d[0], d[1], d[2]));
    const lv = hraw.map((_, i) => {
      let s = 0, w = 0;
      for (let k = -5; k <= 5; k++) {
        const j = Math.min(pts.length - 1, Math.max(0, i + k));
        const ww = 1 - Math.abs(k) / 6;
        s += hraw[j] * ww; w += ww;
      }
      return Math.max(0.1, s / w);
    });
    const major = (A.kind === 'capital' || B.kind === 'capital' || A.kind === 'port' || B.kind === 'port');
    const hw = major ? 0.085 : 0.065;
    const road = { a, b, dirs: pts, levels: lv, halfWidth: hw, major, length: pathLength(pts) };
    roads.push(road);
    addToRoadHash(roadHash, pts);
    for (let i = 0; i < pts.length - 1; i++) {
      segList.push({ a: pts[i], b: pts[i + 1], wa: hw, wb: hw, la: lv[i], lb: lv[i + 1], kind: 1, fid: roads.length - 1, reach: hw + 0.8 });
    }
  }
  onProgress(0.5, 'Laying the roads');

  // ---- Ley lines ----
  const leys = LEYLINES.map(line => {
    let dirs = line.map(p => latLonToDir(p[0], p[1]));
    dirs = smoothPath(dirs, 8);
    dirs = resamplePath(dirs, 0.5);
    for (let i = 0; i < dirs.length - 1; i++) segList.push({ a: dirs[i], b: dirs[i + 1], wa: 0, wb: 0, la: 0, lb: 0, kind: 2, fid: 0, reach: 1.2 });
    return dirs;
  });

  const segs = packSegs(segList);
  const features = { pads, lakes, segs, nRivers: RIVERS.length, grid: buildGrid(segs, 64, segList) };
  const field = new TerrainField(features);
  onProgress(0.65, 'Weaving the ley lines');

  // ---- Bridges where roads cross rivers ----
  const bridges = [];
  for (const road of roads) {
    let inside = false, enter = 0;
    for (let i = 0; i < road.dirs.length; i++) {
      const d = road.dirs[i];
      const near = nearestRiver(rivers, d);
      const wet = near && near.dist < near.width + 0.12 && !near.lava;
      if (wet && !inside) { inside = true; enter = i; }
      if ((!wet || i === road.dirs.length - 1) && inside) {
        inside = false;
        const i0 = Math.max(0, enter - 2), i1 = Math.min(road.dirs.length - 1, i + 1);
        const a = road.dirs[i0], b = road.dirs[i1];
        const mid = slerp(a, b, 0.5);
        const ha = field.height(a[0], a[1], a[2]), hb = field.height(b[0], b[1], b[2]);
        const rv = nearestRiver(rivers, mid);
        bridges.push({ a, b, mid, deckH: Math.max(ha, hb, (rv ? rv.level : 0) + 0.12) + 0.02, length: arcDist(a, b), river: rv ? rv.id : null });
      }
    }
  }

  // ---- Aqueduct ----
  const aqA = latLonToDir(...AQUEDUCT.from), aqB = latLonToDir(...AQUEDUCT.to);
  const aqDirs = resamplePath([aqA, slerp(aqA, aqB, 0.5), aqB], 0.42);
  const aqueduct = aqDirs.map((d, i) => ({
    d, h: AQUEDUCT.startH + (AQUEDUCT.endH - AQUEDUCT.startH) * (i / (aqDirs.length - 1)),
    ground: field.height(d[0], d[1], d[2]),
  }));

  // ---- Sea lanes ----
  const lanes = SEA_LANES.map(l => {
    let dirs = l.pts.map(p => latLonToDir(p[0], p[1]));
    if (l.loop) dirs.push(dirs[0].slice());
    dirs = smoothPath(dirs, 12);
    dirs = resamplePath(dirs, 0.5);
    return { ...l, dirs, length: pathLength(dirs) };
  });

  onProgress(0.8, 'Charting the seas');
  const ms = performance.now() - t0;
  const world = { field, features, settlements, landmarks, lakes, rivers, riverById, roads, leys, bridges, aqueduct, lanes, buildMs: ms };
  // Append more segments (town streets) and rebuild the index and field.
  world.addSegments = (extra) => {
    const all = segList.concat(extra);
    const packed = packSegs(all);
    const f = { pads, lakes, segs: packed, nRivers: RIVERS.length, grid: buildGrid(packed, 64) };
    world.features = f;
    world.field = new TerrainField(f);
  };
  return world;
}

function nearestRiver(rivers, d) {
  let best = null;
  for (const rv of rivers) {
    // Cheap reject using the river's bounding sample spacing.
    for (let i = 0; i < rv.dirs.length; i += 1) {
      const q = rv.dirs[i];
      const dx = d[0] - q[0], dy = d[1] - q[1], dz = d[2] - q[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * R;
      if (!best || dist < best.dist) best = { dist, width: rv.widths[i], level: rv.levels[i], lava: !!rv.lava, id: rv.id };
    }
  }
  return best;
}

const HASH_CELL = 0.5;
function hkey(x, y, z) { return `${Math.floor(x / HASH_CELL)},${Math.floor(y / HASH_CELL)},${Math.floor(z / HASH_CELL)}`; }
function addToRoadHash(hash, pts) {
  for (const d of pts) {
    const k = hkey(d[0] * R, d[1] * R, d[2] * R);
    let arr = hash.get(k);
    if (!arr) { arr = []; hash.set(k, arr); }
    arr.push(d);
  }
}
function snapToRoads(pts, hash) {
  const snapDist = 0.42;
  return pts.map((d) => {
    const x = d[0] * R, y = d[1] * R, z = d[2] * R;
    let best = null, bd = snapDist;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const arr = hash.get(hkey(x + i * HASH_CELL, y + j * HASH_CELL, z + k * HASH_CELL));
      if (!arr) continue;
      for (const q of arr) {
        const dd = Math.hypot(q[0] * R - x, q[1] * R - y, q[2] * R - z);
        if (dd < bd) { bd = dd; best = q; }
      }
    }
    return best ? best.slice() : d;
  });
}
function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * R > 0.05) out.push(p);
  }
  if (out.length < 2) out.push(pts[pts.length - 1]);
  return out;
}

function packSegs(list) {
  const n = list.length;
  const s = {
    count: n, a: new Float64Array(n * 3), b: new Float64Array(n * 3), wa: new Float32Array(n), wb: new Float32Array(n),
    la: new Float32Array(n), lb: new Float32Array(n), kind: new Uint8Array(n), fid: new Int16Array(n), reach: new Float32Array(n),
  };
  list.forEach((g, i) => {
    s.a.set(g.a, i * 3); s.b.set(g.b, i * 3);
    s.wa[i] = g.wa; s.wb[i] = g.wb; s.la[i] = g.la; s.lb[i] = g.lb; s.kind[i] = g.kind; s.fid[i] = g.fid; s.reach[i] = g.reach;
  });
  return s;
}

// CSR grid: for each cube cell, the segments whose influence may reach it.
function buildGrid(segs, G) {
  const nCells = 6 * G * G;
  const lists = new Map();
  const tmp = { f: 0, u: 0, v: 0 };
  const cellSize = (Math.PI / 2 * R) / G;
  for (let s = 0; s < segs.count; s++) {
    const a = [segs.a[s * 3], segs.a[s * 3 + 1], segs.a[s * 3 + 2]];
    const b = [segs.b[s * 3], segs.b[s * 3 + 1], segs.b[s * 3 + 2]];
    const reach = segs.reach[s];
    const L = arcDist(a, b);
    const steps = Math.max(1, Math.ceil(L / (cellSize * 0.4)));
    const rings = Math.ceil(reach / (cellSize * 0.45));
    const seen = new Set();
    for (let k = 0; k <= steps; k++) {
      const p = slerp(a, b, k / steps);
      for (let ix = -rings; ix <= rings; ix++) {
        for (let iy = -rings; iy <= rings; iy++) {
          const ox = (ix / Math.max(1, rings)) * reach, oy = (iy / Math.max(1, rings)) * reach;
          if (ox * ox + oy * oy > reach * reach * 1.5) continue;
          const q = offsetDir(p, ox, oy);
          const c = dirToCell(q, G, tmp);
          if (seen.has(c)) continue;
          seen.add(c);
          let arr = lists.get(c);
          if (!arr) { arr = []; lists.set(c, arr); }
          arr.push(s);
        }
      }
    }
  }
  const offsets = new Int32Array(nCells + 1);
  let total = 0;
  for (let c = 0; c < nCells; c++) { offsets[c] = total; const l = lists.get(c); if (l) total += l.length; }
  offsets[nCells] = total;
  const items = new Int32Array(total);
  for (let c = 0; c < nCells; c++) { const l = lists.get(c); if (l) items.set(l, offsets[c]); }
  return { G, offsets, items };
}

// ---- A* over the cube-sphere grid ----
class GridAStar {
  constructor(field, G, lakes) {
    this.field = field; this.G = G; this.lakes = lakes;
    const n = 6 * G * G;
    this.h = new Float32Array(n).fill(NaN);
    this.road = new Uint8Array(n);
    this.cellLen = (Math.PI / 2 * R) / G;
    this.tmp = { f: 0, u: 0, v: 0 };
  }
  height(c) {
    let v = this.h[c];
    if (Number.isNaN(v)) {
      const d = cellCenterDir(c, this.G);
      v = this.field.height(d[0], d[1], d[2]);
      for (const L of this.lakes) if (arcDist(d, L.d) < L.r + 0.2) v = -1;
      this.h[c] = v;
    }
    return v;
  }
  neighbors(c) {
    const G = this.G;
    const f = Math.floor(c / (G * G));
    const r = c - f * G * G;
    const j = Math.floor(r / G), i = r - j * G;
    const out = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && ni < G && nj >= 0 && nj < G) out.push(f * G * G + nj * G + ni);
      else {
        const d = faceUVToDir(f, ((ni + 0.5) / G) * 2 - 1, ((nj + 0.5) / G) * 2 - 1);
        out.push(dirToCell(d, G, this.tmp));
      }
    }
    return out;
  }
  markRoad(cells) { for (const c of cells) this.road[c] = 1; }
  find(da, db) {
    const G = this.G;
    const start = dirToCell(da, G), goal = dirToCell(db, G);
    const goalDir = cellCenterDir(goal, G);
    const g = new Map(), came = new Map();
    const open = new MinHeap();
    g.set(start, 0);
    open.push(start, 0);
    const closed = new Set();
    let iter = 0;
    while (open.size) {
      const c = open.pop();
      if (c === goal) break;
      if (closed.has(c)) continue;
      closed.add(c);
      if (++iter > 60000) return null;
      const hc = this.height(c);
      const dc = cellCenterDir(c, G);
      for (const nb of this.neighbors(c)) {
        if (closed.has(nb)) continue;
        const hn = this.height(nb);
        const nearEnd = nb === goal || nb === start;
        if (hn < 0.08 && !nearEnd) continue;
        const dn = cellCenterDir(nb, G);
        const L = arcDist(dc, dn);
        const slope = Math.abs(hn - hc) / L;
        let cost = L * (1 + slope * slope * 60 + slope * 6);
        if (hn > 3.2) cost *= 1 + (hn - 3.2) * 2;
        if (this.road[nb]) cost *= 0.45;
        const ng = g.get(c) + cost;
        if (ng < (g.get(nb) ?? Infinity)) {
          g.set(nb, ng); came.set(nb, c);
          open.push(nb, ng + arcDist(dn, goalDir) * 0.9);
        }
      }
    }
    if (!came.has(goal) && start !== goal) return null;
    const path = [goal];
    let c = goal;
    while (c !== start) { c = came.get(c); path.push(c); }
    return path.reverse();
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[i], k[par]] = [k[par], k[i]]; [p[i], p[par]] = [p[par], p[i]];
      i = par;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]]; [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}

function simplifyPath(pts, tol) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let anchor = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const nxt = pts[i + 1];
    // Drop points that sit close to the chord from anchor to the next point.
    const ab = [nxt[0] - anchor[0], nxt[1] - anchor[1], nxt[2] - anchor[2]];
    const ap = [pts[i][0] - anchor[0], pts[i][1] - anchor[1], pts[i][2] - anchor[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = L2 > 0 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2 : 0;
    const q = [ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t];
    const dev = Math.hypot(q[0], q[1], q[2]) * R;
    if (dev > tol) { out.push(pts[i]); anchor = pts[i]; }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(normalize([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25]));
    out.push(normalize([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
