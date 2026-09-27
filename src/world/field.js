// Terrain field: height and surface appearance for any unit direction on the planet.
// Pure JS so the terrain workers share it. Heights are world units above sea level.

import { Simplex, smoothstep, clamp, hash3 } from '../core/noise.js';
import { latLonToDir, PLANET_RADIUS, DEG, dirToCell } from '../core/sphere.js';
import { CONTINENTS, RANGES, PEAKS, VOLCANO, REGIONS, WORLD_SEED } from './atlas.js';

const R = PLANET_RADIUS;

// Info slots written by heightInfo and read by surface.
export const I_H = 0, I_E = 1, I_MOUNT = 2, I_RIVD = 3, I_RIVW = 4, I_RIVK = 5, I_ROADD = 6,
  I_LEYD = 7, I_PADD = 8, I_PADI = 9, I_LAKED = 10, I_VOLC = 11, I_CLIFF = 12, I_ROADW = 13,
  I_ROADX = 14, I_ROADY = 15, I_ROADZ = 16, I_RIVX = 17, I_RIVY = 18, I_RIVZ = 19;
export const INFO_SIZE = 20;

function chordToUnits(c2) { return Math.sqrt(c2) * R; }

function srgb(c) { return [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)]; }

export class TerrainField {
  constructor(features = null) {
    this.n1 = new Simplex(WORLD_SEED);
    this.n2 = new Simplex(WORLD_SEED + 1);
    this.n3 = new Simplex(WORLD_SEED + 2);
    this.n4 = new Simplex(WORLD_SEED + 3);
    this.n5 = new Simplex(WORLD_SEED + 4);

    const nb = CONTINENTS.length;
    this.blobC = new Float64Array(nb * 3);
    this.blobInvR2 = new Float64Array(nb);
    this.blobW = new Float64Array(nb);
    CONTINENTS.forEach((b, i) => {
      const d = latLonToDir(b[0], b[1]);
      this.blobC.set(d, i * 3);
      const ch = 2 * Math.sin((b[2] * DEG) / 2);
      this.blobInvR2[i] = 1 / (ch * ch);
      this.blobW[i] = b[3];
    });

    // Mountain range segments as chord endpoints.
    const segs = [];
    for (const rg of RANGES) {
      for (let i = 0; i < rg.pts.length - 1; i++) {
        segs.push({ a: latLonToDir(...rg.pts[i]), b: latLonToDir(...rg.pts[i + 1]), w: rg.width * DEG * R, h: rg.height });
      }
    }
    this.rangeSegs = segs;
    this.peaks = PEAKS.map(p => ({ d: latLonToDir(p[0], p[1]), r: p[2] * DEG * R, h: p[3] }));
    this.volc = { d: latLonToDir(VOLCANO.lat, VOLCANO.lon), r: VOLCANO.radius * DEG * R, h: VOLCANO.height, crater: VOLCANO.crater };

    this.regions = REGIONS.map(r => ({
      ...r,
      d: r.center ? latLonToDir(r.center[0], r.center[1]) : null,
      invR2: r.center ? 1 / Math.pow(2 * Math.sin((r.r * DEG) / 2), 2) : 0,
      grassL: srgb(r.grass), dryL: srgb(r.dry),
    }));
    this.regionW = new Float64Array(this.regions.length);

    this.setFeatures(features);
  }

  setFeatures(f) {
    this.features = f;
    if (!f) return;
    this.pads = f.pads;
    this.lakes = f.lakes;
    const s = f.segs;
    this.sa = s.a; this.sb = s.b; this.swa = s.wa; this.swb = s.wb; this.sla = s.la; this.slb = s.lb;
    this.skind = s.kind; this.sfid = s.fid;
    this.gridG = f.grid.G; this.gridOff = f.grid.offsets; this.gridItems = f.grid.items;
    this.nRivers = f.nRivers;
    this.rivBestD = new Float64Array(this.nRivers);
    this.rivBestL = new Float64Array(this.nRivers);
    this.rivBestW = new Float64Array(this.nRivers);
    this.cellTmp = { f: 0, u: 0, v: 0 };
  }

