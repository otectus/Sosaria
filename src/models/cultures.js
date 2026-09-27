// Architecture of the elder races and strange peoples, plus ruins and landmark monuments.

import { Kit, M, col, mulc } from './kit.js';
import { defineModel } from './registry.js';
import { P } from './human.js';
import { mulberry32 } from '../core/noise.js';

const C = {
  marble: col(0xe9ecef), marbleWarm: col(0xe4dccb), elfRoof: col(0x2c7a8a), elfTrim: col(0xc9b16a), rune: col(0x6fe8ff),
  silverBark: col(0xc8cfd2), elfLeaf: col(0x5aa38c),
  dwarfStone: col(0x6d6760), dwarfDark: col(0x4a4541), dwarfGold: col(0xc79a3c), dwarfRoof: col(0x3b3f47),
  capRed: col(0xc0392b), capViolet: col(0x8e5bd6), capBlue: col(0x3d7fd1), stem: col(0xefe6d2), petal: col(0xf2a0d6),
  hide: col(0xa98458), hide2: col(0x8d6a45), bone: col(0xe8dcc0), totem: col(0x7a5234), paint: col(0xb3342a),
  obsidian: col(0x1e1a22), obsidian2: col(0x2d2733), dracRed: col(0x9c2320), dracGold: col(0xd8a13a), basalt: col(0x3a3533),
  grave: col(0x77797a), crypt: col(0x5b5d5f), ghost: col(0x7dffb0), rot: col(0x4a4a3c),
  ice: col(0xbfe6ff), reed: col(0x9c8a52), jungle: col(0x5d6e4a), moss: col(0x4f6b35),
};

// ---------------- Elves ----------------
defineModel('elf_spire', a => {
  const k = new Kit();
  k.cyl(0, -0.12, 0, 0.1, 0.1, 0.14, 8, C.marbleWarm, M.stone);
  k.cyl(0, 0.02, 0, 0.075, 0.045, 0.62, 8, C.marble, M.plaster, { top: false });
  for (const y of [0.2, 0.42]) {
    k.cyl(0, y, 0, 0.1, 0.1, 0.012, 8, C.elfTrim, M.gold);
    k.cyl(0, y + 0.012, 0, 0.095, 0.095, 0.004, 8, C.rune, M.rune, { top: false });
  }
  // balcony and blue cone roof
  k.cyl(0, 0.64, 0, 0.07, 0.07, 0.05, 8, C.marble, M.plaster, { top: false });
  k.cone(0, 0.69, 0, 0.085, 0.3, 8, C.elfRoof, M.tile);
  k.box(0, 0.99, 0, 0.005, 0.08, 0.005, C.elfTrim, M.gold);
  for (let i = 0; i < 4; i++) {
    const an = (i / 4) * Math.PI * 2;
    k.push().at(Math.sin(an) * 0.068, 0, Math.cos(an) * 0.068, an);
    k.panel(0, 0.3, 0.001, 0.02, 0.07, C.rune, M.rune);
    k.panel(0, 0.54, 0.001, 0.018, 0.05, P.glass, M.window);
    k.pop();
  }
  a.rune.push([0, 0.21, 0], [0, 0.43, 0]);
  a.light.push([0, 0.66, 0]);
  a.door = [0, 0, 0.14];
  return k.build();
});

defineModel('elf_greatspire', a => {
  const k = new Kit();
  k.cyl(0, -0.14, 0, 0.3, 0.3, 0.16, 10, C.marbleWarm, M.stone);
  k.cyl(0, 0.02, 0, 0.26, 0.24, 0.05, 10, C.marbleWarm, M.stone);
  k.cyl(0, 0.07, 0, 0.16, 0.08, 1.3, 10, C.marble, M.plaster, { top: false });
  for (const y of [0.3, 0.6, 0.9, 1.15]) {
    k.cyl(0, y, 0, 0.19 - y * 0.08, 0.19 - y * 0.08, 0.014, 10, C.elfTrim, M.gold);
    k.cyl(0, y + 0.014, 0, 0.18 - y * 0.08, 0.18 - y * 0.08, 0.006, 10, C.rune, M.rune, { top: false });
  }
  for (const s of [-1, 1]) {
    k.push().at(s * 0.12, 0.8, 0).rot(0, 0, s * 0.5);
    k.cone(0, 0, 0, 0.05, 0.3, 6, C.marble, M.plaster);
    k.pop();
  }
  k.cyl(0, 1.37, 0, 0.1, 0.1, 0.06, 10, C.marble, M.plaster);
  k.cone(0, 1.43, 0, 0.11, 0.5, 10, C.elfRoof, M.tile);
  k.blob(0, 1.98, 0, 0.03, 0.05, 0.03, C.rune, M.rune, 1, 0, 2);
  for (let i = 0; i < 6; i++) {
    const an = (i / 6) * Math.PI * 2;
    k.push().at(Math.sin(an) * 0.2, 0.07, Math.cos(an) * 0.2, an);
    k.box(0, 0, 0, 0.03, 0.4, 0.03, C.marble, M.stone);
    k.cone(0, 0.4, 0, 0.022, 0.08, 6, C.elfTrim, M.gold);
    k.pop();
  }
  a.rune.push([0, 1.98, 0], [0, 0.31, 0], [0, 0.91, 0]);
  a.light.push([0, 1.98, 0], [0, 0.2, 0.2]);
  a.banner.push([0.2, 0.55, 0.0, 0.3]);
  return k.build();
});

defineModel('elf_pavilion', a => {
  const k = new Kit();
  k.cyl(0, -0.1, 0, 0.16, 0.16, 0.13, 8, C.marbleWarm, M.stone);
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * Math.PI * 2;
    k.cyl(Math.sin(an) * 0.13, 0.03, Math.cos(an) * 0.13, 0.01, 0.01, 0.16, 6, C.marble, M.plaster);
  }
  k.cyl(0, 0.19, 0, 0.16, 0.16, 0.015, 8, C.elfTrim, M.gold);
  k.cone(0, 0.205, 0, 0.18, 0.14, 8, C.elfRoof, M.tile);
  k.cyl(0, 0.03, 0, 0.05, 0.05, 0.03, 8, C.marble, M.stone, { topColor: C.rune, topMat: M.rune });
  a.rune.push([0, 0.07, 0]);
  a.seat.push([0.08, 0.03, 0.05], [-0.07, 0.03, -0.04]);
  return k.build();
});

defineModel('elf_tree', a => {
  // A great silver tree with a platform house in the branches.
  const k = new Kit();
  k.cyl(0, -0.1, 0, 0.1, 0.06, 0.9, 7, C.silverBark, M.bark);
  for (let i = 0; i < 5; i++) {
    const an = (i / 5) * Math.PI * 2;
    k.push().at(Math.sin(an) * 0.08, 0.0, Math.cos(an) * 0.08).rot(0.6 * Math.cos(an), 0, -0.6 * Math.sin(an));
    k.cyl(0, -0.1, 0, 0.04, 0.02, 0.2, 5, C.silverBark, M.bark);
    k.pop();
  }
  k.cyl(0, 0.42, 0, 0.26, 0.26, 0.018, 10, P.woodLight, M.wood);
  k.cyl(0, 0.438, 0, 0.12, 0.12, 0.1, 8, C.marble, M.plaster, { top: false });
  k.cone(0, 0.538, 0, 0.15, 0.1, 8, C.elfRoof, M.tile);
  for (let i = 0; i < 10; i++) { const an = (i / 10) * Math.PI * 2; k.box(Math.sin(an) * 0.25, 0.438, Math.cos(an) * 0.25, 0.006, 0.04, 0.006, C.elfTrim, M.gold); }
  for (const [x, y, z, r] of [[0, 0.95, 0, 0.32], [0.2, 0.8, 0.1, 0.2], [-0.2, 0.82, -0.08, 0.22], [0.05, 0.75, -0.22, 0.2], [-0.1, 0.78, 0.2, 0.2]]) {
    k.blob(x, y, z, r, r * 0.7, r, C.elfLeaf, M.leaf, 1, 0.15, Math.floor(x * 100 + 50));
  }
  a.light.push([0.2, 0.48, 0.2], [-0.2, 0.48, -0.1]);
  a.rune.push([0, 0.45, 0.12]);
  return k.build();
});

