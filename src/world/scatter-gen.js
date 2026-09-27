// Deterministic vegetation / rock scatter for one cube-grid cell. Runs in terrain workers.

import { cellCenterDir, faceUVToDir, PLANET_RADIUS } from '../core/sphere.js';
import { mulberry32, hash1, smoothstep } from '../core/noise.js';
import { INFO_SIZE, I_H, I_PADD, I_PADI, I_ROADD, I_ROADW, I_RIVD, I_RIVW, I_LAKED, I_MOUNT, I_VOLC } from './field.js';

const R = PLANET_RADIUS;

export const SPECIES = {
  oak: 0, pine: 1, birch: 2, elder: 3, mushroom: 4, faetree: 5, acacia: 6, charred: 7, dead: 8, willow: 9,
  snowpine: 10, jungle: 11, palm: 12,
  rock: 20, bush: 21, grass: 22, flower: 23, reeds: 24, shroom: 25, crystal: 26, bones: 27, log: 28,
  wheat: 29, cabbage: 30, fern: 31,
  clump: 40,
};

// Layers: grid resolution per face and candidate spacing (world units).
export const LAYERS = {
  trees: { G: 96, spacing: 0.24 },
  detail: { G: 384, spacing: 0.085 },
  canopy: { G: 24, spacing: 0.82 },
};

const info = new Float64Array(INFO_SIZE);

function pickSpecies(field, rnd) {
  const W = field.regionW, regs = field.regions;
  let r = rnd(), idx = 0;
  for (let i = 0; i < regs.length; i++) { r -= W[i]; if (r <= 0) { idx = i; break; } }
  const trees = regs[idx].trees;
  let t = rnd(), tot = 0;
  for (const k in trees) tot += trees[k];
  t *= tot;
  for (const k in trees) { t -= trees[k]; if (t <= 0) return SPECIES[k]; }
  return SPECIES.oak;
}

// Estimate slope from 2 extra height samples.
function slopeAt(field, d, h, step) {
  const e = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  // tangent vectors
  let tx = e[1] * d[2] - e[2] * d[1], ty = e[2] * d[0] - e[0] * d[2], tz = e[0] * d[1] - e[1] * d[0];
  let tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
  const bx = d[1] * tz - d[2] * ty, by = d[2] * tx - d[0] * tz, bz = d[0] * ty - d[1] * tx;
  const s = step / R;
  let px = d[0] + tx * s, py = d[1] + ty * s, pz = d[2] + tz * s; let pl = Math.hypot(px, py, pz);
  const h1 = field.height(px / pl, py / pl, pz / pl, 0);
  px = d[0] + bx * s; py = d[1] + by * s; pz = d[2] + bz * s; pl = Math.hypot(px, py, pz);
  const h2 = field.height(px / pl, py / pl, pz / pl, 0);
  const g = Math.hypot(h1 - h, h2 - h) / step;
  return Math.min(1, g * 0.9);
}