  regionWeights(qx, qy, qz) {
    const W = this.regionW, regs = this.regions;
    let sum = 0;
    for (let i = 0; i < regs.length; i++) {
      const r = regs[i];
      let w;
      if (!r.d) w = 0.22;
      else {
        const dx = qx - r.d[0], dy = qy - r.d[1], dz = qz - r.d[2];
        const t2 = (dx * dx + dy * dy + dz * dz) * r.invR2;
        w = t2 > 12 ? 0 : Math.exp(-0.9 * t2 * t2 * 0.5 - 0.3 * t2);
      }
      W[i] = w; sum += w;
    }
    for (let i = 0; i < regs.length; i++) W[i] /= sum;
    return W;
  }

  regionProp(key) {
    const W = this.regionW, regs = this.regions;
    let v = 0;
    for (let i = 0; i < regs.length; i++) if (W[i] > 0.001) v += W[i] * (regs[i][key] || 0);
    return v;
  }

  // Continent signed field e (>0 land) using the warped direction.
  continent(qx, qy, qz) {
    let C = 0;
    const bc = this.blobC, ir = this.blobInvR2, bw = this.blobW;
    for (let i = 0, n = bw.length; i < n; i++) {
      const dx = qx - bc[i * 3], dy = qy - bc[i * 3 + 1], dz = qz - bc[i * 3 + 2];
      const t2 = (dx * dx + dy * dy + dz * dz) * ir[i];
      if (t2 < 10) C += bw[i] * Math.exp(-0.6931 * t2);
    }
    if (C < -0.6) C = -0.6;
    const n2 = this.n2;
    C += 0.2 * n2.fbm(qx * 4.6, qy * 4.6, qz * 4.6, 4) + 0.07 * n2.fbm(qx * 17 + 5, qy * 17, qz * 17, 3);
    return C - 0.5;
  }