defineModel('elf_arch', a => {
  const k = new Kit();
  for (const s of [-1, 1]) {
    k.box(s * 0.1, 0, 0, 0.03, 0.22, 0.03, C.marble, M.stone);
    k.panel(s * 0.1, 0.05, 0.016, 0.012, 0.12, C.rune, M.rune);
  }
  for (let j = 0; j < 8; j++) {
    const a0 = (j / 8) * Math.PI, a1 = ((j + 1) / 8) * Math.PI;
    k.push().at(0, 0.22, 0);
    k.box(-Math.cos((a0 + a1) / 2) * 0.1, Math.sin((a0 + a1) / 2) * 0.08, 0, 0.04, 0.02, 0.03, C.marble, M.stone);
    k.pop();
  }
  a.rune.push([0, 0.2, 0]);
  return k.build();
});

defineModel('moonwell', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.3, 0.3, 0.03, 16, C.marbleWarm, M.stone, { topColor: col(0x9fe9ff), topMat: M.rune });
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * Math.PI * 2;
    k.push().at(Math.sin(an) * 0.34, 0, Math.cos(an) * 0.34, an);
    k.box(0, 0, 0, 0.035, 0.26, 0.035, C.marble, M.stone);
    k.panel(0, 0.1, 0.018, 0.015, 0.1, C.rune, M.rune);
    k.pop();
  }
  a.rune.push([0, 0.05, 0]);
  a.light.push([0, 0.1, 0]);
  return k.build();
});

// ---------------- Dwarves ----------------
defineModel('dwarf_gate', a => {
  // A colossal carved doorway set into a rock face. Front faces +z.
  const k = new Kit();
  k.box(0, -0.2, -0.35, 1.6, 1.4, 0.7, C.dwarfDark, M.stone);
  k.box(0, -0.2, 0.05, 1.2, 1.1, 0.1, C.dwarfStone, M.stone);
  // steps
  for (let i = 0; i < 4; i++) k.box(0, -0.2 + i * 0.03, 0.2 + (3 - i) * 0.05, 0.7 - i * 0.05, 0.03 + 0.2, 0.05, C.dwarfStone, M.stone);
  // door frame pillars with statues
  for (const s of [-1, 1]) {
    k.box(s * 0.33, 0.05, 0.13, 0.12, 0.7, 0.1, C.dwarfStone, M.stone);
    k.box(s * 0.33, 0.75, 0.13, 0.15, 0.05, 0.12, C.dwarfDark, M.stone);
    k.panel(s * 0.33, 0.2, 0.181, 0.03, 0.4, C.rune, M.rune);
    // guardian statue
    k.box(s * 0.55, 0.05, 0.2, 0.14, 0.06, 0.14, C.dwarfDark, M.stone);
    k.cyl(s * 0.55, 0.11, 0.2, 0.06, 0.05, 0.22, 6, C.dwarfStone, M.stone);
    k.blob(s * 0.55, 0.37, 0.2, 0.045, 0.05, 0.045, C.dwarfStone, M.stone, 0, 0.1, 3);
    k.cone(s * 0.55, 0.28, 0.24, 0.05, -0.12, 5, C.dwarfStone, M.stone);
    k.box(s * 0.55 + s * 0.06, 0.1, 0.2, 0.02, 0.36, 0.02, C.dwarfGold, M.gold);
  }
  // great door (two leaves) with rune circle
  k.box(0, 0.05, 0.1, 0.46, 0.62, 0.02, C.dwarfDark, M.metal);
  k.push().at(0, 0.38, 0.113).rot(Math.PI / 2, 0, 0);
  k.cyl(0, 0, 0, 0.15, 0.15, 0.006, 16, C.rune, M.rune, { top: false });
  k.cyl(0, 0.004, 0, 0.12, 0.12, 0.004, 16, C.dwarfDark, M.metal);
  k.pop();
  k.box(0, 0.05, 0.112, 0.006, 0.62, 0.006, C.dwarfGold, M.gold);
  // lintel with carved face
  k.box(0, 0.67, 0.12, 0.8, 0.14, 0.1, C.dwarfStone, M.stone);
  k.panel(0, 0.7, 0.171, 0.5, 0.02, C.rune, M.rune);
  k.blob(0, 0.9, 0.12, 0.14, 0.12, 0.08, C.dwarfStone, M.stone, 1, 0.08, 7);
  // braziers
  for (const s of [-1, 1]) {
    k.cyl(s * 0.22, 0.05, 0.3, 0.02, 0.03, 0.12, 6, C.dwarfDark, M.metal);
    k.cyl(s * 0.22, 0.17, 0.3, 0.045, 0.035, 0.03, 6, C.dwarfGold, M.gold, { topColor: col(0xff7a1a), topMat: M.fire });
    a.fire.push([s * 0.22, 0.2, 0.3]);
    a.light.push([s * 0.22, 0.25, 0.3]);
  }
  a.rune.push([0, 0.38, 0.12], [-0.33, 0.4, 0.18], [0.33, 0.4, 0.18]);
  a.door = [0, 0, 0.45];
  return { geometry: k.build(), footprint: [1.2, 0.6] };
});

defineModel('dwarf_house', a => {
  const k = new Kit();
  k.box(0, -0.12, 0, 0.24, 0.14, 0.2, C.dwarfDark, M.stone);
  k.box(0, 0.02, 0, 0.22, 0.12, 0.18, C.dwarfStone, M.stone);
  k.box(0, 0.14, 0, 0.24, 0.02, 0.2, C.dwarfDark, M.stone);
  k.pyramid(0, 0.16, 0, 0.2, 0.05, 0.16, C.dwarfRoof, M.tile, 0.0, 0.08);
  k.panel(0, 0.02, 0.091, 0.05, 0.08, col(0x3a2a1a), M.wood);
  k.panel(0, 0.1, 0.092, 0.07, 0.01, C.dwarfGold, M.gold);
  for (const x of [-0.07, 0.07]) k.panel(x, 0.06, 0.091, 0.03, 0.03, col(0xffb050), M.window);
  k.box(0.07, 0.16, -0.05, 0.04, 0.12, 0.04, C.dwarfDark, M.stone);
  a.smoke.push([0.07, 0.29, -0.05]);
  a.door = [0, 0, 0.14];
  return k.build();
});

defineModel('dwarf_forge', a => {
  const k = new Kit();
  k.box(0, -0.12, 0, 0.4, 0.14, 0.3, C.dwarfDark, M.stone);
  k.box(0, 0.02, -0.04, 0.38, 0.16, 0.2, C.dwarfStone, M.stone);
  k.box(0, 0.18, -0.04, 0.4, 0.03, 0.22, C.dwarfDark, M.stone);
  for (const x of [-0.13, 0.13]) {
    k.cyl(x, 0.21, -0.06, 0.04, 0.035, 0.22, 6, C.dwarfDark, M.stone);
    a.smoke.push([x, 0.44, -0.06]);
  }
  // big open forge mouth
  k.box(0, 0.02, 0.07, 0.2, 0.1, 0.02, C.dwarfDark, M.stone);
  k.panel(0, 0.03, 0.081, 0.14, 0.07, col(0xff6a1a), M.fire);
  a.fire.push([0, 0.06, 0.09]);
  a.forge.push([0, 0.08, 0.1]);
  for (const x of [-0.08, 0.08]) {
    k.box(x, 0.02, 0.15, 0.02, 0.025, 0.018, P.iron, M.metal);
    k.box(x, 0.045, 0.15, 0.045, 0.012, 0.02, P.iron, M.metal);
    a.work.push([x, 0, 0.185]);
  }
  a.light.push([0, 0.08, 0.14]);
  return k.build();
});

