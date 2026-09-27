// Wagons, carts and boats. Rig parts: 0 hull/body, 2-5 wheels (spin about their axle), 7 sails.

import { Kit, M, col } from './kit.js';

const WHITE = [1, 1, 1];
const WOOD = col(0x6b4a2f), DARKWOOD = col(0x3a2819), LIGHT = col(0x8f6c45), IRON = col(0x3a3d44), GOLD = col(0xd9aa4c);

function wheel(k, part, x, y, z, r) {
  k.setPart(part, [x, y, z], 0);
  k.push().at(x, y, z).rot(0, 0, Math.PI / 2);
  k.cyl(0, -0.003, 0, r, r, 0.006, 8, DARKWOOD, M.wood);
  k.pop();
  k.box(x, y - r * 0.9, z, 0.004, r * 1.8, 0.004, WOOD, M.wood);
  k.box(x, y - 0.002, z, 0.004, 0.004, r * 1.8, WOOD, M.wood);
}

function sail(k, x, y, z, w, h, colorSlot = 1) {
  k.setPart(7, [x, y, z], colorSlot);
  k.quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z + 0.01], [x - w / 2, y + h, z + 0.01], WHITE, M.cloth);
  k.quad([x + w / 2, y, z], [x - w / 2, y, z], [x - w / 2, y + h, z + 0.01], [x + w / 2, y + h, z + 0.01], WHITE, M.cloth);
}

function hull(k, L, W, H, color, deck = LIGHT) {
  k.setPart(0, [0, 0, 0], 0);
  const pts = [[0, L / 2], [W / 2, L * 0.25], [W / 2, -L * 0.4], [W * 0.3, -L / 2], [-W * 0.3, -L / 2], [-W / 2, -L * 0.4], [-W / 2, L * 0.25]];
  k.prism(pts, -H * 0.55, H, color, M.wood, deck, M.wood);
  k.prism(pts.map(p => [p[0] * 0.8, p[1] * 0.85]), -H * 0.9, H * 0.4, color, M.wood);
}

