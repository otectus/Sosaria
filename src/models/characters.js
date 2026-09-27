// Rigged character and creature geometry. Parts: 0 body, 1 head, 2 left arm / front-left leg / left wing,
// 3 right arm / front-right leg / right wing, 4 left leg / back-left, 5 right leg / back-right, 6 tool, 7 tail or wings.
// Color slots: 0 fixed, 1 primary cloth/fur, 2 secondary, 3 skin, 4 hair/horn.

import { Kit, M, col } from './kit.js';

export const TOOL = { none: 0, hammer: 1, hoe: 2, spear: 3, sword: 4, staff: 5, torch: 6, sack: 7, axe: 8, bow: 9, lantern: 10, rod: 11, lute: 13, pick: 14, bucket: 15 };

const WHITE = [1, 1, 1];
const DARK = col(0x1e1611), IRON = col(0x5c6068), WOOD = col(0x6b4a2f), GOLD = col(0xd9aa4c), STEEL = col(0xb8c2cc);

// Proportions per people. h: hip height, t: torso height, w: torso width, a: arm length, r: head radius.
export const RACES = {
  human: { h: 0.034, t: 0.03, w: 0.024, a: 0.03, r: 0.011, legW: 0.0085, scale: 1 },
  elf: { h: 0.04, t: 0.032, w: 0.021, a: 0.034, r: 0.0105, legW: 0.0075, scale: 1, ears: true, robe: true },
  dwarf: { h: 0.022, t: 0.028, w: 0.03, a: 0.024, r: 0.012, legW: 0.011, scale: 1, beard: true, helm: true },
  fae: { h: 0.02, t: 0.02, w: 0.016, a: 0.02, r: 0.01, legW: 0.006, scale: 1, wings: true, ears: true },
  beast: { h: 0.034, t: 0.032, w: 0.028, a: 0.032, r: 0.012, legW: 0.01, scale: 1, muzzle: true, tail: true },
  undead: { h: 0.034, t: 0.03, w: 0.02, a: 0.031, r: 0.0105, legW: 0.006, scale: 1, skeleton: true },
  draconic: { h: 0.03, t: 0.03, w: 0.024, a: 0.03, r: 0.011, legW: 0.009, scale: 1, snout: true, tail: true, horns: true },
};