defineModel('mine_entrance', a => {
  const k = new Kit();
  k.box(0, -0.2, -0.2, 0.7, 0.6, 0.4, C.dwarfDark, M.stone);
  k.box(0, -0.2, 0.0, 0.2, 0.16 + 0.2, 0.02, col(0x0a0a0c), M.plain);
  for (const s of [-1, 1]) k.box(s * 0.1, 0, 0.03, 0.025, 0.18, 0.025, P.timber, M.wood);
  k.box(0, 0.17, 0.03, 0.25, 0.025, 0.03, P.timber, M.wood);
  k.box(0.14, 0, 0.05, 0.01, 0.12, 0.01, P.iron, M.metal);
  k.box(0.14, 0.12, 0.05, 0.02, 0.02, 0.02, col(0xffb050), M.window);
  a.light.push([0.14, 0.13, 0.06]);
  // rails
  for (const x of [-0.03, 0.03]) k.box(x, 0.002, 0.25, 0.006, 0.006, 0.45, P.iron, M.metal);
  for (let i = 0; i < 8; i++) k.box(0, 0, 0.05 + i * 0.055, 0.09, 0.004, 0.012, P.timber, M.wood);
  a.work.push([0.1, 0, 0.3], [-0.1, 0, 0.35]);
  a.door = [0, 0, 0.1];
  return { geometry: k.build(), footprint: [0.5, 0.5] };
});

defineModel('minecart', a => {
  const k = new Kit();
  k.box(0, 0.015, 0, 0.05, 0.035, 0.07, P.iron, M.metal);
  k.blob(0, 0.055, 0, 0.022, 0.015, 0.03, col(0x8a8f96), M.stone, 0, 0.3, 4);
  k.blob(0.01, 0.06, 0.01, 0.01, 0.008, 0.01, C.dwarfGold, M.gold, 0, 0.3, 5);
  return k.build();
});

defineModel('ore_pile', a => {
  const k = new Kit();
  k.blob(0, 0, 0, 0.07, 0.035, 0.06, col(0x6a6760), M.stone, 1, 0.3, 11);
  k.blob(0.02, 0.02, 0.01, 0.015, 0.01, 0.015, C.dwarfGold, M.gold, 0, 0.3, 3);
  k.blob(-0.03, 0.015, 0.02, 0.012, 0.01, 0.012, col(0x9fd8ff), M.crystal, 0, 0.3, 6);
  return k.build();
});

defineModel('dwarf_statue', a => {
  const k = new Kit();
  k.box(0, 0, 0, 0.14, 0.08, 0.14, C.dwarfDark, M.stone);
  k.cyl(0, 0.08, 0, 0.055, 0.05, 0.18, 6, C.dwarfStone, M.stone);
  k.blob(0, 0.3, 0, 0.04, 0.045, 0.04, C.dwarfStone, M.stone, 0, 0.1, 3);
  k.cone(0, 0.28, 0.035, 0.045, -0.12, 5, C.dwarfStone, M.stone);
  k.box(0.05, 0.1, 0.02, 0.015, 0.25, 0.015, C.dwarfGold, M.gold);
  k.box(0.05, 0.33, 0.02, 0.06, 0.04, 0.012, C.dwarfGold, M.gold);
  return k.build();
});

// ---------------- Fae ----------------
function mushroomHouse(a, capColor, h, r, seed) {
  const k = new Kit();
  k.cyl(0, -0.05, 0, r * 0.55, r * 0.5, h + 0.05, 8, C.stem, M.plaster, { top: false });
  k.panel(0, 0, r * 0.5 + 0.002, 0.04, 0.06, col(0x6b4a2f), M.wood);
  k.panel(r * 0.2, h * 0.6, r * 0.48, 0.022, 0.022, col(0xffd27a), M.window);
  k.push().at(0, h, 0);
  k.blob(0, 0, 0, r, r * 0.55, r, capColor, M.cloth, 1, 0.06, seed);
  k.cyl(0, -0.01, 0, r * 0.98, r * 0.9, 0.015, 10, mulc(C.stem, 0.8), M.plaster, { top: false });
  // glowing spots
  const rnd = mulberry32(seed);
  for (let i = 0; i < 7; i++) {
    const an = rnd() * Math.PI * 2, el = 0.3 + rnd() * 0.9;
    k.blob(Math.cos(an) * Math.cos(el) * r * 0.95, Math.sin(el) * r * 0.52, Math.sin(an) * Math.cos(el) * r * 0.95, r * 0.12, r * 0.06, r * 0.12, col(0xfff3c4), M.glowwhite, 0, 0, i);
  }
  k.pop();
  a.light.push([0, h * 0.5, r * 0.6]);
  a.door = [0, 0, r * 0.7];
  return k.build();
}
defineModel('mushroom_red', a => mushroomHouse(a, C.capRed, 0.14, 0.14, 3));
defineModel('mushroom_violet', a => mushroomHouse(a, C.capViolet, 0.18, 0.12, 5));
defineModel('mushroom_blue', a => mushroomHouse(a, C.capBlue, 0.22, 0.16, 7));

defineModel('flower_pavilion', a => {
  const k = new Kit();
  k.cyl(0, -0.02, 0, 0.012, 0.012, 0.22, 5, C.moss, M.leaf);
  for (let i = 0; i < 6; i++) {
    const an = (i / 6) * Math.PI * 2;
    k.push().at(0, 0.2, 0, an).rot(0.6, 0, 0);
    k.blob(0, 0, 0.09, 0.05, 0.012, 0.1, C.petal, M.cloth, 0, 0.05, i);
    k.pop();
  }
  k.blob(0, 0.21, 0, 0.035, 0.025, 0.035, col(0xffe066), M.glowwhite, 0, 0, 1);
  a.light.push([0, 0.21, 0]);
  a.seat.push([0.08, 0, 0.0], [-0.06, 0, 0.06]);
  return k.build();
});

defineModel('fae_lantern', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.006, 0.004, 0.1, 4, C.moss, M.leaf);
  k.push().at(0, 0.1, 0).rot(0, 0, 0.8); k.cyl(0, 0, 0, 0.004, 0.003, 0.04, 4, C.moss, M.leaf); k.pop();
  k.blob(0.03, 0.11, 0, 0.014, 0.02, 0.014, col(0xb4ffd9), M.glowwhite, 0, 0, 2);
  a.light.push([0.03, 0.11, 0]);
  return k.build();
});

// ---------------- Beastfolk ----------------
defineModel('tent', a => {
  const k = new Kit();
  k.cone(0, 0, 0, 0.12, 0.2, 8, C.hide, M.cloth);
  k.cone(0, 0.2, 0, 0.012, -0.08, 4, P.wood, M.wood);
  for (let i = 0; i < 3; i++) { const an = i * 2.1; k.push().at(0, 0.2, 0).rot(0.3 * Math.cos(an), 0, 0.3 * Math.sin(an)); k.box(0, 0, 0, 0.006, 0.06, 0.006, P.wood, M.wood); k.pop(); }
  k.push().at(0, 0, 0.0, 0);
  k.tri([-0.03, 0, 0.1], [0.03, 0, 0.1], [0, 0.09, 0.052], col(0x2a1c10), M.plain);
  k.pop();
  k.panel(0, 0.06, 0.07, 0.05, 0.03, C.paint, M.cloth);
  a.door = [0, 0, 0.16];
  a.smoke.push([0, 0.26, 0]);
  return k.build();
});

defineModel('longhouse', a => {
  const k = new Kit();
  k.box(0, -0.06, 0, 0.44, 0.08, 0.2, P.stoneMid, M.stone);
  k.box(0, 0.02, 0, 0.42, 0.08, 0.18, C.hide2, M.wood);
  k.push().at(0, 0, 0);
  k.gable(0, 0.1, 0, 0.42, 0.14, 0.18, P.roofs.thatch[1], M.thatch, 0.04, C.hide2, M.wood);
  k.pop();
  // horns and skulls over the door
  k.push().at(0, 0.3, 0.12).rot(0, 0, 0);
  k.blob(0, -0.02, 0, 0.02, 0.018, 0.02, C.bone, M.plain, 0, 0.1, 2);
  for (const s of [-1, 1]) { k.push().at(s * 0.02, 0, 0).rot(0, 0, s * -1.0); k.cone(0, 0, 0, 0.008, 0.06, 4, C.bone, M.plain); k.pop(); }
  k.pop();
  k.panel(0, 0.02, 0.092, 0.05, 0.07, col(0x2a1c10), M.plain);
  a.door = [0, 0, 0.15];
  a.smoke.push([0.1, 0.26, 0]);
  a.light.push([0.05, 0.1, 0.12]);
  return k.build();
});