export function buildVehicle(kind) {
  const k = new Kit(true);
  if (kind === 'wagon' || kind === 'cart' || kind === 'orecart') {
    const L = kind === 'wagon' ? 0.09 : 0.06, W = 0.045, r = kind === 'wagon' ? 0.016 : 0.018;
    k.setPart(0, [0, 0, 0], 0);
    k.box(0, r + 0.004, 0, W, 0.02, L, kind === 'orecart' ? IRON : WOOD, kind === 'orecart' ? M.metal : M.wood);
    k.box(0, r + 0.004, L / 2 + 0.03, 0.004, 0.004, 0.06, DARKWOOD, M.wood);
    if (kind === 'wagon') {
      k.setPart(0, [0, 0, 0], 1);
      for (let i = 0; i < 5; i++) {
        const z = -L / 2 + (i / 4) * L;
        k.push().at(0, r + 0.024, z).rot(0, 0, 0);
        k.cyl(0, 0, 0, W * 0.55, W * 0.55, 0.004, 8, WHITE, M.cloth, { top: false });
        k.pop();
      }
      k.push().at(0, r + 0.024, 0).rot(Math.PI / 2, 0, 0);
      k.cyl(0, -L / 2, 0, W * 0.55, W * 0.55, L, 8, WHITE, M.cloth, { top: false, phase: 0 });
      k.pop();
      k.setPart(0, [0, 0, 0], 0);
      k.box(0, r + 0.02, -L / 2 + 0.01, W * 0.8, 0.02, 0.02, col(0x8a3a2a), M.wood);
    } else if (kind === 'cart') {
      k.blob(0, r + 0.034, 0, W * 0.45, 0.02, L * 0.45, col(0xc9a650), M.thatch, 0, 0.2, 3);
    } else {
      k.blob(0, r + 0.03, 0, W * 0.4, 0.014, L * 0.4, col(0x7a7f86), M.stone, 0, 0.3, 4);
      k.blob(0.008, r + 0.038, 0.01, 0.006, 0.005, 0.006, GOLD, M.gold, 0, 0.2, 5);
    }
    const ax = W / 2 + 0.004;
    if (kind === 'wagon') { wheel(k, 2, -ax, r, L * 0.3, r); wheel(k, 3, ax, r, L * 0.3, r); wheel(k, 4, -ax, r, -L * 0.3, r); wheel(k, 5, ax, r, -L * 0.3, r); }
    else { wheel(k, 2, -ax, r, 0, r); wheel(k, 3, ax, r, 0, r); }
    return k.build();
  }
  // Boats
  const S = { cog: [0.5, 0.16, 0.08], warship: [0.75, 0.22, 0.1], ghostship: [0.6, 0.18, 0.09], pirate: [0.62, 0.18, 0.09],
    fishboat: [0.2, 0.07, 0.04], rowboat: [0.1, 0.045, 0.025], canoe: [0.12, 0.03, 0.02], swanboat: [0.2, 0.07, 0.04], raft: [0.12, 0.08, 0.015] }[kind];
  const [L, W, H] = S;
  const hullCol = kind === 'ghostship' ? col(0x3a6a5a) : kind === 'pirate' ? col(0x2a1e1a) : kind === 'swanboat' ? col(0xf2f0e8) : kind === 'raft' ? LIGHT : WOOD;
  if (kind === 'raft') {
    k.setPart(0, [0, 0, 0], 0);
    for (let i = 0; i < 6; i++) k.cyl(-W / 2 + (i + 0.5) * W / 6, 0, -L / 2, 0.006, 0.006, L, 5, hullCol, M.wood);
    k.box(0, 0.006, 0, W, 0.003, 0.01, DARKWOOD, M.wood);
    return k.build();
  }
  hull(k, L, W, H, hullCol, kind === 'swanboat' ? col(0xd9c28a) : LIGHT);
  const matGhost = kind === 'ghostship' ? M.ghost : M.cloth;
  if (kind === 'swanboat') {
    k.setPart(0, [0, 0, 0], 0);
    k.push().at(0, H * 0.4, L / 2 - 0.01).rot(-0.5, 0, 0); k.cyl(0, 0, 0, 0.008, 0.006, 0.07, 6, hullCol, M.plaster); k.pop();
    k.blob(0, H * 0.4 + 0.065, L / 2 + 0.025, 0.01, 0.009, 0.016, hullCol, M.plaster, 0, 0, 2);
    k.cone(0, H * 0.4 + 0.062, L / 2 + 0.04, 0.004, 0.012, 4, GOLD, M.gold);
    sail(k, 0, H * 0.45, -0.01, 0.07, 0.08, 2);
    k.setPart(0, [0, 0, 0], 0);
    k.box(0, H * 0.45, -0.01, 0.003, 0.1, 0.003, GOLD, M.gold);
    return k.build();
  }
  if (kind === 'canoe' || kind === 'rowboat') {
    k.setPart(0, [0, 0, 0], 0);
    k.box(0, H * 0.4, 0, W * 0.8, 0.003, 0.012, DARKWOOD, M.wood);
    return k.build();
  }
  // Masts, sails, castles
  const masts = kind === 'warship' ? [0.12, -0.12] : kind === 'fishboat' ? [0.02] : [0.02];
  const mh = L * 0.95;
  for (const mz of masts) {
    k.setPart(0, [0, 0, 0], 0);
    k.box(0, H * 0.4, mz, 0.008, mh, 0.008, DARKWOOD, M.wood);
    k.box(0, H * 0.4 + mh * 0.85, mz, W * 1.1, 0.005, 0.005, DARKWOOD, M.wood);
    if (kind === 'fishboat') {
      k.setPart(7, [0, H * 0.45, mz], 1);
      k.tri([0, H * 0.45, mz], [0, H * 0.45 + mh * 0.9, mz], [0, H * 0.45, mz - L * 0.4], WHITE, M.cloth);
      k.tri([0, H * 0.45 + mh * 0.9, mz], [0, H * 0.45, mz], [0, H * 0.45, mz - L * 0.4], WHITE, M.cloth);
    } else {
      sail(k, 0, H * 0.4 + mh * 0.3, mz + 0.006, W * 1.05, mh * 0.55, 1);
      if (kind === 'warship' || kind === 'cog') {
        k.setPart(7, [0, 0, 0], 2);
        k.quad([-0.03, H * 0.4 + mh * 0.5, mz + 0.012], [0.03, H * 0.4 + mh * 0.5, mz + 0.012], [0.03, H * 0.4 + mh * 0.68, mz + 0.014], [-0.03, H * 0.4 + mh * 0.68, mz + 0.014], WHITE, M.cloth);
      }
    }
    k.setPart(0, [0, 0, 0], 2);
    k.box(0.02, H * 0.4 + mh, mz, 0.04, 0.02, 0.002, WHITE, M.cloth);
  }
  if (kind !== 'fishboat') {
    k.setPart(0, [0, 0, 0], 0);
    k.box(0, H * 0.45, -L * 0.36, W * 0.9, H * 0.7, L * 0.2, hullCol, M.wood);
    k.box(0, H * 0.45 + H * 0.7, -L * 0.36, W * 0.95, H * 0.12, L * 0.22, DARKWOOD, M.wood);
    k.box(0, H * 0.45, L * 0.34, W * 0.7, H * 0.45, L * 0.12, hullCol, M.wood);
    k.panel(0, H * 0.7, -L * 0.46 - 0.002, W * 0.3, H * 0.25, col(0xffc070), M.window, Math.PI);
    k.box(0, H * 0.3, L / 2 + 0.03, 0.006, 0.006, 0.08, DARKWOOD, M.wood);
    if (kind === 'ghostship') {
      for (let i = 0; i < 3; i++) k.blob((i - 1) * 0.04, H * 0.8, (i - 1) * 0.08, 0.012, 0.012, 0.012, col(0x6bff9a), M.ghost, 0, 0, i);
    }
    if (kind === 'warship') for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.panel(s * (W / 2 + 0.001), H * 0.1, -L * 0.2 + i * 0.09, 0.02, 0.02, col(0x1a1a1a), M.plain, s * Math.PI / 2);
  }
  return k.build();
}