function tools(k, R, sx, sy) {
  // Tools hang from the right hand at (sx, sy - arm, 0) and are gated by tool id.
  const hx = sx, hy = sy - R.a, hz = 0.004;
  const T = (id, fn) => { k.tool = id; fn(); k.tool = 0; };
  k.setPart(6, [sx, sy, 0], 0);
  T(TOOL.hammer, () => { k.box(hx, hy - 0.004, hz + 0.012, 0.003, 0.003, 0.028, WOOD, M.wood); k.box(hx, hy - 0.007, hz + 0.026, 0.008, 0.009, 0.007, IRON, M.metal); });
  T(TOOL.hoe, () => { k.box(hx, hy - 0.03, hz, 0.0025, 0.07, 0.0025, WOOD, M.wood); k.box(hx, hy + 0.036, hz + 0.006, 0.003, 0.004, 0.014, IRON, M.metal); });
  T(TOOL.spear, () => { k.box(hx, hy - 0.035, hz, 0.0025, 0.1, 0.0025, WOOD, M.wood); k.cone(hx, hy + 0.065, hz, 0.004, 0.014, 4, STEEL, M.metal); });
  T(TOOL.sword, () => { k.box(hx, hy - 0.002, hz + 0.004, 0.003, 0.003, 0.008, GOLD, M.gold); k.box(hx, hy - 0.002, hz + 0.022, 0.002, 0.005, 0.03, STEEL, M.metal); });
  T(TOOL.staff, () => { k.box(hx, hy - 0.03, hz, 0.003, 0.09, 0.003, WOOD, M.wood); k.blob(hx, hy + 0.064, hz, 0.005, 0.005, 0.005, col(0x7fe8ff), M.rune, 0, 0, 3); });
  T(TOOL.torch, () => { k.box(hx, hy - 0.008, hz + 0.004, 0.003, 0.03, 0.003, WOOD, M.wood); k.blob(hx, hy + 0.026, hz + 0.004, 0.005, 0.008, 0.005, col(0xff8a2a), M.fire, 0, 0, 2); });
  T(TOOL.sack, () => { k.blob(hx, hy - 0.006, hz + 0.008, 0.009, 0.011, 0.008, col(0xb49a6a), M.cloth, 0, 0.1, 5); });
  T(TOOL.axe, () => { k.box(hx, hy - 0.004, hz + 0.014, 0.003, 0.003, 0.03, WOOD, M.wood); k.box(hx, hy - 0.004, hz + 0.028, 0.002, 0.012, 0.008, STEEL, M.metal); });
  T(TOOL.bow, () => { k.box(hx - 0.002, hy, hz + 0.004, 0.002, 0.05, 0.003, WOOD, M.wood); });
  T(TOOL.lantern, () => { k.box(hx, hy - 0.012, hz + 0.004, 0.007, 0.009, 0.007, col(0xffc070), M.window); });
  T(TOOL.rod, () => { k.push().at(hx, hy, hz).rot(-0.9, 0, 0); k.box(0, 0, 0, 0.0015, 0.09, 0.0015, WOOD, M.wood); k.pop(); });
  T(TOOL.lute, () => { k.blob(hx - 0.006, hy + 0.004, hz + 0.01, 0.008, 0.01, 0.004, col(0xa06a36), M.wood, 0, 0, 7); k.box(hx - 0.006, hy + 0.012, hz + 0.01, 0.002, 0.018, 0.002, WOOD, M.wood); });
  T(TOOL.pick, () => { k.box(hx, hy - 0.004, hz + 0.014, 0.003, 0.003, 0.03, WOOD, M.wood); k.box(hx, hy - 0.004, hz + 0.028, 0.002, 0.004, 0.022, IRON, M.metal); });
  T(TOOL.bucket, () => { k.cyl(hx, hy - 0.016, hz + 0.004, 0.006, 0.007, 0.011, 6, WOOD, M.wood, { topColor: col(0x2a6f8f), topMat: M.water }); });
}