defineModel('palisade', a => {
  const k = new Kit();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -0.24 + i * 0.06;
    const h = 0.16 + (i % 3) * 0.015;
    k.cyl(x, -0.04, 0, 0.016, 0.016, h, 5, P.wood, M.wood, { top: false });
    k.cone(x, h - 0.04, 0, 0.016, 0.04, 5, P.woodLight, M.wood);
  }
  k.box(0, 0.08, 0.014, 0.52, 0.012, 0.006, P.timber, M.wood);
  return { geometry: k.build(), footprint: [0.52, 0.03] };
});

defineModel('totem', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.03, 0.028, 0.36, 6, C.totem, M.wood);
  for (let i = 0; i < 3; i++) {
    k.box(0, 0.06 + i * 0.1, 0.022, 0.05, 0.05, 0.02, [C.paint, col(0x2f6f8f), col(0xd9b44a)][i], M.wood);
    k.panel(0, 0.08 + i * 0.1, 0.033, 0.03, 0.01, C.bone, M.plain);
  }
  for (const s of [-1, 1]) { k.push().at(s * 0.03, 0.32, 0).rot(0, 0, s * -0.9); k.box(0, 0, 0, 0.08, 0.012, 0.03, C.totem, M.wood); k.pop(); }
  k.blob(0, 0.4, 0, 0.03, 0.03, 0.035, C.bone, M.plain, 0, 0.1, 9);
  a.fire.push([0, 0.43, 0.0]);
  return k.build();
});

defineModel('bonfire', a => {
  const k = new Kit();
  for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2; k.blob(Math.sin(an) * 0.06, 0.005, Math.cos(an) * 0.06, 0.018, 0.012, 0.018, P.stoneMid, M.stone, 0, 0.2, i); }
  for (let i = 0; i < 5; i++) { const an = (i / 5) * Math.PI * 2; k.push().at(Math.sin(an) * 0.02, 0, Math.cos(an) * 0.02).rot(0.6 * Math.cos(an), 0, -0.6 * Math.sin(an)); k.box(0, 0, 0, 0.01, 0.07, 0.01, P.timber, M.wood); k.pop(); }
  k.blob(0, 0.01, 0, 0.035, 0.012, 0.035, col(0xff7a1a), M.fire, 0, 0.2, 3);
  a.fire.push([0, 0.03, 0]);
  a.light.push([0, 0.08, 0]);
  a.seat.push([0.12, 0, 0], [-0.12, 0, 0.02], [0.02, 0, 0.12], [-0.03, 0, -0.12]);
  return k.build();
});

defineModel('drying_rack', a => {
  const k = new Kit();
  for (const x of [-0.06, 0.06]) k.box(x, 0, 0, 0.008, 0.09, 0.008, P.wood, M.wood);
  k.box(0, 0.085, 0, 0.14, 0.006, 0.006, P.wood, M.wood);
  for (let i = 0; i < 3; i++) k.box(-0.04 + i * 0.04, 0.04, 0, 0.03, 0.045, 0.003, C.hide, M.cloth);
  return k.build();
});

defineModel('stilt_hut', a => {
  const k = new Kit();
  for (const x of [-0.07, 0.07]) for (const z of [-0.06, 0.06]) k.box(x, -0.3, z, 0.012, 0.44, 0.012, P.timber, M.wood);
  k.box(0, 0.12, 0, 0.2, 0.012, 0.18, P.wood, M.wood);
  k.box(0, 0.13, 0, 0.14, 0.08, 0.12, C.reed, M.thatch);
  k.pyramid(0, 0.21, 0, 0.14, 0.1, 0.12, C.jungle, M.thatch, 0.03);
  k.panel(0, 0.13, 0.061, 0.035, 0.05, col(0x1a1208), M.plain);
  k.box(0, 0.05, 0.14, 0.04, 0.005, 0.12, P.wood, M.wood);
  a.door = [0, 0.12, 0.13];
  a.light.push([0.05, 0.18, 0.08]);
  a.smoke.push([0, 0.32, 0]);
  return k.build();
});

// ---------------- Draconic ----------------
defineModel('ziggurat', a => {
  const k = new Kit();
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const s = 0.9 - i * 0.16;
    k.box(0, -0.12 + i * 0.14, 0, s, 0.14 + (i === 0 ? 0.12 : 0), s, i % 2 ? C.obsidian2 : C.obsidian, M.obsidian);
    k.box(0, 0.02 + i * 0.14 - 0.01, s / 2, s * 0.98, 0.012, 0.004, C.dracGold, M.gold);
  }
  // stairs up the front
  for (let i = 0; i < 16; i++) k.box(0, -0.1 + i * 0.043, 0.46 - i * 0.03, 0.14, 0.043, 0.03, C.basalt, M.stone);
  // shrine on top with fire
  const top = 0.02 + steps * 0.14 - 0.12;
  k.box(0, top, 0, 0.18, 0.12, 0.18, C.dracRed, M.plaster);
  k.pyramid(0, top + 0.12, 0, 0.24, 0.1, 0.24, C.dracGold, M.gold, 0.02);
  for (const [x, z] of [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]]) {
    k.cyl(x, top, z, 0.025, 0.035, 0.08, 6, C.obsidian, M.obsidian, { topColor: col(0xff6a1a), topMat: M.fire });
    a.fire.push([x, top + 0.09, z]);
  }
  a.light.push([0, top + 0.1, 0.12], [0, 0.1, 0.5]);
  a.banner.push([0.35, 0.3, 0.35, 0.4], [-0.35, 0.3, 0.35, 0.4]);
  a.smoke.push([0, top + 0.3, 0]);
  a.door = [0, 0, 0.6];
  return { geometry: k.build(), footprint: [0.9, 1.0] };
});

defineModel('dragon_statue', a => {
  const k = new Kit();
  k.box(0, 0, 0, 0.16, 0.06, 0.24, C.basalt, M.stone);
  k.push().at(0, 0.06, 0);
  k.blob(0, 0.06, 0, 0.05, 0.06, 0.09, C.obsidian2, M.obsidian, 1, 0.1, 3);
  k.push().at(0, 0.1, 0.07).rot(-0.7, 0, 0); k.cyl(0, 0, 0, 0.025, 0.02, 0.12, 6, C.obsidian2, M.obsidian); k.pop();
  k.blob(0, 0.2, 0.13, 0.025, 0.022, 0.04, C.obsidian2, M.obsidian, 0, 0.1, 5);
  for (const s of [-1, 1]) {
    k.push().at(s * 0.04, 0.1, -0.01).rot(0, 0, s * 0.6);
    k.tri([0, 0, 0.04], [0, 0, -0.06], [s * 0.14, 0.08, -0.04], C.obsidian, M.obsidian);
    k.tri([0, 0, -0.06], [0, 0, 0.04], [s * 0.14, 0.08, -0.04], C.obsidian, M.obsidian);
    k.pop();
    k.blob(s * 0.012, 0.215, 0.165, 0.005, 0.005, 0.005, col(0xff5020), M.fire, 0, 0, 1);
  }
  k.pop();
  a.fire.push([0, 0.27, 0.19]);
  return k.build();
});

defineModel('pagoda', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.26, 0.12, 0.26, C.basalt, M.stone);
  for (let i = 0; i < 3; i++) {
    const s = 0.2 - i * 0.04, y = 0.02 + i * 0.13;
    k.box(0, y, 0, s, 0.1, s, C.dracRed, M.plaster);
    k.pyramid(0, y + 0.1, 0, s + 0.1, 0.05, s + 0.1, C.obsidian2, M.tile, 0.0, 0);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) k.cone(x * (s / 2 + 0.05), y + 0.1, z * (s / 2 + 0.05), 0.008, 0.03, 4, C.dracGold, M.gold);
    k.panel(0, y + 0.03, s / 2 + 0.002, 0.04, 0.05, col(0xffa050), M.window);
  }
  k.cone(0, 0.43, 0, 0.02, 0.12, 5, C.dracGold, M.gold);
  a.light.push([0, 0.06, 0.13]);
  a.door = [0, 0, 0.18];
  return k.build();
});