export function buildScatterCell(field, cell, G, layer) {
  const L = LAYERS[layer];
  const f = Math.floor(cell / (G * G));
  const rem = cell - f * G * G;
  const cj = Math.floor(rem / G), ci = rem - cj * G;
  const rnd = mulberry32((cell * 2654435761 + (layer === 'trees' ? 1 : layer === 'detail' ? 2 : 3)) >>> 0);
  const cellLen = (Math.PI / 2 * R) / G;
  const n = Math.max(1, Math.round(cellLen / L.spacing));
  const out = [];
  const d = [0, 0, 0];
  const fo = { fu: 0, fv: 0, row: 0 };

  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      const u = ((ci + (a + 0.15 + rnd() * 0.7) / n) / G) * 2 - 1;
      const v = ((cj + (b + 0.15 + rnd() * 0.7) / n) / G) * 2 - 1;
      faceUVToDir(f, u, v, d);
      const roll = rnd(), roll2 = rnd(), roll3 = rnd();
      const h = field.heightInfo(d[0], d[1], d[2], 0, info);
      if (h < 0.03 && layer !== 'detail') continue;
      const onRoad = info[I_ROADD] - Math.abs(info[I_ROADW]) < 0.06;
      const nearRiver = info[I_RIVD] - info[I_RIVW];
      const padD = info[I_PADD];
      if (layer === 'canopy') {
        const slope = 0.15;
        const fr = field.forest(d[0], d[1], d[2], info, slope);
        if (fr < 0.35 || roll > fr * 1.1) continue;
        field.regionWeights(d[0], d[1], d[2]);
        const sp = pickSpecies(field, rnd);
        push(out, d, h - 0.05, roll2 * 6.283, 0.75 + roll3 * 0.5, SPECIES.clump, sp);
        continue;
      }
      if (onRoad) continue;
      if (padD < 0.95 && (layer !== 'detail' || padD < 0.35 || roll > 0.35)) continue;
      const slope = slopeAt(field, d, h, L.spacing * 0.8);
      if (layer === 'trees') {
        if (nearRiver < 0.05 || info[I_LAKED] < 0.02) continue;
        const fr = field.forest(d[0], d[1], d[2], info, slope);
        let p = fr * 0.92;
        let hedge = false;
        if (fr < 0.2) {
          const crop = field.farm(d[0], d[1], d[2], info, slope, fo);
          if (crop >= 0) {
            const edge = Math.min(fo.fu, 1 - fo.fu, fo.fv * 0.66, (1 - fo.fv) * 0.66);
            if (edge < 0.06) { p = 0.32; hedge = true; } else p = 0;
          } else {
            p = Math.max(p, 0.028 * smoothstep(0.1, 0.35, h) * (1 - smoothstep(0.35, 0.6, slope)));
          }
        }
        if (h > 0.03 && h < 0.12) p *= 0.3;
        if (roll > p) continue;
        field.regionWeights(d[0], d[1], d[2]);
        let sp = pickSpecies(field, rnd);
        const cold = field.regionProp('cold');
        if (h > 3.0 && sp !== SPECIES.snowpine && sp !== SPECIES.dead) sp = cold > 0.3 || h > 3.6 ? SPECIES.snowpine : SPECIES.pine;
        if (hedge && (sp === SPECIES.pine || sp === SPECIES.snowpine)) sp = SPECIES.oak;
        if (field.regionProp('marsh') > 0.4 && nearRiver < 1.0 && roll2 < 0.5) sp = SPECIES.willow;
        const s = (0.75 + roll3 * 0.55) * (fr > 0.6 ? 1.12 : 1);
        push(out, d, h, roll2 * 6.283, s, sp, Math.floor(roll3 * 255));
      } else {
        // detail layer
        const crop = field.farm(d[0], d[1], d[2], info, slope, fo);
        if (h < 0.0) {
          if (h > -0.35 && roll < 0.05) push(out, d, h, roll2 * 6.28, 0.4 + roll3 * 0.8, SPECIES.rock, 0);
          continue;
        }
        if (crop >= 0) {
          const edge = Math.min(fo.fu, 1 - fo.fu, fo.fv * 0.66, (1 - fo.fv) * 0.66);
          if (edge < 0.05) { if (roll < 0.5) push(out, d, h, roll2 * 6.28, 0.7 + roll3 * 0.5, SPECIES.bush, 0); continue; }
          if (crop === 0 || crop === 3) { if (roll < 0.85) push(out, d, h, roll2 * 6.28, 0.8 + roll3 * 0.4, SPECIES.wheat, crop); }
          else if (crop === 1 || crop === 4) { if (roll < 0.7) push(out, d, h, roll2 * 6.28, 0.8 + roll3 * 0.4, SPECIES.cabbage, crop); }
          continue;
        }
        if (nearRiver < 0.18 && nearRiver > -0.02) { if (roll < 0.55) push(out, d, h, roll2 * 6.28, 0.7 + roll3 * 0.6, SPECIES.reeds, 0); continue; }
        if (info[I_LAKED] > -0.05 && info[I_LAKED] < 0.12) { if (roll < 0.5) push(out, d, h, roll2 * 6.28, 0.7 + roll3 * 0.6, SPECIES.reeds, 0); continue; }
        if (padD < 0.95) {
          // Inside settlements: only a little grass and a few flowers.
          if (roll < 0.08) push(out, d, h, roll2 * 6.28, 0.6 + roll3 * 0.5, SPECIES.flower, Math.floor(roll3 * 8));
          else push(out, d, h, roll2 * 6.28, 0.5 + roll3 * 0.6, SPECIES.grass, 0);
          continue;
        }
        field.regionWeights(d[0], d[1], d[2]);
        const fr = field.forest(d[0], d[1], d[2], info, slope);
        const magic = field.regionProp('magic');
        const cursed = field.regionProp('cursed');
        const cold = field.regionProp('cold');
        const snowy = h > 4.2 - cold * 3.8;
        const rocky = Math.max(slope * 1.3, info[I_MOUNT]);
        if (roll < rocky * 0.22 + 0.012) { push(out, d, h, roll2 * 6.28, 0.35 + roll3 * roll3 * 1.6, SPECIES.rock, 0); continue; }
        if (magic > 0.4 && roll < 0.05 + (magic - 0.4) * 0.05) { push(out, d, h, roll2 * 6.28, 0.6 + roll3 * 0.8, SPECIES.crystal, magic > 0.8 ? 1 : 0); continue; }
        if (snowy || h < 0.1) continue;
        if (cold > 0.45) {
          // Tundra: sparse frosted grass and stones only.
          if (roll < 0.03) push(out, d, h, roll2 * 6.28, 0.3 + roll3 * 0.8, SPECIES.rock, 0);
          else if (roll < 0.14) push(out, d, h, roll2 * 6.28, 0.5 + roll3 * 0.5, SPECIES.grass, 1);
          continue;
        }
        if (fr > 0.4) {
          if (roll < 0.12) push(out, d, h, roll2 * 6.28, 0.6 + roll3 * 0.6, SPECIES.fern, 0);
          else if (roll < 0.17) push(out, d, h, roll2 * 6.28, 0.6 + roll3 * 0.7, SPECIES.shroom, magic > 0.3 ? 1 : 0);
          else if (roll < 0.2) push(out, d, h, roll2 * 6.28, 0.7 + roll3 * 0.6, SPECIES.log, 0);
          else if (roll < 0.3) push(out, d, h, roll2 * 6.28, 0.6 + roll3 * 0.6, SPECIES.bush, 0);
          continue;
        }
        if ((cursed > 0.3 || field.regionProp('mesa') > 0.3) && roll < 0.01) { push(out, d, h, roll2 * 6.28, 0.7 + roll3 * 0.5, SPECIES.bones, 0); continue; }
        if (roll < 0.035) { push(out, d, h, roll2 * 6.28, 0.6 + roll3 * 0.7, SPECIES.bush, 0); continue; }
        const flowerP = 0.05 + magic * 0.18;
        if (roll < 0.035 + flowerP) { push(out, d, h, roll2 * 6.28, 0.7 + roll3 * 0.5, SPECIES.flower, Math.floor(roll3 * 8)); continue; }
        if (roll < 0.62) push(out, d, h, roll2 * 6.28, 0.6 + roll3 * 0.8, SPECIES.grass, 0);
      }
    }
  }

  // Pack: per instance x,y,z (relative to cell center), yaw, scale, species, variant
  const cdir = cellCenterDir(cell, G);
  const cx = cdir[0] * R, cy = cdir[1] * R, cz = cdir[2] * R;
  const cnt = out.length / 7;
  const data = new Float32Array(cnt * 7);
  for (let i = 0; i < cnt; i++) {
    data[i * 7] = out[i * 7] - cx; data[i * 7 + 1] = out[i * 7 + 1] - cy; data[i * 7 + 2] = out[i * 7 + 2] - cz;
    data[i * 7 + 3] = out[i * 7 + 3]; data[i * 7 + 4] = out[i * 7 + 4]; data[i * 7 + 5] = out[i * 7 + 5]; data[i * 7 + 6] = out[i * 7 + 6];
  }
  return { center: [cx, cy, cz], data, count: cnt, transfer: [data.buffer] };
}

function push(out, d, h, yaw, s, sp, variant) {
  const r = R + h;
  out.push(d[0] * r, d[1] * r, d[2] * r, yaw, s, sp, variant);
}