export function buildHumanoid(raceName) {
  const R = RACES[raceName];
  const k = new Kit(true);
  const hip = R.h, sh = R.h + R.t;
  const lx = R.w / 2 - R.legW / 2;
  // Legs
  for (const [part, sx] of [[4, -lx], [5, lx]]) {
    k.setPart(part, [sx, hip, 0], 2);
    if (R.skeleton) { k.setPart(part, [sx, hip, 0], 3); k.box(sx, 0.004, 0, R.legW * 0.6, hip - 0.004, R.legW * 0.6, WHITE, M.plain); }
    else k.box(sx, 0.006, 0, R.legW, hip - 0.006, R.legW, WHITE, M.cloth);
    k.setPart(part, [sx, hip, 0], 0);
    k.box(sx, 0, 0.002, R.legW * 1.1, 0.008, R.legW * 1.35, raceName === 'beast' || raceName === 'draconic' ? col(0x3a2a1a) : DARK, M.plain);
  }
  // Torso (tunic or robe)
  k.setPart(0, [0, hip, 0], 1);
  if (R.robe) k.cyl(0, 0.008, 0, R.w * 0.62, R.w * 0.45, R.t + hip - 0.008, 6, WHITE, M.cloth, { top: true });
  else if (R.skeleton) {
    k.setPart(0, [0, hip, 0], 3);
    k.box(0, hip, 0, R.w * 0.35, R.t, R.w * 0.3, WHITE, M.plain);
    for (let i = 0; i < 3; i++) k.box(0, hip + R.t * (0.35 + i * 0.2), 0, R.w * 0.9, 0.0025, R.w * 0.5, WHITE, M.plain);
    k.setPart(0, [0, hip, 0], 1);
    k.cyl(0, hip + R.t * 0.2, 0, R.w * 0.62, R.w * 0.5, R.t * 0.8, 5, WHITE, M.cloth, { top: false });
  } else {
    k.box(0, hip - 0.004, 0, R.w, R.t + 0.004, R.w * 0.62, WHITE, M.cloth);
    k.cyl(0, hip - 0.012, 0, R.w * 0.62, R.w * 0.58, 0.012, 6, WHITE, M.cloth, { top: false });
  }
  k.setPart(0, [0, hip, 0], 2);
  if (!R.skeleton) k.box(0, hip, 0, R.w * 1.04, 0.004, R.w * 0.66, WHITE, M.cloth);
  // Arms
  for (const [part, s] of [[2, -1], [3, 1]]) {
    const ax = s * (R.w / 2 + 0.004);
    k.setPart(part, [ax, sh - 0.003, 0], R.skeleton ? 3 : 1);
    k.box(ax, sh - R.a * 0.7, 0, 0.0065, R.a * 0.7, 0.0065, WHITE, R.skeleton ? M.plain : M.cloth);
    k.setPart(part, [ax, sh - 0.003, 0], 3);
    k.box(ax, sh - R.a, 0, 0.0055, R.a * 0.32, 0.0055, WHITE, M.skin);
    if (part === 2) {
      // Shield rides on the left arm with the sword kit.
      k.tool = TOOL.sword;
      k.setPart(2, [ax, sh - 0.003, 0], 0);
      k.box(ax - 0.004, sh - R.a * 0.85, 0.004, 0.003, 0.022, 0.018, col(0x2a4f9e), M.cloth);
      k.box(ax - 0.0055, sh - R.a * 0.85 + 0.008, 0.004, 0.001, 0.006, 0.006, GOLD, M.gold);
      k.tool = 0;
    }
  }
  tools(k, R, R.w / 2 + 0.004, sh - 0.003);
  // Head
  const hy = sh + R.r * 0.95;
  k.setPart(1, [0, sh, 0], 3);
  k.box(0, sh, 0, 0.005, 0.004, 0.005, WHITE, M.skin);
  k.blob(0, hy, 0, R.r, R.r * 1.05, R.r, WHITE, M.skin, 1, 0.04, 3, true);
  // eyes
  const eyeMat = R.skeleton ? M.ghost : M.plain;
  const eyeCol = R.skeleton ? col(0x6bff9a) : DARK;
  k.setPart(1, [0, sh, 0], 0);
  for (const s of [-1, 1]) k.box(s * R.r * 0.38, hy + R.r * 0.1, R.r * 0.9, R.r * 0.22, R.r * 0.26, 0.002, eyeCol, eyeMat);
  if (R.muzzle) { k.setPart(1, [0, sh, 0], 1); k.box(0, hy - R.r * 0.45, R.r * 0.85, R.r * 0.8, R.r * 0.6, R.r * 0.9, WHITE, M.skin); k.setPart(1, [0, sh, 0], 0); k.box(0, hy - R.r * 0.05, R.r * 1.3, R.r * 0.3, R.r * 0.2, 0.003, DARK, M.plain);
    k.setPart(1, [0, sh, 0], 1); for (const s of [-1, 1]) k.cone(s * R.r * 0.6, hy + R.r * 0.7, 0, R.r * 0.3, R.r * 0.9, 4, WHITE, M.skin); }
  if (R.snout) { k.setPart(1, [0, sh, 0], 3); k.box(0, hy - R.r * 0.5, R.r * 0.7, R.r * 0.9, R.r * 0.7, R.r * 1.3, WHITE, M.skin);
    k.setPart(1, [0, sh, 0], 4); for (const s of [-1, 1]) { k.push().at(s * R.r * 0.5, hy + R.r * 0.6, -R.r * 0.2).rot(-0.8, 0, s * 0.3); k.cone(0, 0, 0, R.r * 0.22, R.r * 1.4, 4, WHITE, M.plain); k.pop(); } }
  if (R.ears) { k.setPart(1, [0, sh, 0], 3); for (const s of [-1, 1]) { k.push().at(s * R.r * 0.95, hy + R.r * 0.2, 0).rot(0, 0, -s * 1.0); k.cone(0, 0, 0, R.r * 0.25, R.r * 1.1, 3, WHITE, M.skin); k.pop(); } }
  if (!R.skeleton && !R.snout && !R.muzzle) {
    k.setPart(1, [0, sh, 0], 4);
    k.blob(0, hy + R.r * 0.35, -R.r * 0.18, R.r * 1.05, R.r * 0.75, R.r * 1.05, WHITE, M.cloth, 1, 0.1, 5, true);
    if (raceName === 'elf') k.box(0, hy - R.r * 1.4, -R.r * 0.8, R.r * 1.4, R.r * 2.0, R.r * 0.4, WHITE, M.cloth);
  }
  if (R.beard) { k.setPart(1, [0, sh, 0], 4); k.cone(0, hy - R.r * 0.3, R.r * 0.55, R.r * 0.85, -R.r * 2.1, 5, WHITE, M.cloth); }
  if (R.helm) { k.setPart(1, [0, sh, 0], 0); k.blob(0, hy + R.r * 0.45, 0, R.r * 1.08, R.r * 0.7, R.r * 1.08, IRON, M.metal, 1, 0.02, 7); for (const s of [-1, 1]) { k.push().at(s * R.r, hy + R.r * 0.6, 0).rot(0, 0, -s * 0.9); k.cone(0, 0, 0, R.r * 0.25, R.r * 0.9, 4, col(0xe8dcc0), M.plain); k.pop(); } }
  if (R.horns) { k.setPart(1, [0, sh, 0], 4); for (const s of [-1, 1]) { k.push().at(s * R.r * 0.6, hy + R.r * 0.7, -R.r * 0.3).rot(-0.9, 0, s * 0.25); k.cone(0, 0, 0, R.r * 0.25, R.r * 1.3, 4, WHITE, M.plain); k.pop(); } }
  // Tail or wings
  if (R.tail) {
    k.setPart(7, [0, hip, -R.w * 0.3], raceName === 'draconic' ? 3 : 1);
    k.push().at(0, hip, -R.w * 0.3).rot(-2.2, 0, 0);
    k.cone(0, 0, 0, raceName === 'draconic' ? 0.006 : 0.005, raceName === 'draconic' ? 0.04 : 0.028, 5, WHITE, M.cloth);
    k.pop();
  }
  if (R.wings) {
    for (const s of [-1, 1]) {
      k.setPart(7, [s * 0.003, sh - 0.006, -R.w * 0.3], 0);
      k.tri([s * 0.003, sh - 0.004, -R.w * 0.3], [s * 0.03, sh + 0.016, -R.w * 0.36], [s * 0.022, sh - 0.022, -R.w * 0.34], col(0xbff6ff), M.crystal);
      k.tri([s * 0.003, sh - 0.004, -R.w * 0.3], [s * 0.022, sh - 0.022, -R.w * 0.34], [s * 0.03, sh + 0.016, -R.w * 0.36], col(0xbff6ff), M.crystal);
    }
  }
  const g = k.build();
  g.userData.hip = hip;
  return g;
}