defineModel('draco_house', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.22, 0.12, 0.18, C.basalt, M.stone);
  k.box(0, 0.02, 0, 0.2, 0.1, 0.16, C.obsidian2, M.stone);
  k.gable(0, 0.12, 0, 0.2, 0.07, 0.16, C.dracRed, M.tile, 0.03, C.obsidian2, M.stone);
  for (const s of [-1, 1]) k.cone(s * 0.13, 0.12, 0, 0.012, 0.05, 4, C.dracGold, M.gold);
  k.panel(0, 0.02, 0.081, 0.045, 0.07, col(0x2a1a14), M.wood);
  k.panel(0.06, 0.06, 0.081, 0.025, 0.03, col(0xffa050), M.window);
  a.door = [0, 0, 0.13];
  a.smoke.push([-0.06, 0.25, -0.04]);
  k.box(-0.06, 0.12, -0.04, 0.03, 0.12, 0.03, C.basalt, M.stone);
  return k.build();
});

defineModel('brazier', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.02, 0.03, 0.12, 6, C.obsidian, M.metal);
  k.cyl(0, 0.12, 0, 0.05, 0.035, 0.04, 8, C.dracGold, M.gold, { topColor: col(0xff6a1a), topMat: M.fire });
  a.fire.push([0, 0.17, 0]);
  a.light.push([0, 0.2, 0]);
  return k.build();
});

defineModel('lava_forge', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.34, 0.12, 0.26, C.basalt, M.stone);
  k.cyl(0, 0.02, 0, 0.1, 0.1, 0.05, 10, C.obsidian, M.obsidian, { topColor: col(0xff5a10), topMat: M.lava });
  for (const x of [-0.12, 0.12]) {
    k.box(x, 0.02, 0.06, 0.02, 0.025, 0.018, P.iron, M.metal);
    k.box(x, 0.045, 0.06, 0.045, 0.012, 0.02, P.iron, M.metal);
    a.work.push([x, 0, 0.1]);
  }
  k.box(0, 0.02, -0.1, 0.3, 0.2, 0.04, C.obsidian2, M.stone);
  k.cone(0, 0.22, -0.1, 0.08, 0.1, 4, C.dracGold, M.gold);
  a.fire.push([0, 0.08, 0]);
  a.forge.push([0, 0.08, 0]);
  a.light.push([0, 0.12, 0]);
  return k.build();
});

// ---------------- Undead ----------------
defineModel('gothic_ruin', a => {
  const k = new Kit();
  const L = 0.8, W = 0.3;
  k.box(0, -0.12, 0, W + 0.1, 0.14, L + 0.1, C.crypt, M.stone);
  for (const s of [-1, 1]) {
    k.box(s * W / 2, 0.02, -0.1, 0.04, 0.3, L * 0.7, C.crypt, M.stone);
    for (let i = 0; i < 4; i++) {
      const z = -L * 0.38 + i * 0.16;
      k.box(s * (W / 2 + 0.04), 0.02, z, 0.05, 0.36 + (i % 2) * 0.1, 0.05, C.grave, M.stone);
      k.push().at(s * (W / 2 + 0.021), 0, z + 0.07, s * Math.PI / 2); k.panel(0, 0.1, 0, 0.04, 0.14, col(0x3ad17a), M.ghost); k.pop();
    }
  }
  // broken facade with rose window glowing green
  k.box(0, 0.02, L / 2, W + 0.08, 0.48, 0.06, C.grave, M.stone);
  k.box(0.12, 0.5, L / 2, 0.1, 0.18, 0.06, C.grave, M.stone);
  k.push().at(0, 0.33, L / 2 + 0.032).rot(Math.PI / 2, 0, 0); k.cyl(0, 0, 0, 0.08, 0.08, 0.004, 12, col(0x44ff99), M.ghost); k.pop();
  k.panel(0, 0.02, L / 2 + 0.032, 0.1, 0.18, col(0x0c0f0c), M.plain);
  // tower stump
  k.box(-0.18, 0.02, -L / 2 + 0.06, 0.14, 0.62, 0.14, C.crypt, M.stone);
  for (let i = 0; i < 3; i++) k.box(-0.18 + (i - 1) * 0.04, 0.64, -L / 2 + 0.06, 0.03, 0.03 + i * 0.03, 0.14, C.crypt, M.stone);
  a.rune.push([0, 0.33, L / 2 + 0.03]);
  a.light.push([0, 0.2, L / 2 + 0.08]);
  a.door = [0, 0, L / 2 + 0.1];
  return k.build();
});

defineModel('crypt', a => {
  const k = new Kit();
  k.box(0, -0.08, 0, 0.18, 0.1, 0.22, C.crypt, M.stone);
  k.box(0, 0.02, 0, 0.16, 0.1, 0.2, C.grave, M.stone);
  k.gable(0, 0.12, 0, 0.16, 0.07, 0.2, C.crypt, M.stone, 0.01, C.grave, M.stone);
  k.panel(0, 0.02, 0.101, 0.05, 0.075, col(0x0b0d0b), M.plain);
  k.panel(0, 0.1, 0.102, 0.08, 0.012, col(0x39c46e), M.ghost);
  for (const s of [-1, 1]) k.box(s * 0.07, 0.02, 0.1, 0.02, 0.13, 0.02, C.crypt, M.stone);
  a.light.push([0, 0.1, 0.12]);
  a.door = [0, 0, 0.14];
  return k.build();
});

