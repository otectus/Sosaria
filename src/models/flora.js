// Trees, undergrowth and far-view forest canopy clumps. Built once, instanced everywhere.

import { Kit, M, col, mulc } from './kit.js';
import { SPECIES } from '../world/scatter-gen.js';

const bark = col(0x5a3f2a), barkDark = col(0x3b2a1c), birchBark = col(0xe8e4da), silver = col(0xc9d1d6);
const leafOak = col(0x4f7f2e), leafPine = col(0x2f5a3a), leafBirch = col(0x86a83e), leafElder = col(0x62b39a);
const leafAcacia = col(0x8a9a3a), leafWillow = col(0x6f8f3e), leafJungle = col(0x2f7a32), leafPalm = col(0x4f9a3a);

function oak() {
  const k = new Kit();
  k.cyl(0, -0.04, 0, 0.022, 0.016, 0.16, 6, bark, M.bark);
  k.push().at(0, 0.1, 0).rot(0, 0, 0.7); k.cyl(0, 0, 0, 0.01, 0.006, 0.07, 5, bark, M.bark); k.pop();
  k.blob(0, 0.2, 0, 0.1, 0.08, 0.1, leafOak, M.leaf, 1, 0.15, 1, true);
  k.blob(0.06, 0.16, 0.03, 0.07, 0.06, 0.07, mulc(leafOak, 0.9), M.leaf, 1, 0.15, 2, true);
  k.blob(-0.05, 0.17, -0.04, 0.07, 0.06, 0.07, mulc(leafOak, 1.1), M.leaf, 1, 0.15, 3, true);
  return k.build();
}
function pine(snow = false) {
  const k = new Kit();
  k.cyl(0, -0.04, 0, 0.016, 0.012, 0.1, 5, barkDark, M.bark);
  const tiers = [[0.05, 0.1, 0.14], [0.12, 0.08, 0.12], [0.19, 0.06, 0.1], [0.25, 0.04, 0.09]];
  tiers.forEach(([y, r, h], i) => {
    k.cone(0, y, 0, r, h, 7, i % 2 ? mulc(leafPine, 1.08) : leafPine, M.leaf, i * 0.4);
    if (snow) k.cone(0, y + h * 0.45, 0, r * 0.62, h * 0.56, 7, col(0xeef4f8), M.plain, i * 0.4);
  });
  return k.build();
}
function birch() {
  const k = new Kit();
  k.cyl(0, -0.04, 0, 0.011, 0.008, 0.25, 5, birchBark, M.bark);
  k.blob(0, 0.2, 0, 0.06, 0.1, 0.06, leafBirch, M.leaf, 1, 0.2, 4, true);
  k.blob(0.02, 0.26, 0.01, 0.04, 0.05, 0.04, mulc(leafBirch, 1.1), M.leaf, 1, 0.2, 5, true);
  return k.build();
}
function elder() {
  const k = new Kit();
  k.cyl(0, -0.05, 0, 0.035, 0.02, 0.4, 6, silver, M.bark);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; k.push().at(0, 0.28, 0).rot(0.6 * Math.cos(a), 0, 0.6 * Math.sin(a)); k.cyl(0, 0, 0, 0.012, 0.006, 0.12, 5, silver, M.bark); k.pop(); }
  k.blob(0, 0.44, 0, 0.16, 0.1, 0.16, leafElder, M.leaf, 1, 0.12, 6, true);
  k.blob(0.08, 0.38, 0.06, 0.09, 0.06, 0.09, mulc(leafElder, 1.15), M.leaf, 1, 0.12, 7, true);
  k.blob(-0.07, 0.4, -0.06, 0.1, 0.06, 0.1, mulc(leafElder, 0.9), M.leaf, 1, 0.12, 8, true);
  for (let i = 0; i < 4; i++) { const a = i * 1.6; k.blob(Math.sin(a) * 0.12, 0.34, Math.cos(a) * 0.12, 0.008, 0.012, 0.008, col(0xa8fff0), M.glowwhite, 0, 0, i); }
  return k.build();
}
function mushroom() {
  const k = new Kit();
  k.cyl(0, -0.02, 0, 0.022, 0.018, 0.16, 7, col(0xf1e8d6), M.plaster);
  k.blob(0, 0.16, 0, 0.1, 0.05, 0.1, col(0xc0392b), M.cloth, 1, 0.05, 2, true);
  for (let i = 0; i < 5; i++) { const a = i * 1.3; k.blob(Math.sin(a) * 0.06, 0.19, Math.cos(a) * 0.06, 0.012, 0.006, 0.012, col(0xfff3c4), M.glowwhite, 0, 0, i); }
  return k.build();
}
function faetree() {
  const k = new Kit();
  k.cyl(0, -0.04, 0, 0.025, 0.012, 0.22, 6, col(0x6b5a7a), M.bark);
  k.push().at(0, 0.18, 0).rot(0, 0, -0.6); k.cyl(0, 0, 0, 0.01, 0.005, 0.1, 5, col(0x6b5a7a), M.bark); k.pop();
  k.blob(0, 0.26, 0, 0.1, 0.08, 0.1, col(0xd889c6), M.leaf, 1, 0.18, 9, true);
  k.blob(0.07, 0.23, 0.04, 0.06, 0.05, 0.06, col(0xb58ae0), M.leaf, 1, 0.18, 10, true);
  k.blob(-0.05, 0.3, -0.03, 0.05, 0.04, 0.05, col(0xf0a8d8), M.leaf, 1, 0.18, 11, true);
  for (let i = 0; i < 3; i++) k.blob(Math.sin(i * 2) * 0.08, 0.2, Math.cos(i * 2) * 0.08, 0.008, 0.008, 0.008, col(0xfff0a8), M.glowwhite, 0, 0, i);
  return k.build();
}
function acacia() {
  const k = new Kit();
  k.push().at(0, -0.04, 0).rot(0, 0, 0.18); k.cyl(0, 0, 0, 0.016, 0.01, 0.22, 5, bark, M.bark); k.pop();
  k.push().at(0.03, 0.14, 0).rot(0, 0, -0.7); k.cyl(0, 0, 0, 0.008, 0.005, 0.09, 4, bark, M.bark); k.pop();
  k.blob(0.04, 0.22, 0, 0.14, 0.03, 0.12, leafAcacia, M.leaf, 1, 0.1, 12, true);
  k.blob(-0.05, 0.2, 0.02, 0.08, 0.025, 0.07, mulc(leafAcacia, 0.9), M.leaf, 1, 0.1, 13, true);
  return k.build();
}
function charred() {
  const k = new Kit();
  k.cyl(0, -0.04, 0, 0.018, 0.008, 0.26, 5, col(0x1f1a18), M.bark);
  for (let i = 0; i < 3; i++) { const a = i * 2.2 + 0.4; k.push().at(0, 0.12 + i * 0.04, 0).rot(0.8 * Math.cos(a), 0, 0.8 * Math.sin(a)); k.cyl(0, 0, 0, 0.007, 0.002, 0.08, 4, col(0x1f1a18), M.bark); k.pop(); }
  k.blob(0, 0.08, 0.017, 0.005, 0.015, 0.003, col(0x3a0c04), M.glowwhite, 0, 0, 1);
  return k.build();
}
function dead() {
  const k = new Kit();
  const c = col(0x4a4038);
  k.cyl(0, -0.04, 0, 0.02, 0.01, 0.24, 5, c, M.bark);
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.2; k.push().at(0, 0.1 + i * 0.035, 0).rot(0.9 * Math.cos(a), 0, 0.9 * Math.sin(a)); k.cyl(0, 0, 0, 0.008, 0.002, 0.1, 4, c, M.bark); k.pop(); }
  return k.build();
}
function willow() {
  const k = new Kit();
  k.cyl(0, -0.04, 0, 0.024, 0.016, 0.18, 6, col(0x4e4636), M.bark);
  k.blob(0, 0.2, 0, 0.12, 0.07, 0.12, leafWillow, M.leaf, 1, 0.12, 14, true);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; k.cyl(Math.sin(a) * 0.1, 0.05, Math.cos(a) * 0.1, 0.012, 0.03, 0.14, 4, mulc(leafWillow, 0.85), M.leaf); }
  return k.build();
}
function jungle() {
  const k = new Kit();
  k.cyl(0, -0.04, 0, 0.025, 0.016, 0.34, 6, col(0x6a5a40), M.bark);
  k.blob(0, 0.38, 0, 0.14, 0.07, 0.14, leafJungle, M.leaf, 1, 0.15, 15, true);
  k.blob(0.06, 0.3, 0.05, 0.08, 0.05, 0.08, mulc(leafJungle, 1.15), M.leaf, 1, 0.15, 16, true);
  for (let i = 0; i < 4; i++) k.cyl(Math.sin(i * 1.6) * 0.08, 0.1, Math.cos(i * 1.6) * 0.08, 0.004, 0.004, 0.24, 3, col(0x3f5a2a), M.leaf);
  return k.build();
}
function palm() {
  const k = new Kit();
  for (let i = 0; i < 6; i++) { k.push().at(i * 0.012, i * 0.055 - 0.04, 0).rot(0, 0, -0.12); k.cyl(0, 0, 0, 0.016 - i * 0.001, 0.015 - i * 0.001, 0.058, 6, col(0x8a6e48), M.bark); k.pop(); }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    k.push().at(0.07, 0.3, 0, a).rot(0.9, 0, 0);
    k.tri([-0.02, 0, 0], [0.02, 0, 0], [0, 0, 0.16], leafPalm, M.leaf);
    k.tri([0.02, 0, 0], [-0.02, 0, 0], [0, 0, 0.16], mulc(leafPalm, 0.8), M.leaf);
    k.pop();
  }
  k.blob(0.07, 0.29, 0, 0.018, 0.018, 0.018, col(0x6a4a2a), M.plain, 0, 0, 3);
  return k.build();
}