// ---------------- Quadrupeds ----------------
// Front faces +z. L: body length, H: leg length, W: body width, neck: neck length, head: head size.
export const BEASTS = {
  horse: { L: 0.07, H: 0.045, W: 0.026, D: 0.032, neck: 0.03, head: 0.012, tail: 0.03, mane: true },
  deer: { L: 0.05, H: 0.04, W: 0.018, D: 0.022, neck: 0.03, head: 0.009, tail: 0.008, antlers: true },
  sheep: { L: 0.04, H: 0.018, W: 0.026, D: 0.026, neck: 0.01, head: 0.009, tail: 0.006, wool: true },
  cow: { L: 0.06, H: 0.026, W: 0.032, D: 0.034, neck: 0.012, head: 0.012, tail: 0.02, horns: true },
  wolf: { L: 0.05, H: 0.026, W: 0.018, D: 0.022, neck: 0.014, head: 0.011, tail: 0.028, ears: true, snout: true },
  boar: { L: 0.048, H: 0.018, W: 0.026, D: 0.028, neck: 0.006, head: 0.013, tail: 0.008, tusks: true, snout: true },
  makka: { L: 0.11, H: 0.04, W: 0.06, D: 0.06, neck: 0.012, head: 0.022, tail: 0.02, horns: true, hump: true },
  bear: { L: 0.07, H: 0.03, W: 0.04, D: 0.045, neck: 0.01, head: 0.018, tail: 0.006, ears: true, snout: true },
  mammoth: { L: 0.14, H: 0.07, W: 0.08, D: 0.09, neck: 0.01, head: 0.035, tail: 0.02, tusks: true, trunk: true, wool: true },
  unicorn: { L: 0.07, H: 0.047, W: 0.024, D: 0.03, neck: 0.03, head: 0.012, tail: 0.032, mane: true, horn: true },
  tortoise: { L: 0.9, H: 0.18, W: 0.7, D: 0.3, neck: 0.25, head: 0.14, tail: 0.1, shell: true },
  goat: { L: 0.035, H: 0.024, W: 0.016, D: 0.02, neck: 0.015, head: 0.008, tail: 0.006, horns: true },
};