defineModel('grave', a => {
  const k = new Kit();
  const rnd = mulberry32(99);
  for (let i = 0; i < 6; i++) {
    const x = (i % 3 - 1) * 0.07, z = Math.floor(i / 3) * 0.1 - 0.05;
    k.push().at(x, 0, z, (rnd() - 0.5) * 0.3).rot((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
    if (i % 2) { k.box(0, 0, 0, 0.03, 0.045, 0.01, C.grave, M.stone); }
    else { k.box(0, 0, 0, 0.007, 0.05, 0.007, C.grave, M.stone); k.box(0, 0.03, 0, 0.028, 0.007, 0.007, C.grave, M.stone); }
    k.pop();
    k.box(x, -0.005, z + 0.03, 0.03, 0.01, 0.05, C.rot, M.plain);
  }
  return k.build();
});

defineModel('ghost_lantern', a => {
  const k = new Kit();
  k.box(0, 0, 0, 0.007, 0.1, 0.007, P.iron, M.metal);
  k.box(0.018, 0.095, 0, 0.04, 0.005, 0.005, P.iron, M.metal);
  k.box(0.035, 0.07, 0, 0.018, 0.022, 0.018, col(0x6bff9a), M.ghost);
  a.light.push([0.035, 0.08, 0]);
  return k.build();
});

defineModel('iron_fence', a => {
  const k = new Kit();
  for (let i = 0; i < 9; i++) { k.box(-0.2 + i * 0.05, 0, 0, 0.005, 0.07, 0.005, P.iron, M.metal); k.cone(-0.2 + i * 0.05, 0.07, 0, 0.006, 0.015, 4, P.iron, M.metal); }
  k.box(0, 0.05, 0, 0.42, 0.005, 0.004, P.iron, M.metal);
  return { geometry: k.build(), footprint: [0.42, 0.01] };
});

// ---------------- Ruins ----------------
defineModel('ruin_wall', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.5, 0.12, 0.06, P.stoneMid, M.stone);
  k.box(-0.14, 0.02, 0, 0.22, 0.22, 0.05, P.stone, M.stone);
  k.box(0.1, 0.02, 0, 0.14, 0.12, 0.05, P.stone, M.stone);
  k.box(0.2, 0.02, 0, 0.06, 0.05, 0.05, P.stone, M.stone);
  k.blob(0.05, 0.13, 0.02, 0.05, 0.02, 0.03, C.moss, M.leaf, 0, 0.2, 2);
  k.blob(0.25, 0.0, 0.06, 0.03, 0.02, 0.03, P.stone, M.stone, 0, 0.3, 7);
  return { geometry: k.build(), footprint: [0.5, 0.06] };
});
defineModel('ruin_house', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.26, 0.12, 0.22, P.stoneMid, M.stone);
  k.box(0, 0.02, 0.1, 0.24, 0.16, 0.03, P.stone, M.stone);
  k.box(-0.11, 0.02, 0, 0.03, 0.12, 0.2, P.stone, M.stone);
  k.box(0.11, 0.02, -0.04, 0.03, 0.07, 0.12, P.stone, M.stone);
  k.box(0, 0.02, -0.1, 0.1, 0.09, 0.03, P.stone, M.stone);
  k.panel(0, 0.02, 0.116, 0.05, 0.09, col(0x111111), M.plain);
  k.push().at(0.02, 0.12, 0.02).rot(0.4, 0.2, 0.1); k.box(0, 0, 0, 0.2, 0.008, 0.02, P.timber, M.wood); k.pop();
  k.blob(0.05, 0.02, -0.02, 0.05, 0.02, 0.05, C.moss, M.leaf, 0, 0.2, 4);
  return k.build();
});
defineModel('column', a => {
  const k = new Kit();
  k.box(0, 0, 0, 0.07, 0.03, 0.07, C.marbleWarm, M.stone);
  k.cyl(0, 0.03, 0, 0.025, 0.022, 0.3, 8, C.marbleWarm, M.stone);
  k.box(0, 0.33, 0, 0.07, 0.025, 0.07, C.marbleWarm, M.stone);
  return k.build();
});
defineModel('column_broken', a => {
  const k = new Kit();
  k.box(0, 0, 0, 0.07, 0.03, 0.07, C.marbleWarm, M.stone);
  k.cyl(0, 0.03, 0, 0.025, 0.024, 0.13, 8, C.marbleWarm, M.stone);
  k.push().at(0.09, 0.02, 0.03).rot(0, 0.5, Math.PI / 2 - 0.1); k.cyl(0, -0.06, 0, 0.024, 0.023, 0.12, 8, C.marbleWarm, M.stone); k.pop();
  k.blob(0, 0.16, 0, 0.03, 0.015, 0.03, C.moss, M.leaf, 0, 0.3, 3);
  return k.build();
});
defineModel('ruin_arch', a => {
  const k = new Kit();
  for (const s of [-1, 1]) k.box(s * 0.12, 0, 0, 0.05, 0.3, 0.05, P.stone, M.stone);
  k.box(0, 0.3, 0, 0.3, 0.05, 0.05, P.stone, M.stone);
  k.panel(0, 0.31, 0.026, 0.2, 0.02, C.rune, M.rune);
  a.rune.push([0, 0.32, 0.03]);
  return k.build();
});
defineModel('statue_fallen', a => {
  const k = new Kit();
  k.push().at(0, 0.04, 0).rot(0, 0.3, Math.PI / 2);
  k.cyl(0, -0.12, 0, 0.05, 0.045, 0.2, 6, C.marbleWarm, M.stone);
  k.blob(0, 0.12, 0, 0.04, 0.045, 0.04, C.marbleWarm, M.stone, 0, 0.1, 2);
  k.pop();
  k.box(0.2, 0, 0, 0.1, 0.05, 0.1, C.marbleWarm, M.stone);
  k.blob(-0.04, 0.02, 0.03, 0.06, 0.02, 0.04, C.moss, M.leaf, 0, 0.3, 5);
  return k.build();
});
defineModel('ruin_tower', a => {
  const k = new Kit();
  k.cyl(0, -0.12, 0, 0.16, 0.16, 0.14, 9, P.stoneMid, M.stone);
  k.cyl(0, 0.02, 0, 0.14, 0.13, 0.5, 9, P.stone, M.stone, { top: false });
  for (let i = 0; i < 5; i++) { const an = (i / 9) * Math.PI * 2; k.box(Math.sin(an) * 0.12, 0.52, Math.cos(an) * 0.12, 0.05, 0.06 + i * 0.03, 0.05, P.stone, M.stone); }
  for (let i = 0; i < 3; i++) { const an = 2 + i; k.push().at(Math.sin(an) * 0.135, 0, Math.cos(an) * 0.135, an); k.panel(0, 0.2 + i * 0.1, 0, 0.02, 0.05, col(0x111111), M.plain); k.pop(); }
  k.blob(0.1, 0.1, 0.1, 0.06, 0.1, 0.05, C.moss, M.leaf, 1, 0.2, 6);
  k.blob(0.25, 0.0, 0.1, 0.06, 0.04, 0.05, P.stone, M.stone, 0, 0.3, 9);
  a.rune.push([0, 0.3, 0.14]);
  return k.build();
});
defineModel('ruin_keep', a => {
  const k = new Kit();
  k.box(0, -0.14, 0, 0.5, 0.16, 0.5, P.stoneMid, M.stone);
  k.box(0, 0.02, 0.21, 0.46, 0.4, 0.06, P.stone, M.stone);
  k.box(-0.21, 0.02, 0, 0.06, 0.55, 0.46, P.stone, M.stone);
  k.box(0.21, 0.02, 0.05, 0.06, 0.25, 0.3, P.stone, M.stone);
  k.box(0.05, 0.02, -0.21, 0.3, 0.18, 0.06, P.stone, M.stone);
  k.merlons(-0.23, 0.21, 0.23, 0.21, 0.42, 0.04, P.stone, 0.035, 0.035);
  k.panel(0, 0.02, 0.242, 0.08, 0.13, col(0x111111), M.plain);
  k.blob(0.1, 0.02, 0.0, 0.12, 0.05, 0.12, P.stoneMid, M.stone, 1, 0.3, 4);
  k.blob(-0.15, 0.4, 0.2, 0.06, 0.06, 0.04, C.moss, M.leaf, 0, 0.3, 8);
  return k.build();
});

// ---------------- Landmarks ----------------
defineModel('runeblade', a => {
  const k = new Kit();
  k.blob(0, -0.1, 0, 0.8, 0.28, 0.8, P.stoneMid, M.stone, 1, 0.25, 12);
  k.push().at(0, 0, 0).rot(0.12, 0.4, 0.08);
  // blade (tapered, double-edged)
  const L = 3.2, w = 0.28, t = 0.05;
  k.tri([-w / 2, -0.4, 0], [w / 2, -0.4, 0], [0, L, t], col(0xb9c7d2), M.metal);
  k.tri([w / 2, -0.4, 0], [-w / 2, -0.4, 0], [0, L, -t], col(0x9fb0bd), M.metal);
  k.tri([-w / 2, -0.4, 0], [0, L, -t], [0, L, t], col(0xaab8c4), M.metal);
  k.tri([w / 2, -0.4, 0], [0, L, t], [0, L, -t], col(0xaab8c4), M.metal);
  k.box(0, 0.1, t * 0.5, 0.05, L - 0.8, 0.012, C.rune, M.rune);
  k.box(0, 0.1, -t * 0.5 - 0.012, 0.05, L - 0.8, 0.012, C.rune, M.rune);
  // crossguard, grip and pommel
  k.box(0, L, 0, 1.0, 0.1, 0.12, col(0xc9a24a), M.gold);
  for (const s of [-1, 1]) k.blob(s * 0.52, L + 0.05, 0, 0.08, 0.08, 0.08, C.rune, M.rune, 1, 0, 3);
  k.cyl(0, L + 0.1, 0, 0.05, 0.05, 0.55, 6, col(0x3a2418), M.cloth);
  k.blob(0, L + 0.72, 0, 0.12, 0.12, 0.12, col(0xc9a24a), M.gold, 1, 0, 4);
  k.blob(0, L + 0.72, 0.09, 0.05, 0.05, 0.05, C.rune, M.rune, 1, 0, 5);
  k.pop();
  a.rune.push([0, 1.6, 0], [0, 3.9, 0.1]);
  a.light.push([0, 2.0, 0.2]);
  return k.build();
});