// Undergrowth ---------------------------------------------------------------
function rock() {
  const k = new Kit();
  k.blob(0, 0.005, 0, 0.04, 0.025, 0.035, col(0x807c76), M.stone, 1, 0.3, 21);
  return k.build();
}
function bush() {
  const k = new Kit();
  k.blob(0, 0.018, 0, 0.035, 0.028, 0.035, col(0x3f6a28), M.leaf, 1, 0.2, 22, true);
  k.blob(0.02, 0.012, 0.01, 0.022, 0.02, 0.022, col(0x4a7a2e), M.leaf, 0, 0.2, 23, true);
  return k.build();
}
function grass() {
  const k = new Kit();
  const g = col(0x5b8a2e), g2 = col(0x77a03a);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + i * 0.3;
    const x = Math.sin(a) * 0.006, z = Math.cos(a) * 0.006;
    const tx = Math.sin(a) * 0.014, tz = Math.cos(a) * 0.014;
    k.tri([x - 0.003, 0, z], [x + 0.003, 0, z], [x + tx, 0.022 + (i % 3) * 0.005, z + tz], i % 2 ? g : g2, M.leaf);
    k.tri([x + 0.003, 0, z], [x - 0.003, 0, z], [x + tx, 0.022 + (i % 3) * 0.005, z + tz], i % 2 ? g : g2, M.leaf);
  }
  return k.build();
}
function flower() {
  const k = new Kit();
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1, x = Math.sin(a) * 0.008, z = Math.cos(a) * 0.008;
    k.box(x, 0, z, 0.002, 0.02, 0.002, col(0x4a7a2a), M.leaf);
    k.blob(x, 0.022, z, 0.005, 0.003, 0.005, col(0xffffff), M.cloth, 0, 0, i);
  }
  return k.build();
}
function reeds() {
  const k = new Kit();
  const c = col(0x7a8a3a);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9, x = Math.sin(a) * 0.01, z = Math.cos(a) * 0.01;
    k.tri([x - 0.002, 0, z], [x + 0.002, 0, z], [x * 1.6, 0.05 + (i % 3) * 0.008, z * 1.6], c, M.leaf);
    k.tri([x + 0.002, 0, z], [x - 0.002, 0, z], [x * 1.6, 0.05 + (i % 3) * 0.008, z * 1.6], c, M.leaf);
    if (i % 3 === 0) k.box(x * 1.5, 0.04, z * 1.5, 0.004, 0.012, 0.004, col(0x5a3a1a), M.plain);
  }
  return k.build();
}
function shroom() {
  const k = new Kit();
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.008, h = 0.008 + i * 0.003;
    k.cyl(x, 0, i * 0.004, 0.0018, 0.0015, h, 4, col(0xefe6d2), M.plaster);
    k.blob(x, h, i * 0.004, 0.006, 0.003, 0.006, col(0xb5452e), M.cloth, 0, 0, i);
  }
  return k.build();
}
function crystal() {
  const k = new Kit();
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    k.push().at(Math.sin(a) * 0.01, -0.005, Math.cos(a) * 0.01).rot(0.3 * Math.cos(a), 0, 0.3 * Math.sin(a));
    k.cyl(0, 0, 0, 0.007, 0.005, 0.03 + i * 0.008, 5, col(0x8fe8ff), M.crystal);
    k.cone(0, 0.03 + i * 0.008, 0, 0.005, 0.012, 5, col(0xc8f6ff), M.crystal);
    k.pop();
  }
  return k.build();
}
function bones() {
  const k = new Kit();
  const b = col(0xe6dcc2);
  k.blob(0, 0.008, 0, 0.012, 0.01, 0.014, b, M.plain, 0, 0.1, 1);
  for (let i = 0; i < 4; i++) { k.push().at(0.02, 0.004, -0.015 + i * 0.01).rot(0, 0, Math.PI / 2 - 0.4); k.cyl(0, -0.012, 0, 0.0018, 0.0015, 0.024, 3, b, M.plain); k.pop(); }
  return k.build();
}
function log() {
  const k = new Kit();
  k.push().at(0, 0.012, 0).rot(Math.PI / 2, 0.3, 0);
  k.cyl(0, -0.04, 0, 0.012, 0.011, 0.08, 6, bark, M.bark, { topColor: col(0xb08a5a), topMat: M.wood });
  k.pop();
  k.blob(0.02, 0.02, 0.01, 0.01, 0.005, 0.01, col(0x5f8a3a), M.leaf, 0, 0.2, 2);
  return k.build();
}
function wheat() {
  const k = new Kit();
  const c = col(0xd9b04a), c2 = col(0xc49a38);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.25, x = Math.sin(a) * 0.006, z = Math.cos(a) * 0.006;
    k.box(x, 0, z, 0.0016, 0.03, 0.0016, c2, M.plain);
    k.box(x, 0.028, z, 0.004, 0.01, 0.004, c, M.thatch);
  }
  return k.build();
}
function cabbage() {
  const k = new Kit();
  k.blob(0, 0.007, 0, 0.011, 0.008, 0.011, col(0x5a9a3a), M.leaf, 0, 0.15, 3, true);
  k.blob(0.016, 0.006, 0.004, 0.009, 0.007, 0.009, col(0x6aa84a), M.leaf, 0, 0.15, 4, true);
  return k.build();
}
function fern() {
  const k = new Kit();
  const c = col(0x3f7a32);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.push().at(0, 0, 0, a).rot(0.9, 0, 0);
    k.tri([-0.006, 0, 0], [0.006, 0, 0], [0, 0, 0.035], c, M.leaf);
    k.tri([0.006, 0, 0], [-0.006, 0, 0], [0, 0, 0.035], c, M.leaf);
    k.pop();
  }
  return k.build();
}
function clump() {
  // Forest canopy mass for far views: a lumpy dome.
  const k = new Kit();
  k.blob(0, 0.12, 0, 0.5, 0.26, 0.5, col(0xffffff), M.leaf, 1, 0.18, 31, true);
  k.blob(0.3, 0.08, 0.15, 0.3, 0.2, 0.3, col(0xe8e8e8), M.leaf, 1, 0.18, 32, true);
  k.blob(-0.25, 0.1, -0.2, 0.32, 0.22, 0.3, col(0xf0f0f0), M.leaf, 1, 0.18, 33, true);
  return k.build();
}