export function buildQuadruped(name) {
  const B = BEASTS[name];
  const k = new Kit(true);
  const bodyY = B.H + B.D * 0.5;
  // Legs at the four corners
  const lz = B.L * 0.36, lx = B.W * 0.36;
  const legs = [[2, -lx, lz], [3, lx, lz], [4, -lx, -lz], [5, lx, -lz]];
  for (const [part, x, z] of legs) {
    k.setPart(part, [x, B.H + 0.004, z], 1);
    k.box(x, 0.006, z, B.W * 0.2, B.H, B.W * 0.2, WHITE, M.skin);
    k.setPart(part, [x, B.H + 0.004, z], 0);
    k.box(x, 0, z, B.W * 0.22, 0.007, B.W * 0.24, name === 'tortoise' ? col(0x6a6a4a) : DARK, M.plain);
  }
  // Body
  k.setPart(0, [0, bodyY, 0], 1);
  if (B.shell) {
    k.blob(0, bodyY, 0, B.W * 0.55, B.D * 0.35, B.L * 0.36, WHITE, M.skin, 1, 0.05, 2, true);
    k.setPart(0, [0, bodyY, 0], 2);
    k.blob(0, bodyY + B.D * 0.25, 0, B.W * 0.62, B.D * 0.75, B.L * 0.48, WHITE, M.stone, 1, 0.08, 3);
    // A shrine on its back
    k.setPart(0, [0, bodyY, 0], 0);
    const top = bodyY + B.D * 0.95;
    k.box(0, top, 0, 0.26, 0.02, 0.26, col(0x9a9387), M.stone);
    for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) k.cyl(x, top + 0.02, z, 0.012, 0.012, 0.14, 6, col(0xe4dccb), M.stone);
    k.pyramid(0, top + 0.16, 0, 0.3, 0.1, 0.3, col(0x2c7a8a), M.tile, 0.02);
    k.blob(0, top + 0.07, 0, 0.03, 0.04, 0.03, col(0x7fe8ff), M.rune, 1, 0, 3);
    k.box(0.12, top + 0.02, 0.0, 0.006, 0.2, 0.006, WOOD, M.wood);
    k.box(0.15, top + 0.16, 0, 0.06, 0.04, 0.003, col(0xb3342a), M.cloth);
  } else {
    k.blob(0, bodyY, 0, B.W * 0.5, B.D * 0.5, B.L * 0.52, WHITE, B.wool ? M.cloth : M.skin, 1, B.wool ? 0.2 : 0.06, 2, true);
    if (B.hump) k.blob(0, bodyY + B.D * 0.35, B.L * 0.18, B.W * 0.4, B.D * 0.35, B.L * 0.25, WHITE, M.cloth, 1, 0.15, 4, true);
  }
  // Head and neck
  const nz = B.L * 0.48, ny = bodyY + B.D * 0.15;
  k.setPart(1, [0, ny, nz], 1);
  const neckTop = [0, ny + B.neck * 0.7, nz + B.neck * 0.5];
  if (B.neck > 0.012) {
    k.push().at(0, ny, nz).rot(0.75, 0, 0);
    k.cyl(0, 0, 0, B.W * 0.2, B.W * 0.16, B.neck, 6, WHITE, M.skin);
    k.pop();
  }
  const hx = neckTop[0], hy = B.neck > 0.012 ? neckTop[1] : ny, hz = B.neck > 0.012 ? neckTop[2] : nz + B.head * 0.5;
  k.blob(hx, hy, hz + B.head * 0.3, B.head * 0.7, B.head * 0.75, B.head * (B.snout ? 1.2 : 1.1), WHITE, M.skin, 1, 0.05, 5, true);
  k.setPart(1, [0, ny, nz], 0);
  for (const s of [-1, 1]) k.box(hx + s * B.head * 0.45, hy + B.head * 0.2, hz + B.head * 0.8, B.head * 0.2, B.head * 0.2, 0.002, DARK, M.plain);
  if (B.snout) k.box(hx, hy - B.head * 0.1, hz + B.head * 1.45, B.head * 0.3, B.head * 0.25, 0.003, DARK, M.plain);
  if (B.ears) { k.setPart(1, [0, ny, nz], 1); for (const s of [-1, 1]) k.cone(hx + s * B.head * 0.45, hy + B.head * 0.55, hz, B.head * 0.25, B.head * 0.6, 4, WHITE, M.skin); }
  if (B.horns) { k.setPart(1, [0, ny, nz], 4); for (const s of [-1, 1]) { k.push().at(hx + s * B.head * 0.5, hy + B.head * 0.6, hz).rot(0.3, 0, -s * 1.1); k.cone(0, 0, 0, B.head * 0.18, B.head * 0.9, 4, WHITE, M.plain); k.pop(); } }
  if (B.antlers) { k.setPart(1, [0, ny, nz], 4); for (const s of [-1, 1]) { k.push().at(hx + s * B.head * 0.3, hy + B.head * 0.6, hz).rot(-0.2, 0, -s * 0.5); k.box(0, 0, 0, 0.0016, B.head * 1.8, 0.0016, WHITE, M.wood); k.box(0, B.head * 1.1, B.head * 0.3, 0.0015, 0.0015, B.head * 0.8, WHITE, M.wood); k.box(s * B.head * 0.4, B.head * 1.5, 0, B.head * 0.8, 0.0015, 0.0015, WHITE, M.wood); k.pop(); } }
  if (B.tusks) { k.setPart(1, [0, ny, nz], 0); for (const s of [-1, 1]) { k.push().at(hx + s * B.head * 0.35, hy - B.head * 0.3, hz + B.head * 0.9).rot(-0.6, 0, 0); k.cone(0, 0, 0, B.head * 0.1, B.head * (name === 'mammoth' ? 1.8 : 0.6), 4, col(0xf1e8d6), M.plain); k.pop(); } }
  if (B.trunk) { k.setPart(1, [0, ny, nz], 1); k.push().at(hx, hy - B.head * 0.2, hz + B.head * 0.9).rot(2.6, 0, 0); k.cyl(0, 0, 0, B.head * 0.2, B.head * 0.12, B.head * 1.6, 5, WHITE, M.skin); k.pop(); }
  if (B.horn) { k.setPart(1, [0, ny, nz], 0); k.push().at(hx, hy + B.head * 0.6, hz + B.head * 0.5).rot(0.6, 0, 0); k.cone(0, 0, 0, B.head * 0.12, B.head * 1.4, 5, col(0xfff0b8), M.gold); k.pop(); }
  if (B.mane) { k.setPart(1, [0, ny, nz], 4); k.push().at(0, ny + 0.004, nz - 0.002).rot(0.75, 0, 0); k.box(0, 0, -B.W * 0.12, 0.004, B.neck * 1.05, B.W * 0.12, WHITE, M.cloth); k.pop(); }
  // Tail
  k.setPart(7, [0, bodyY + B.D * 0.1, -B.L * 0.5], B.mane ? 4 : 1);
  k.push().at(0, bodyY + B.D * 0.1, -B.L * 0.5).rot(-2.5, 0, 0);
  k.cone(0, 0, 0, B.W * 0.12, B.tail, 4, WHITE, M.cloth);
  k.pop();
  const g = k.build();
  g.userData.hip = B.H;
  return g;
}