defineModel('floatisle', a => {
  const k = new Kit();
  // inverted rocky cone with a ruined shrine on top
  k.cone(0, 0.0, 0, 1.1, -1.8, 9, P.stoneMid, M.stone);
  k.blob(0, -0.05, 0, 1.15, 0.2, 1.05, col(0x6b8f4a), M.leaf, 1, 0.15, 3);
  k.blob(0.3, -0.9, 0.2, 0.3, 0.5, 0.3, P.stoneDark, M.stone, 1, 0.25, 8);
  k.blob(-0.4, -0.6, -0.2, 0.3, 0.4, 0.3, P.stoneDark, M.stone, 1, 0.25, 9);
  for (let i = 0; i < 6; i++) {
    const an = (i / 6) * Math.PI * 2;
    const h = i % 2 ? 0.5 : 0.25;
    k.cyl(Math.sin(an) * 0.45, 0.1, Math.cos(an) * 0.45, 0.05, 0.045, h, 7, C.marbleWarm, M.stone);
  }
  k.cyl(0, 0.1, 0, 0.3, 0.3, 0.05, 10, C.marbleWarm, M.stone, { topColor: C.rune, topMat: M.rune });
  k.blob(0, 0.5, 0, 0.12, 0.2, 0.12, col(0xa6f3ff), M.crystal, 1, 0.1, 4);
  // hanging roots and a trickle of water
  for (let i = 0; i < 7; i++) { const an = i * 0.9; k.cyl(Math.sin(an) * 0.5, -0.8, Math.cos(an) * 0.5, 0.01, 0.02, 0.8, 4, col(0x5a4a30), M.bark); }
  a.rune.push([0, 0.5, 0]);
  a.light.push([0, 0.55, 0]);
  a.beam.push([0, 0.2, 0]);
  return k.build();
});

defineModel('titan', a => {
  const k = new Kit();
  const bronze = col(0x7d6a3e), verd = col(0x4f8f7a);
  // fallen head
  k.push().at(0, 0.3, 0).rot(0.3, 0.2, 1.2);
  k.blob(0, 0, 0, 0.55, 0.65, 0.55, bronze, M.metal, 1, 0.05, 2);
  k.box(-0.2, 0.2, 0.45, 0.12, 0.06, 0.08, verd, M.metal);
  k.box(0.2, 0.2, 0.45, 0.12, 0.06, 0.08, verd, M.metal);
  k.cone(0, 0.55, 0, 0.4, 0.5, 6, verd, M.metal);
  k.pop();
  // arm and hand rising from the ground
  k.push().at(2.0, -0.1, 0.6).rot(0.2, 0, -0.5);
  k.cyl(0, 0, 0, 0.22, 0.2, 1.4, 7, bronze, M.metal);
  k.blob(0, 1.5, 0, 0.26, 0.2, 0.2, bronze, M.metal, 1, 0.1, 5);
  for (let i = 0; i < 4; i++) k.cyl(-0.15 + i * 0.1, 1.6, 0.05, 0.04, 0.035, 0.3, 5, bronze, M.metal);
  k.pop();
  // shattered torso slab
  k.push().at(-1.6, 0.0, -0.4).rot(0.1, 0.7, 0.15);
  k.box(0, -0.2, 0, 1.4, 0.55, 0.9, bronze, M.metal);
  k.box(0, 0.35, 0, 1.2, 0.05, 0.7, verd, M.metal);
  k.pop();
  k.blob(0.8, 0, -0.9, 0.4, 0.15, 0.3, verd, M.metal, 1, 0.3, 7);
  a.rune.push([0, 0.6, 0.4]);
  return k.build();
});

defineModel('portal', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.9, 0.14, 0.4, P.stoneMid, M.stone);
  for (let i = 0; i < 4; i++) k.box(0, -0.06 + i * 0.03, 0.25 + i * 0.04, 0.6 - i * 0.08, 0.03, 0.06, P.stone, M.stone);
  // ring of stones standing on edge
  const n = 18, R = 0.55;
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2;
    k.push().at(Math.sin(an) * R, 0.6 + Math.cos(an) * R, 0).rot(0, 0, -an);
    k.box(0, -0.06, 0, 0.14, 0.12, 0.14, P.stoneDark, M.stone);
    k.panel(0, -0.03, 0.071, 0.05, 0.05, C.rune, M.rune);
    k.pop();
  }
  a.beam.push([0, 0.6, 0, 0.5]);
  a.rune.push([0, 0.6, 0]);
  a.light.push([0, 0.6, 0.2]);
  return k.build();
});

defineModel('stones', a => {
  const k = new Kit();
  const n = 9, R = 0.55;
  const rnd = mulberry32(5);
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2;
    const h = 0.25 + rnd() * 0.15;
    k.push().at(Math.sin(an) * R, 0, Math.cos(an) * R, an).rot((rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15);
    k.box(0, -0.05, 0, 0.1, h + 0.05, 0.06, col(0x777a7c), M.stone);
    k.panel(0, h * 0.4, -0.031, 0.03, 0.08, C.rune, M.rune, Math.PI);
    k.pop();
  }
  k.box(0, -0.02, 0, 0.2, 0.07, 0.12, col(0x666a6c), M.stone);
  k.panel(0, 0.052, 0, 0.1, 0.004, C.rune, M.rune);
  a.rune.push([0, 0.1, 0]);
  a.light.push([0, 0.15, 0]);
  return k.build();
});

defineModel('obelisk', a => {
  const k = new Kit();
  k.box(0, -0.05, 0, 0.18, 0.08, 0.18, P.stoneMid, M.stone);
  k.cyl(0, 0.03, 0, 0.06, 0.035, 0.6, 4, col(0x3d4450), M.stone, { phase: Math.PI / 4, top: false });
  k.cone(0, 0.63, 0, 0.035, 0.06, 4, col(0x3d4450), M.stone, Math.PI / 4);
  for (let i = 0; i < 4; i++) { k.push().at(0, 0, 0, (i * Math.PI) / 2 + Math.PI / 4); k.panel(0, 0.1, 0.05 - 0.0, 0.012, 0.45, C.rune, M.rune); k.pop(); }
  a.rune.push([0, 0.4, 0]);
  a.light.push([0, 0.4, 0.08]);
  return k.build();
});

defineModel('sunshrine', a => {
  const k = new Kit();
  for (let i = 0; i < 3; i++) k.cyl(0, -0.05 + i * 0.03, 0, 0.3 - i * 0.07, 0.3 - i * 0.07, 0.03, 12, C.marbleWarm, M.stone);
  k.cyl(0, 0.04, 0, 0.03, 0.03, 0.35, 8, C.marbleWarm, M.stone);
  k.push().at(0, 0.5, 0).rot(Math.PI / 2, 0, 0);
  k.cyl(0, -0.01, 0, 0.14, 0.14, 0.02, 16, col(0xffd36a), M.gold);
  for (let i = 0; i < 12; i++) { const an = (i / 12) * Math.PI * 2; k.push().at(Math.sin(an) * 0.18, 0, Math.cos(an) * 0.18, an); k.cone(0, -0.005, 0, 0.02, 0.01, 3, col(0xffd36a), M.gold); k.pop(); }
  k.pop();
  a.light.push([0, 0.5, 0.05]);
  a.seat.push([0.2, 0, 0.2], [-0.2, 0, 0.2]);
  return k.build();
});

defineModel('great_brazier', a => {
  const k = new Kit();
  k.cyl(0, -0.1, 0, 0.9, 0.8, 0.2, 12, C.basalt, M.stone);
  k.cyl(0, 0.1, 0, 0.35, 0.25, 0.4, 10, C.obsidian, M.obsidian);
  k.cyl(0, 0.5, 0, 0.75, 0.4, 0.3, 12, C.dracGold, M.gold, { topColor: col(0xff5a10), topMat: M.lava });
  for (let i = 0; i < 4; i++) { const an = (i / 4) * Math.PI * 2 + 0.4; k.push().at(Math.sin(an) * 0.8, 0, Math.cos(an) * 0.8, an); k.box(0, 0, 0, 0.12, 0.5, 0.12, C.obsidian2, M.obsidian); k.cone(0, 0.5, 0, 0.08, 0.2, 4, C.dracGold, M.gold); k.pop(); }
  a.fire.push([0, 0.85, 0], [0.3, 0.82, 0.1], [-0.25, 0.82, -0.2]);
  a.light.push([0, 1.1, 0]);
  a.smoke.push([0, 1.3, 0]);
  return k.build();
});