export const FLORA_BUILDERS = {
  [SPECIES.oak]: oak, [SPECIES.pine]: () => pine(false), [SPECIES.birch]: birch, [SPECIES.elder]: elder,
  [SPECIES.mushroom]: mushroom, [SPECIES.faetree]: faetree, [SPECIES.acacia]: acacia, [SPECIES.charred]: charred,
  [SPECIES.dead]: dead, [SPECIES.willow]: willow, [SPECIES.snowpine]: () => pine(true), [SPECIES.jungle]: jungle, [SPECIES.palm]: palm,
  [SPECIES.rock]: rock, [SPECIES.bush]: bush, [SPECIES.grass]: grass, [SPECIES.flower]: flower, [SPECIES.reeds]: reeds,
  [SPECIES.shroom]: shroom, [SPECIES.crystal]: crystal, [SPECIES.bones]: bones, [SPECIES.log]: log, [SPECIES.wheat]: wheat,
  [SPECIES.cabbage]: cabbage, [SPECIES.fern]: fern, [SPECIES.clump]: clump,
};

// Canopy clump tint by the tree species it stands for (linear rgb).
export const CLUMP_TINT = {
  [SPECIES.oak]: [0.07, 0.17, 0.03], [SPECIES.pine]: [0.03, 0.09, 0.04], [SPECIES.birch]: [0.2, 0.3, 0.05],
  [SPECIES.elder]: [0.1, 0.3, 0.22], [SPECIES.mushroom]: [0.35, 0.06, 0.05], [SPECIES.faetree]: [0.4, 0.15, 0.35],
  [SPECIES.acacia]: [0.22, 0.26, 0.05], [SPECIES.charred]: [0.03, 0.025, 0.02], [SPECIES.dead]: [0.07, 0.06, 0.04],
  [SPECIES.willow]: [0.12, 0.2, 0.05], [SPECIES.snowpine]: [0.5, 0.56, 0.6], [SPECIES.jungle]: [0.03, 0.17, 0.03],
  [SPECIES.palm]: [0.07, 0.25, 0.05],
};