export function buildSpider(size = 1) {
  const k = new Kit(true);
  const s = 0.04 * size;
  k.setPart(0, [0, s * 0.6, 0], 1);
  k.blob(0, s * 0.7, -s * 0.6, s * 0.7, s * 0.55, s * 0.8, WHITE, M.skin, 1, 0.08, 1, true);
  k.blob(0, s * 0.6, s * 0.35, s * 0.4, s * 0.35, s * 0.45, WHITE, M.skin, 1, 0.05, 2, true);
  k.setPart(0, [0, s * 0.6, 0], 0);
  for (let i = 0; i < 4; i++) k.box((i - 1.5) * s * 0.12, s * 0.72, s * 0.78, s * 0.08, s * 0.08, 0.002, col(0xff3a2a), M.fire);
  k.setPart(0, [0, s * 0.6, 0], 4);
  k.blob(0, s * 1.05, -s * 0.7, s * 0.25, s * 0.08, s * 0.3, WHITE, M.plain, 0, 0.1, 3);
  const parts = [2, 3, 4, 5];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, j = i % 4;
    const part = side < 0 ? (j % 2 === 0 ? 2 : 4) : (j % 2 === 0 ? 3 : 5);
    const z = s * (0.45 - j * 0.3);
    k.setPart(part, [side * s * 0.3, s * 0.6, z], 2);
    k.push().at(side * s * 0.3, s * 0.6, z).rot(0, side * (0.4 - j * 0.3), -side * 0.9);
    k.box(0, -s * 1.1, 0, s * 0.08, s * 1.1, s * 0.08, WHITE, M.skin);
    k.pop();
  }
  return k.build();
}