defineModel('icetemple', a => {
  const k = new Kit();
  k.cyl(0, -0.1, 0, 1.1, 1.1, 0.15, 12, col(0xd8ecf6), M.ice);
  for (let i = 0; i < 12; i++) {
    const an = (i / 12) * Math.PI * 2;
    const h = 0.7 + (i % 3) * 0.12;
    k.cyl(Math.sin(an) * 0.9, 0.05, Math.cos(an) * 0.9, 0.08, 0.06, h, 6, C.ice, M.ice);
    k.cone(Math.sin(an) * 0.9, 0.05 + h, Math.cos(an) * 0.9, 0.08, 0.2, 6, C.ice, M.ice);
  }
  k.blob(0, 0.05, 0, 0.7, 0.7, 0.7, C.ice, M.ice, 1, 0.04, 3);
  k.cone(0, 0.7, 0, 0.12, 0.8, 6, col(0xe6f7ff), M.ice);
  k.blob(0, 1.55, 0, 0.1, 0.18, 0.1, col(0x9ff0ff), M.rune, 1, 0, 7);
  a.rune.push([0, 1.55, 0]);
  a.light.push([0, 0.3, 0.8]);
  return k.build();
});

defineModel('drowned', a => {
  const k = new Kit();
  // half-sunken temple: platform tilted into the sea with columns
  k.push().at(0, -0.3, 0).rot(0.08, 0, 0.1);
  k.box(0, 0, 0, 1.6, 0.25, 1.1, col(0x7c8c86), M.stone);
  for (let i = 0; i < 8; i++) {
    const x = -0.65 + i * 0.185;
    for (const z of [-0.45, 0.45]) {
      const h = [0.8, 0.3, 0.8, 0.8, 0.45, 0.8, 0.15, 0.8][i];
      k.cyl(x, 0.25, z, 0.06, 0.055, h, 8, col(0x9aa9a2), M.stone);
    }
  }
  k.box(-0.2, 1.05, 0, 1.1, 0.1, 1.05, col(0x8a9a94), M.stone);
  k.push().at(0, 1.15, 0, Math.PI / 2); k.gable(0, 0, 0, 1.05, 0.3, 1.0, col(0x7c8c86), M.stone, 0.02); k.pop();
  k.cyl(0.5, 0.25, 0, 0.15, 0.12, 0.6, 8, col(0x3f8f86), M.metal);
  k.blob(0.5, 0.95, 0, 0.14, 0.16, 0.14, col(0x3f8f86), M.metal, 1, 0.1, 6);
  k.pop();
  k.blob(0.3, 0.0, 0.5, 0.2, 0.1, 0.2, col(0x4a6b4a), M.leaf, 1, 0.3, 3);
  a.rune.push([0.5, 0.7, 0]);
  a.light.push([0.5, 0.7, 0.2]);
  return k.build();
});

defineModel('pyramid', a => {
  const k = new Kit();
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const s = 1.5 - i * 0.22;
    k.box(0, -0.15 + i * 0.18, 0, s, 0.18 + (i === 0 ? 0.15 : 0), s, i % 2 ? col(0x8d8a6e) : col(0x7e7b62), M.stone);
  }
  for (let i = 0; i < 18; i++) k.box(0, -0.12 + i * 0.058, 0.76 - i * 0.041, 0.2, 0.06, 0.04, col(0x6f6c55), M.stone);
  k.box(0, 0.93, 0, 0.3, 0.2, 0.3, col(0x8d8a6e), M.stone);
  k.panel(0, 0.93, 0.152, 0.1, 0.12, col(0x0a0a0a), M.plain);
  k.panel(0, 1.08, 0.153, 0.2, 0.02, col(0x48ffc0), M.rune);
  for (let i = 0; i < 10; i++) { const an = i * 1.3; k.blob(Math.sin(an) * 0.6, 0.1 + (i % 4) * 0.15, Math.cos(an) * 0.6, 0.15, 0.1, 0.15, C.jungle, M.leaf, 1, 0.3, i); }
  a.rune.push([0, 1.08, 0.16]);
  a.light.push([0, 1.1, 0.2]);
  return k.build();
});

defineModel('wreck', a => {
  const k = new Kit();
  k.push().at(0, -0.05, 0).rot(0.35, 0.3, 0.5);
  const hull = col(0x4b3522);
  k.box(0, 0, 0, 0.26, 0.14, 0.8, hull, M.wood);
  k.box(0, 0.14, 0.05, 0.22, 0.02, 0.6, P.woodLight, M.wood);
  k.box(0, 0.14, 0.05, 0.012, 0.6, 0.012, P.timber, M.wood);
  k.box(0.1, 0.4, 0.05, 0.22, 0.18, 0.004, col(0xd9d0b8), M.cloth);
  k.pop();
  k.blob(-0.2, -0.05, 0.3, 0.15, 0.08, 0.12, P.stoneDark, M.stone, 1, 0.3, 2);
  k.blob(0.25, -0.05, -0.25, 0.12, 0.1, 0.12, P.stoneDark, M.stone, 1, 0.3, 4);
  return k.build();
});

defineModel('battlefield', a => {
  const k = new Kit();
  // broken catapult
  k.push().at(-0.3, 0, 0.1, 0.4);
  k.box(0, 0.02, 0, 0.14, 0.03, 0.22, P.wood, M.wood);
  k.push().at(0, 0.06, 0).rot(0.9, 0, 0.2); k.box(0, 0, 0, 0.014, 0.25, 0.014, P.wood, M.wood); k.pop();
  for (const x of [-0.07, 0.07]) for (const z of [-0.08, 0.08]) { k.push().at(x, 0.02, z).rot(0, 0, Math.PI / 2); k.cyl(0, -0.005, 0, 0.025, 0.025, 0.01, 6, P.timber, M.wood); k.pop(); }
  k.pop();
  // fallen banners and spears
  for (let i = 0; i < 6; i++) {
    k.push().at(0.1 + (i % 3) * 0.12, 0, -0.1 + Math.floor(i / 3) * 0.2, i).rot(0.3 + i * 0.1, 0, 0.2);
    k.box(0, 0, 0, 0.005, 0.14, 0.005, P.wood, M.wood);
    if (i % 2) k.box(0.018, 0.1, 0, 0.03, 0.04, 0.002, i % 4 === 1 ? P.blue : P.red, M.cloth);
    k.pop();
  }
  for (let i = 0; i < 5; i++) k.blob(-0.2 + i * 0.1, 0.005, -0.25 + (i % 2) * 0.1, 0.012, 0.012, 0.014, C.bone, M.plain, 0, 0.1, i);
  return k.build();
});

defineModel('mausoleum', a => {
  const k = new Kit();
  k.box(0, -0.08, 0, 0.3, 0.1, 0.3, C.crypt, M.stone);
  k.box(0, 0.02, 0, 0.24, 0.2, 0.24, C.grave, M.stone);
  for (const x of [-0.09, 0.09]) k.cyl(x, 0.02, 0.13, 0.015, 0.015, 0.2, 6, C.grave, M.stone);
  k.box(0, 0.22, 0.02, 0.28, 0.03, 0.28, C.crypt, M.stone);
  k.cyl(0, 0.25, 0, 0.1, 0.1, 0.06, 8, C.grave, M.stone, { top: false });
  k.blob(0, 0.31, 0, 0.1, 0.08, 0.1, C.crypt, M.stone, 1, 0.05, 2);
  k.panel(0, 0.02, 0.121, 0.07, 0.12, col(0x0c0f0c), M.plain);
  k.panel(0, 0.16, 0.122, 0.1, 0.012, col(0x39c46e), M.ghost);
  a.light.push([0, 0.12, 0.16]);
  return k.build();
});