const FLOWER_COLORS = [[0.9, 0.1, 0.1], [0.95, 0.8, 0.1], [0.3, 0.35, 0.95], [0.95, 0.95, 0.95], [0.85, 0.3, 0.75], [0.95, 0.5, 0.1], [0.6, 0.3, 0.95], [0.9, 0.2, 0.4]];

// Per-instance color tint (linear) from species and a variant byte.
export function floraTint(sp, v, out) {
  const j = ((v * 37) % 100) / 100;
  if (sp === SPECIES.clump) { const c = CLUMP_TINT[v] || CLUMP_TINT[SPECIES.oak]; out[0] = c[0] * 1.3; out[1] = c[1] * 1.3; out[2] = c[2] * 1.3; return out; }
  if (sp === SPECIES.flower) { const c = FLOWER_COLORS[v % 8]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
  let k = 0.82 + j * 0.36;
  out[0] = k; out[1] = k; out[2] = k;
  // A few autumn-touched deciduous trees.
  if ((sp === SPECIES.oak || sp === SPECIES.birch) && j > 0.9) { out[0] = 2.4; out[1] = 1.2; out[2] = 0.5; }
  if (sp === SPECIES.grass && v === 1) { out[0] = 1.8; out[1] = 1.5; out[2] = 1.6; return out; }
  if (sp === SPECIES.wheat) { const w = v === 3 ? [1.05, 0.95, 0.8] : [1.1, 1.0, 0.85]; out[0] = w[0]; out[1] = w[1]; out[2] = w[2]; }
  return out;
}