// Flying creature: body, two wings (parts 2, 3), tail (7). Used for birds, wyverns, griffins and bats.
export function buildFlyer(kind) {
  const k = new Kit(true);
  if (kind === 'bird') {
    k.setPart(0, [0, 0, 0], 1);
    k.blob(0, 0, 0, 0.004, 0.004, 0.009, WHITE, M.cloth, 0, 0, 1, true);
    for (const [part, s] of [[2, -1], [3, 1]]) {
      k.setPart(part, [s * 0.002, 0, 0], 1);
      k.tri([s * 0.002, 0, 0.004], [s * 0.02, 0.001, -0.002], [s * 0.002, 0, -0.005], WHITE, M.cloth);
      k.tri([s * 0.002, 0, 0.004], [s * 0.002, 0, -0.005], [s * 0.02, 0.001, -0.002], WHITE, M.cloth);
    }
    k.setPart(7, [0, 0, -0.008], 2);
    k.tri([-0.003, 0, -0.008], [0.003, 0, -0.008], [0, 0, -0.015], WHITE, M.cloth);
    k.tri([0.003, 0, -0.008], [-0.003, 0, -0.008], [0, 0, -0.015], WHITE, M.cloth);
    return k.build();
  }
  // wyvern / griffin: bigger, with head and legs
  const S = kind === 'griffin' ? 0.12 : 0.16;
  k.setPart(0, [0, 0, 0], 1);
  k.blob(0, 0, 0, S * 0.18, S * 0.17, S * 0.45, WHITE, M.skin, 1, 0.08, 3, true);
  k.setPart(1, [0, 0.0, S * 0.4], kind === 'griffin' ? 2 : 1);
  k.push().at(0, 0.0, S * 0.4).rot(-0.3, 0, 0);
  k.cyl(0, 0, 0, S * 0.08, S * 0.06, S * 0.3, 5, WHITE, M.skin);
  k.pop();
  k.blob(0, S * 0.1, S * 0.72, S * 0.1, S * 0.09, S * 0.16, WHITE, M.skin, 1, 0.05, 4, true);
  k.setPart(1, [0, 0.0, S * 0.4], 4);
  k.cone(0, S * 0.08, S * 0.88, S * 0.04, S * 0.12, 4, WHITE, M.plain);
  for (const [part, s] of [[2, -1], [3, 1]]) {
    k.setPart(part, [s * S * 0.12, S * 0.05, S * 0.05], 2);
    k.tri([s * S * 0.12, S * 0.05, S * 0.2], [s * S * 1.2, S * 0.1, -S * 0.05], [s * S * 0.12, S * 0.05, -S * 0.3], WHITE, M.cloth);
    k.tri([s * S * 0.12, S * 0.05, S * 0.2], [s * S * 0.12, S * 0.05, -S * 0.3], [s * S * 1.2, S * 0.1, -S * 0.05], WHITE, M.cloth);
    k.tri([s * S * 1.2, S * 0.1, -S * 0.05], [s * S * 0.6, S * 0.06, -S * 0.45], [s * S * 0.12, S * 0.05, -S * 0.3], WHITE, M.cloth);
    k.tri([s * S * 1.2, S * 0.1, -S * 0.05], [s * S * 0.12, S * 0.05, -S * 0.3], [s * S * 0.6, S * 0.06, -S * 0.45], WHITE, M.cloth);
  }
  k.setPart(7, [0, 0, -S * 0.4], 1);
  k.push().at(0, 0, -S * 0.4).rot(-Math.PI / 2 - 0.1, 0, 0);
  k.cone(0, 0, 0, S * 0.07, S * 0.7, 4, WHITE, M.skin);
  k.pop();
  k.setPart(0, [0, 0, 0], 0);
  for (const s of [-1, 1]) k.box(s * S * 0.08, -S * 0.2, 0.0, S * 0.04, S * 0.12, S * 0.04, DARK, M.plain);
  return k.build();
}