  // Full height with feature carving. info (Float32Array/Float64Array of INFO_SIZE) is optional.
  heightInfo(x, y, z, lod = 0, info = null) {
    const n1 = this.n1, n3 = this.n3, n4 = this.n4, n5 = this.n5;
    // Domain warp for organic coastlines and region borders.
    const wx = n1.fbm(x * 1.7 + 11.3, y * 1.7, z * 1.7, 3);
    const wy = n1.fbm(x * 1.7, y * 1.7 + 23.1, z * 1.7, 3);
    const wz = n1.fbm(x * 1.7, y * 1.7, z * 1.7 + 37.7, 3);
    let qx = x + 0.075 * wx, qy = y + 0.075 * wy, qz = z + 0.075 * wz;
    const ql = Math.hypot(qx, qy, qz); qx /= ql; qy /= ql; qz /= ql;

    const e = this.continent(qx, qy, qz);
    this.regionWeights(qx, qy, qz);
    const hills = this.regionProp('hills');
    const mesa = this.regionProp('mesa');
    const marsh = this.regionProp('marsh');

    let h, cliff = 0;
    if (e >= 0) {
      const inland = smoothstep(0, 0.6, e);
      h = 0.07 + 0.85 * inland;
      const hn = n3.fbm(x * 9, y * 9, z * 9, 5) * 0.5 + 0.5;
      h += hills * 1.5 * Math.pow(hn, 1.7) * smoothstep(0, 0.14, e);
      const cn = n4.noise3(x * 7.5, y * 7.5, z * 7.5);
      cliff = smoothstep(0.12, 0.42, cn);
      h += cliff * 0.75 * smoothstep(0.0, 0.035, e) * (1 - marsh);
    } else {
      const shelf = smoothstep(0, -0.09, e);
      const deep = smoothstep(-0.07, -0.42, e);
      h = 0.06 + e * 1.2 - 0.3 * shelf - 3.1 * deep + 0.3 * n3.fbm(x * 6, y * 6, z * 6, 3) * deep;
    }

    // Mountain ranges.
    const landMask = smoothstep(-0.06, 0.1, e);
    let mprof = 0, mh = 0;
    const rs = this.rangeSegs;
    for (let i = 0; i < rs.length; i++) {
      const s = rs[i];
      const d = segDistUnits(x, y, z, s.a, s.b);
      if (d < s.w) {
        const p = 1 - d / s.w;
        const v = p * p * (3 - 2 * p);
        if (v * s.h > mprof * mh) { mprof = v; mh = s.h; }
      }
    }
    for (const pk of this.peaks) {
      const dx = x - pk.d[0], dy = y - pk.d[1], dz = z - pk.d[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * R;
      if (d < pk.r) {
        const p = 1 - d / pk.r;
        const v = p * p;
        if (v * pk.h > mprof * mh) { mprof = v; mh = pk.h; }
      }
    }
    let mount = 0;
    if (mprof > 0) {
      const ridge = n5.ridged(x * 21, y * 21, z * 21, 4);
      const broad = n3.noise3(x * 9 + 3, y * 9, z * 9) * 0.5 + 0.5;
      const m = mprof * mh * (0.3 + 0.55 * ridge + 0.25 * broad) + mprof * mh * 0.06 * n3.noise3(x * 55, y * 55, z * 55);
      h += m * landMask;
      mount = clamp(mprof * (0.4 + ridge), 0, 1) * landMask;
    }

    // Volcano.
    let volc = 0;
    {
      const v = this.volc;
      const dx = x - v.d[0], dy = y - v.d[1], dz = z - v.d[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * R;
      if (d < v.r) {
        const p = 1 - d / v.r;
        const rim = v.h * Math.pow(1 - v.crater / v.r, 1.5);
        let hv;
        if (d < v.crater) {
          const t = d / v.crater;
          hv = rim - 1.3 * (1 - t * t) + 0.2 * t;
        } else hv = v.h * Math.pow(p, 1.5) + 0.12 * n5.ridged(x * 40, y * 40, z * 40, 3) * p * (1 - p);
        h = Math.max(h, h * (1 - p) + hv);
        volc = d < v.crater * 0.85 ? 1 : 0.5 * p;
      }
    }

    // Terraced mesas and marsh flats.
    if (mesa > 0.05 && e > 0) {
      const mn = n4.fbm(x * 8 + 3, y * 8, z * 8, 3);
      const plate = smoothstep(0.05, 0.16, mn) * 1.6 + smoothstep(0.3, 0.38, mn) * 1.0;
      h += plate * mesa * smoothstep(0, 0.1, e);
    }
    if (marsh > 0.05 && e > -0.05) {
      const mn = n4.fbm(x * 16, y * 16 + 7, z * 16, 3);
      const flat = 0.05 + 0.18 * mn;
      h = h + (flat - h) * clamp(marsh * 1.4, 0, 1) * smoothstep(-0.05, 0.08, e) * (1 - mprof);
    }

    if (info) {
      info[I_E] = e; info[I_MOUNT] = mount; info[I_VOLC] = volc; info[I_CLIFF] = cliff;
      info[I_RIVD] = 1e9; info[I_RIVW] = 0; info[I_RIVK] = 0; info[I_ROADD] = 1e9; info[I_ROADW] = 0;
      info[I_LEYD] = 1e9; info[I_PADD] = 1e9; info[I_PADI] = -1; info[I_LAKED] = 1e9;
      info[I_ROADX] = 0; info[I_ROADY] = 0; info[I_ROADZ] = 0; info[I_RIVX] = 0; info[I_RIVY] = 0; info[I_RIVZ] = 0;
    }

    if (this.features) h = this.applyFeatures(x, y, z, h, lod, info);
    if (info) info[I_H] = h;
    return h;
  }

  height(x, y, z, lod = 0) { return this.heightInfo(x, y, z, lod, null); }

  applyFeatures(x, y, z, h, lod, info) {
    // Lakes
    const lakes = this.lakes;
    for (let i = 0; i < lakes.length; i++) {
      const L = lakes[i];
      const dx = x - L.d[0], dy = y - L.d[1], dz = z - L.d[2];
      const c2 = dx * dx + dy * dy + dz * dz;
      if (c2 > L.reach2) continue;
      const d = Math.sqrt(c2) * R;
      const rr = L.r * (1 + 0.16 * this.n2.noise3(x * 60 + i, y * 60, z * 60));
      const blend = 0.9 + L.r * 0.6;
      if (d < rr) {
        const t = d / rr;
        const target = L.level - 0.03 - L.depth * (1 - t * t);
        h = Math.min(h, target);
        if (h < target - 0.4) h = target - 0.4;
      } else if (d < rr + blend) {
        const t = smoothstep(rr, rr + blend, d);
        const shore = Math.max(h, L.level + 0.04 + (d - rr) * 0.25);
        h = shore + (h - shore) * t;
      }
      if (info) { const ld = d / rr - 1; if (ld < info[I_LAKED]) info[I_LAKED] = ld; }
    }

    // Settlement pads
    const pads = this.pads;
    let bestPad = 1e9, bestPadI = -1;
    for (let i = 0; i < pads.length; i++) {
      const P = pads[i];
      const dx = x - P.d[0], dy = y - P.d[1], dz = z - P.d[2];
      const c2 = dx * dx + dy * dy + dz * dz;
      if (c2 > P.reach2) continue;
      const d = Math.sqrt(c2) * R;
      const nd = d / P.r;
      if (nd < bestPad) { bestPad = nd; bestPadI = i; }
      if (P.strength <= 0) continue;
      const w = 1 - smoothstep(P.r * 0.8, P.r + P.blend, d);
      if (w <= 0) continue;
      let target = P.h;
      if (P.moundH) target += P.moundH * (1 - smoothstep(P.moundR * 0.3, P.moundR * 1.15, d));
      const land = smoothstep(-0.25, 0.05, h);
      h += (target - h) * w * P.strength * land;
    }
    if (info) { info[I_PADD] = bestPad; info[I_PADI] = bestPadI; }

    // Segment features via the cube grid index.
    const cell = dirToCell([x, y, z], this.gridG, this.cellTmp);
    const o0 = this.gridOff[cell], o1 = this.gridOff[cell + 1];
    if (o1 > o0) {
      const items = this.gridItems, sa = this.sa, sb = this.sb;
      const nr = this.nRivers;
      const bD = this.rivBestD, bL = this.rivBestL, bW = this.rivBestW;
      for (let r = 0; r < nr; r++) bD[r] = 1e9;
      let roadD = 1e9, roadL = 0, roadW = 0, leyD = 1e9, rivK = 0, rox = 0, roy = 0, roz = 0, paved = false;
      const rvx = this.rivOffX || (this.rivOffX = new Float64Array(nr)), rvy = this.rivOffY || (this.rivOffY = new Float64Array(nr)), rvz = this.rivOffZ || (this.rivOffZ = new Float64Array(nr));
      for (let k = o0; k < o1; k++) {
        const s = items[k];
        const ax = sa[s * 3], ay = sa[s * 3 + 1], az = sa[s * 3 + 2];
        const ex = sb[s * 3] - ax, ey = sb[s * 3 + 1] - ay, ez = sb[s * 3 + 2] - az;
        const px = x - ax, py = y - ay, pz = z - az;
        const ee = ex * ex + ey * ey + ez * ez;
        let t = ee > 0 ? (px * ex + py * ey + pz * ez) / ee : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - ex * t, qy = py - ey * t, qz = pz - ez * t;
        const d = Math.sqrt(qx * qx + qy * qy + qz * qz) * R;
        const kind = this.skind[s];
        const w = this.swa[s] + (this.swb[s] - this.swa[s]) * t;
        const lv = this.sla[s] + (this.slb[s] - this.sla[s]) * t;
        if (kind === 0 || kind === 3) {
          const f = this.sfid[s];
          if (d - w < bD[f] - bW[f]) { bD[f] = d; bL[f] = lv; bW[f] = w; rvx[f] = qx * R; rvy[f] = qy * R; rvz[f] = qz * R; if (kind === 3) rivK |= (1 << f); }
        } else if (kind === 1 || kind === 4) {
          if (d - w < roadD - roadW) { roadD = d; roadL = lv; roadW = w; rox = qx * R; roy = qy * R; roz = qz * R; paved = kind === 4; }
        } else if (kind === 2) {
          if (d < leyD) leyD = d;
        }
      }
      // Roads flatten before rivers so rivers always cut through.
      if (roadD < 1e8) {
        const rw = roadW + 0.05;
        const wgt = paved ? 0 : (1 - smoothstep(rw, rw + 0.8, roadD)) * smoothstep(0.85, 1.35, bestPad);
        if (wgt > 0) h += (roadL - h) * wgt * 0.8;
        if (info) { info[I_ROADD] = roadD; info[I_ROADW] = paved ? -roadW : roadW; info[I_ROADX] = rox; info[I_ROADY] = roy; info[I_ROADZ] = roz; }
      }
      if (info) info[I_LEYD] = leyD;
      let bestRiv = 1e9, bestRivW = 0, bestRivK = 0;
      for (let f = 0; f < nr; f++) {
        const d = bD[f];
        if (d > 1e8) continue;
        const lava = (rivK >> f) & 1;
        const hw = bW[f];
        const wEff = Math.max(hw, lod * 0.75);
        const V = wEff * 2.5 + 0.9 + lod * 1.5;
        const Ws = bL[f];
        if (d < wEff) {
          const depth = lava ? 0.05 : 0.08 + 0.3 * hw;
          const tt = d / wEff;
          h = Ws - depth * (1 - tt * tt);
        } else if (d < V) {
          const t = smoothstep(wEff, V, d);
          const floor = Ws + 0.035 + (d - wEff) * 0.1;
          h = floor + (h - floor) * t;
        }
        if (d - hw < bestRiv - bestRivW) { bestRiv = d; bestRivW = hw; bestRivK = lava; if (info) { info[I_RIVX] = rvx[f]; info[I_RIVY] = rvy[f]; info[I_RIVZ] = rvz[f]; } }
      }
      if (info) { info[I_RIVD] = bestRiv; info[I_RIVW] = bestRivW; info[I_RIVK] = bestRivK; }
    }
    return h;
  }

  // Forest density 0..1 at a point, given info from heightInfo and a slope (0 flat .. 1 vertical).
  forest(x, y, z, info, slope) {
    const h = info[I_H];
    if (h < 0.06) return 0;
    const fw = this.regionProp('forest');
    const fn = 0.62 * (this.n3.fbm(x * 5.5 + 17, y * 5.5, z * 5.5, 4) * 0.5 + 0.5) + 0.38 * (this.n1.fbm(x * 19, y * 19 + 5, z * 19, 3) * 0.5 + 0.5);
    let f = smoothstep(0.47, 0.6, fn + (fw - 0.5) * 0.6);
    const cold = this.regionProp('cold');
    const treeline = 4.1 - cold * 1.8;
    f *= 1 - smoothstep(treeline - 0.6, treeline, h);
    f *= 1 - smoothstep(0.45, 0.7, slope);
    const pd = info[I_PADD];
    if (pd < 1e8) {
      const pad = this.pads[info[I_PADI]];
      const farmR = pad.farmR / pad.r;
      f *= smoothstep(1.0, 1.35, pd);
      if (farmR > 0) f *= smoothstep(farmR * 0.75, farmR * 1.05, pd);
    }
    f *= smoothstep(0.3, 0.9, info[I_ROADD] - Math.abs(info[I_ROADW]));
    f *= smoothstep(0.15, 0.6, info[I_RIVD] - info[I_RIVW]);
    f *= smoothstep(0.0, 0.5, info[I_LAKED] * 3);
    f *= 1 - info[I_VOLC];
    return f;
  }

  // Local field coordinates around the nearest farming settlement (continuous, for the shader).
  farmCoords(x, y, z, info, out) {
    const pi = info[I_PADI];
    if (pi < 0) return false;
    const pad = this.pads[pi];
    if (!pad.farmR) return false;
    const d = info[I_PADD] * pad.r;
    if (d > pad.farmR * 1.3) return false;
    const e = pad.e, n = pad.n;
    const px = (x - pad.d[0]) * R, py = (y - pad.d[1]) * R, pz = (z - pad.d[2]) * R;
    const u = px * e[0] + py * e[1] + pz * e[2];
    const v = px * n[0] + py * n[1] + pz * n[2];
    const ca = Math.cos(pad.farmAngle), sa = Math.sin(pad.farmAngle);
    out.ru = u * ca - v * sa; out.rv = u * sa + v * ca;
    return true;
  }

  // Farmland crop at a point: returns -1 if none, else crop id 0..5; writes local row coordinate.
  farm(x, y, z, info, slope, out) {
    const pi = info[I_PADI];
    if (pi < 0) return -1;
    const pad = this.pads[pi];
    if (!pad.farmR) return -1;
    const d = info[I_PADD] * pad.r;
    if (d < pad.r * 0.95) return -1;
    const edge = pad.farmR * (0.85 + 0.25 * this.n4.noise3(x * 20, y * 20, z * 20));
    if (d > edge) return -1;
    if (slope > 0.35 || info[I_H] < 0.1) return -1;
    if (info[I_RIVD] - info[I_RIVW] < 0.2 || info[I_ROADD] - Math.abs(info[I_ROADW]) < 0.08) return -1;
    // Local frame coordinates, rotated per settlement.
    const e = pad.e, n = pad.n;
    const px = (x - pad.d[0]) * R, py = (y - pad.d[1]) * R, pz = (z - pad.d[2]) * R;
    let u = px * e[0] + py * e[1] + pz * e[2];
    let v = px * n[0] + py * n[1] + pz * n[2];
    const ca = Math.cos(pad.farmAngle), sa = Math.sin(pad.farmAngle);
    const ru = u * ca - v * sa, rv = u * sa + v * ca;
    const cw = 0.62, ch = 0.95;
    const cj = Math.floor(rv / ch);
    const ci = Math.floor(ru / cw + (cj & 1) * 0.5);
    out.fu = ru / cw + (cj & 1) * 0.5 - ci;
    out.fv = rv / ch - cj;
    out.row = ru;
    out.ru = ru; out.rv = rv;
    const hsh = hash3(ci, cj, pi * 7 + 3);
    return Math.floor(hsh * 6);
  }

  // Vertex appearance. out: {r,g,b, rock, snow, lava, town, mr,mg,mb}
  surface(x, y, z, info, slope, lod, out) {
    const h = info[I_H];
    this.regionWeights(x, y, z);
    const W = this.regionW, regs = this.regions;
    let gr = 0, gg = 0, gb = 0, dr = 0, dg = 0, db = 0;
    for (let i = 0; i < regs.length; i++) {
      const w = W[i];
      if (w < 0.001) continue;
      gr += w * regs[i].grassL[0]; gg += w * regs[i].grassL[1]; gb += w * regs[i].grassL[2];
      dr += w * regs[i].dryL[0]; dg += w * regs[i].dryL[1]; db += w * regs[i].dryL[2];
    }
    const cold = this.regionProp('cold');
    const volcanic = this.regionProp('volcanic');
    const mesa = this.regionProp('mesa');
    const marsh = this.regionProp('marsh');
    const magic = this.regionProp('magic');
    const cursed = this.regionProp('cursed');

    const n3 = this.n3, n4 = this.n4;
    const moist = n4.fbm(x * 5 + 9, y * 5, z * 5, 3) * 0.5 + 0.5;
    const dryT = smoothstep(0.58, 0.25, moist);
    let r = gr + (dr - gr) * dryT, g = gg + (dg - gg) * dryT, b = gb + (db - gb) * dryT;
    const fine = lod < 0.4 ? 1 - lod / 0.4 : 0;
    const vN = n3.noise3(x * 40, y * 40, z * 40) * 0.12 + n3.noise3(x * 160, y * 160, z * 160) * 0.1 * fine;
    r *= 1 + vN; g *= 1 + vN * 0.8; b *= 1 + vN * 0.5;

    // Forest floor
    const forest = this.forest(x, y, z, info, slope);
    if (forest > 0) {
      const fr = r * 0.42, fg = g * 0.55, fb = b * 0.5 + 0.01;
      r += (fr - r) * forest; g += (fg - g) * forest; b += (fb - b) * forest;
    }

    // Farmland: the shader draws the patchwork crisply from these coordinates.
    const fo = this._farmOut || (this._farmOut = { fu: 0, fv: 0, row: 0, ru: 0, rv: 0 });
    const crop = this.farm(x, y, z, info, slope, fo);
    out.fw = 0; out.fu = 0; out.fv = 0; out.fs = 0;
    if (this.farmCoords(x, y, z, info, fo)) { out.fu = fo.ru; out.fv = fo.rv; out.fs = info[I_PADI]; }
    if (crop >= 0) {
      const pad = this.pads[info[I_PADI]];
      const d = info[I_PADD] * pad.r;
      out.fw = 1 - smoothstep(pad.farmR * 0.7, pad.farmR * 0.95, d);
      // Slightly warm the base so distant farmland reads as tilled land.
      const k = out.fw * 0.5;
      r += (0.3 - r) * k; g += (0.28 - g) * k; b += (0.1 - b) * k;
    }

    // Town ground
    let town = 0;
    if (info[I_PADI] >= 0) {
      const pad = this.pads[info[I_PADI]];
      const pd = info[I_PADD];
      const tw = 1 - smoothstep(0.55, 1.0, pd);
      if (tw > 0) {
        const T = pad.ground;
        const tn = 0.85 + 0.3 * n3.noise3(x * 300, y * 300, z * 300) * fine;
        const k = tw * (0.55 + 0.35 * n4.noise3(x * 90, y * 90, z * 90));
        r += (T[0] * tn - r) * k; g += (T[1] * tn - g) * k; b += (T[2] * tn - b) * k;
      }
      town = pad.glow * (1 - smoothstep(0.25, 1.25, pd));
    }

    // Marsh mud
    if (marsh > 0.1) {
      const k = clamp(marsh * 1.3, 0, 1) * (0.5 + 0.5 * n4.noise3(x * 50, y * 50, z * 50));
      r += (0.10 - r) * k * 0.6; g += (0.12 - g) * k * 0.6; b += (0.06 - b) * k * 0.6;
    }
    if (cursed > 0.2) {
      const k = (cursed - 0.2) * 0.5;
      const l = (r + g + b) / 3;
      r += (l - r) * k; g += (l * 1.05 - g) * k; b += (l - b) * k;
    }

    // Beach and seabed
    const e = info[I_E];
    let sand = 0;
    if (h < 0.16 && marsh < 0.4) {
      sand = smoothstep(0.16, 0.08, h) * (1 - info[I_CLIFF]) * (1 - smoothstep(0.3, 0.5, slope));
      if (h < 0.02) sand = 1;
      sand *= 1 - cold * 0.5;
    }
    if (sand > 0) {
      let sr = 0.74, sg = 0.62, sb = 0.4;
      if (h < 0.03) { sr *= 0.78; sg *= 0.78; sb *= 0.8; }
      r += (sr - r) * sand; g += (sg - g) * sand; b += (sb - b) * sand;
    }
    if (h < 0) {
      const t1 = smoothstep(0, -0.55, h), t2 = smoothstep(-0.4, -3.0, h);
      r += (0.06 - r) * t1; g += (0.36 - g) * t1; b += (0.36 - b) * t1;
      r += (0.012 - r) * t2; g += (0.05 - g) * t2; b += (0.12 - b) * t2;
    }

    // Rock on slopes and peaks
    const mount = info[I_MOUNT];
    let rock = clamp(smoothstep(0.5, 0.85, slope) + mount * smoothstep(1.2, 3.0, h) * 0.9, 0, 1);
    if (h < 0) rock *= 0.3;
    let rr = 0.34, rg = 0.31, rb = 0.28;
    if (volcanic > 0.2) { rr = 0.09; rg = 0.08; rb = 0.08; }
    if (mesa > 0.2 && h > 0.2) {
      const band = 0.8 + 0.2 * Math.sin(h * 26);
      rr = 0.58 * band; rg = 0.25 * band; rb = 0.13 * band;
      rock = Math.max(rock, smoothstep(0.2, 0.4, slope));
    }
    if (cold > 0.5) { rr = 0.3; rg = 0.32; rb = 0.36; }
    const strata = 0.85 + 0.15 * Math.sin(h * 14 + n4.noise3(x * 30, y * 30, z * 30) * 3);
    r += (rr * strata - r) * rock; g += (rg * strata - g) * rock; b += (rb * strata - b) * rock;

    // Volcanic ash and basalt fields
    if (volcanic > 0.2 && h > 0.05) {
      const ash = clamp((volcanic - 0.2) * 1.2, 0, 1) * (0.4 + 0.6 * info[I_VOLC]);
      r += (0.16 - r) * ash; g += (0.15 - g) * ash; b += (0.14 - b) * ash;
    }

    // Snow
    const snowline = 4.3 - cold * 3.9 + volcanic * 6 + n4.noise3(x * 25, y * 25, z * 25) * 0.35;
    let snow = smoothstep(snowline, snowline + 0.35, h) * (1 - smoothstep(0.5, 0.75, slope));
    if (h < 0.0) snow = 0;
    if (snow > 0) { r += (0.86 - r) * snow; g += (0.9 - g) * snow; b += (0.96 - b) * snow; }

    // Roads and rivers: offsets to the nearest centerline, for crisp shader edges at any LOD.
    const cap = (vx, vy, vz, m) => { const l = Math.hypot(vx, vy, vz); return l > m ? m / l : 1; };
    let lava = 0;
    if (info[I_ROADD] < 1e8) {
      const k = cap(info[I_ROADX], info[I_ROADY], info[I_ROADZ], 3);
      out.rx = info[I_ROADX] * k; out.ry = info[I_ROADY] * k; out.rz = info[I_ROADZ] * k; out.rw = info[I_ROADW];
    } else { out.rx = 3; out.ry = 0; out.rz = 0; out.rw = 0; }
    if (info[I_RIVD] < 1e8) {
      const k = cap(info[I_RIVX], info[I_RIVY], info[I_RIVZ], 4);
      out.vx = info[I_RIVX] * k; out.vy = info[I_RIVY] * k; out.vz = info[I_RIVZ] * k;
      const vw = Math.max(info[I_RIVW], lod * 0.22);
      out.vw = info[I_RIVK] ? -vw : vw;
      if (info[I_RIVK]) {
        const rw = info[I_RIVW];
        lava = Math.max(lava, (1 - smoothstep(rw, rw + 0.6, info[I_RIVD])) * 0.3);
      } else {
        const rw = info[I_RIVW];
        const bank = 1 - smoothstep(rw, rw + 0.3, info[I_RIVD]);
        r *= 1 - bank * 0.3; g *= 1 - bank * 0.25; b *= 1 - bank * 0.2;
      }
    } else { out.vx = 4; out.vy = 0; out.vz = 0; out.vw = 0; }

    // Volcano crater lava and ember cracks
    const volc = info[I_VOLC];
    if (volc >= 1) lava = 1;
    if (volcanic > 0.4 && h > 0.2 && lava < 0.5 && volc > 0.05 && lod < 0.3) {
      // Glowing fissures on the volcano's flanks, only where they can be resolved.
      const crack = n4.ridged(x * 90, y * 90, z * 90, 2);
      const k = smoothstep(0.9, 0.97, crack) * (volcanic - 0.4) * 1.6 * volc * (1 - lod / 0.3);
      lava = Math.max(lava, k);
    }
    if (lava > 0) { r *= 1 - lava * 0.6; g *= 1 - lava * 0.7; b *= 1 - lava * 0.7; }

    // Magic: ley lines, fae glow, rift cracks
    let mr = 0, mg = 0, mb = 0;
    const leyD = info[I_LEYD];
    if (leyD < 1e8) {
      const lw = 0.07 + lod * 0.22;
      const k = (1 - smoothstep(lw * 0.3, lw, leyD)) * (lod > 1.5 ? 0.45 : 1);
      mr += 0.15 * k; mg += 0.75 * k; mb += 1.0 * k;
    }
    if (magic > 0.3 && h > 0.05) {
      const crack = n4.ridged(x * 70 + 4, y * 70, z * 70, 2);
      const k = smoothstep(0.9, 0.97, crack) * (magic - 0.3) * 1.3;
      mr += 0.2 * k; mg += 0.8 * k; mb += 1.0 * k;
      // Fae speckle: glowing flowers
      if (fine > 0) {
        const fl = n3.noise3(x * 420, y * 420, z * 420);
        if (fl > 0.62) {
          const hue = hash3(Math.floor(x * 400), Math.floor(y * 400), Math.floor(z * 400));
          const c = hue < 0.33 ? [1, 0.45, 0.85] : hue < 0.66 ? [0.55, 0.5, 1] : [0.4, 1, 0.9];
          const kk = (fl - 0.62) * 4 * fine * magic;
          r += (c[0] * 0.6 - r) * kk; g += (c[1] * 0.6 - g) * kk; b += (c[2] * 0.6 - b) * kk;
          mr += c[0] * kk * 0.25; mg += c[1] * kk * 0.25; mb += c[2] * kk * 0.25;
        }
      }
    }
    if (cursed > 0.35 && h > 0 && fine > 0) {
      const fl = n3.noise3(x * 300 + 9, y * 300, z * 300);
      if (fl > 0.7) { const kk = (fl - 0.7) * 3 * fine; mr += 0.25 * kk; mg += 0.9 * kk; mb += 0.4 * kk; }
    }

    out.r = r; out.g = g; out.b = b;
    out.rock = rock; out.snow = snow; out.lava = clamp(lava, 0, 1); out.town = town;
    out.mr = mr; out.mg = mg; out.mb = mb;
    return out;
  }
}

// Linear-space crop colors: wheat, green, plowed, barley, cabbage, flax.
const CROPS = [[0.62, 0.45, 0.10], [0.18, 0.36, 0.05], [0.20, 0.11, 0.05], [0.52, 0.42, 0.14], [0.10, 0.25, 0.08], [0.34, 0.30, 0.36]];
const CROP_AVG = [0.32, 0.30, 0.1];

// Distance in world units from unit dir (x,y,z) to the chord segment a-b.
export function segDistUnits(x, y, z, a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const ee = ex * ex + ey * ey + ez * ez;
  let t = ee > 0 ? (px * ex + py * ey + pz * ez) / ee : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = px - ex * t, qy = py - ey * t, qz = pz - ez * t;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) * R;
}