// Sea serpent: a long segmented body along z; the shader waves it.
export function buildSerpent() {
  const k = new Kit(true);
  const n = 16, L = 1.6;
  k.setPart(0, [0, 0, 0], 1);
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + (i / n) * L;
    const r = 0.06 * Math.sin(Math.PI * (0.15 + 0.85 * i / n));
    k.blob(0, 0, z, r, r, L / n * 0.8, WHITE, M.skin, 1, 0.04, i, true);
    k.setPart(0, [0, 0, 0], 2);
    k.cone(0, r * 0.8, z, r * 0.4, r * 0.9, 4, WHITE, M.plain);
    k.setPart(0, [0, 0, 0], 1);
  }
  k.blob(0, 0.02, L / 2 + 0.06, 0.07, 0.06, 0.1, WHITE, M.skin, 1, 0.05, 30, true);
  k.setPart(0, [0, 0, 0], 0);
  for (const s of [-1, 1]) k.box(s * 0.04, 0.05, L / 2 + 0.1, 0.012, 0.012, 0.003, col(0xffd040), M.fire);
  return k.build();
}

// Treant: a walking tree (humanoid proportions, bark and leaves).
export function buildTreant() {
  const k = new Kit(true);
  const bark = col(0x5a3f2a), leaf = col(0x4f7f2e);
  for (const [part, sx] of [[4, -0.03], [5, 0.03]]) { k.setPart(part, [sx, 0.12, 0], 0); k.cyl(sx, 0, 0, 0.025, 0.02, 0.12, 5, bark, M.bark); }
  k.setPart(0, [0, 0.12, 0], 0);
  k.cyl(0, 0.1, 0, 0.05, 0.04, 0.2, 6, bark, M.bark);
  for (const [part, s] of [[2, -1], [3, 1]]) { k.setPart(part, [s * 0.05, 0.28, 0], 0); k.push().at(s * 0.05, 0.28, 0).rot(0, 0, s * 0.3); k.cyl(0, -0.16, 0, 0.012, 0.018, 0.16, 5, bark, M.bark); k.pop(); }
  k.setPart(1, [0, 0.3, 0], 0);
  k.blob(0, 0.38, 0, 0.12, 0.1, 0.12, leaf, M.leaf, 1, 0.15, 3, true);
  k.blob(0.06, 0.34, 0.05, 0.07, 0.06, 0.07, leaf, M.leaf, 1, 0.15, 4, true);
  for (const s of [-1, 1]) k.box(s * 0.02, 0.26, 0.042, 0.01, 0.006, 0.002, col(0xffe070), M.glowwhite);
  const g = k.build();
  g.userData.hip = 0.12;
  return g;
}
