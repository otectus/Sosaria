// Valdren architecture: timber-framed houses, taverns, smithies, chapels, castles and farmsteads.

import { Kit, M, col, mulc } from './kit.js';
import { defineModel } from './registry.js';
import { mulberry32 } from '../core/noise.js';

export const P = {
  stone: col(0x9a9387), stoneMid: col(0x7f796f), stoneDark: col(0x5d5953), stoneWarm: col(0xa39680),
  timber: col(0x3a2819), wood: col(0x6b4a2f), woodLight: col(0x8f6c45),
  plaster: [col(0xe8dfc9), col(0xdccba7), col(0xd3d6cf), col(0xe6c99a), col(0xc9d0c2)],
  roofs: { clay: [col(0xa04a2e), col(0x8c3a26), col(0xb4603a)], slate: [col(0x4a5566), col(0x3e4758)], thatch: [col(0xb39150), col(0x9f8144)], royal: [col(0x2f4f8f)] },
  iron: col(0x2b2e34), bronze: col(0x9a6b35), gold: col(0xd9aa4c),
  blue: col(0x2a4f9e), blueDark: col(0x1c3670), red: col(0x9e2a2a), cream: col(0xe9dcbc),
  glass: col(0x28323d), door: col(0x4a3120), hay: col(0xc9a650), green: col(0x3d6a2c),
};

function windowRow(k, y, z, w, h, n, ry = 0, shutter = null) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    k.push().at(0, 0, 0, ry);
    k.panel(x, y, z + 0.002, 0.034, 0.042, P.glass, M.window);
    k.panel(x, y - 0.004, z + 0.003, 0.046, 0.006, P.timber, M.wood);
    k.panel(x, y, z + 0.0035, 0.003, 0.042, P.timber, M.wood);
    k.panel(x, y + 0.026, z + 0.0035, 0.034, 0.003, P.timber, M.wood);
    if (shutter) {
      k.panel(x - 0.029, y, z + 0.003, 0.018, 0.042, shutter, M.wood);
      k.panel(x + 0.029, y, z + 0.003, 0.018, 0.042, shutter, M.wood);
    }
    k.pop();
  }
}

function timberFrame(k, w, d, y0, h, color) {
  const t = 0.009;
  // corner posts and floor beams on front/back faces
  for (const z of [d / 2 + 0.002, -d / 2 - 0.002]) {
    for (const x of [-w / 2 + t / 2, w / 2 - t / 2, 0]) k.box(x, y0, z, t, h, 0.006, color, M.wood);
    k.box(0, y0, z, w, t, 0.006, color, M.wood);
    k.box(0, y0 + h - t, z, w, t, 0.006, color, M.wood);
    // diagonal braces
    for (const s of [-1, 1]) {
      k.push().at(s * w / 4, y0 + h / 2, z, 0).rot(0, 0, s * 0.75);
      k.box(0, -h * 0.42, 0, t * 0.8, h * 0.84, 0.006, color, M.wood);
      k.pop();
    }
  }
  for (const x of [w / 2 + 0.002, -w / 2 - 0.002]) {
    k.push().at(x, 0, 0, Math.PI / 2);
    for (const xx of [-d / 2 + t / 2, d / 2 - t / 2]) k.box(xx, y0, 0, t, h, 0.006, color, M.wood);
    k.box(0, y0, 0, d, t, 0.006, color, M.wood);
    k.pop();
  }
}

function chimney(k, a, x, y, z, h) {
  k.box(x, y, z, 0.04, h, 0.04, P.stoneMid, M.stone);
  k.box(x, y + h, z, 0.048, 0.012, 0.048, P.stoneDark, M.stone);
  a.smoke.push([x, y + h + 0.015, z]);
}

// Parametric timber house.
function house(a, o) {
  const k = new Kit();
  const { w, d, h1, h2 = 0, roofH, roof, plaster, stoneGround = false, jetty = 0.012, chimneyAt = 1, shutter = null, sign = false } = o;
  const base = 0.025;
  k.box(0, -0.14, 0, w + 0.02, 0.14 + base, d + 0.02, P.stoneMid, M.stone);
  k.box(0, base, 0, w, h1, d, stoneGround ? P.stone : plaster, stoneGround ? M.stone : M.plaster);
  let top = base + h1;
  if (!stoneGround) timberFrame(k, w, d, base, h1, P.timber);
  let W = w, D = d;
  if (h2) {
    W = w + jetty * 2; D = d + jetty * 2;
    k.box(0, top, 0, W, h2, D, plaster, M.plaster);
    timberFrame(k, W, D, top, h2, P.timber);
    windowRow(k, top + h2 * 0.35, D / 2, W, 0.04, Math.max(1, Math.round(W / 0.1)), 0, shutter);
    windowRow(k, top + h2 * 0.35, D / 2, W, 0.04, Math.max(1, Math.round(W / 0.12)), Math.PI, shutter);
    top += h2;
  }
  // ground floor: door and windows
  k.panel(0, base, d / 2 + 0.003, 0.05, 0.085, P.door, M.wood);
  k.panel(0, base + 0.085, d / 2 + 0.004, 0.06, 0.008, P.timber, M.wood);
  // Door surrounds, thresholds and forged hinges remain in the shared building batch.
  for (const x of [-0.028, 0.028]) k.box(x, base, d / 2 + 0.004, 0.006, 0.085, 0.009, P.timber, M.wood);
  k.box(0, base - 0.009, d / 2 + 0.014, 0.068, 0.009, 0.032, P.stoneWarm, M.stone);
  for (const y of [0.021, 0.067]) k.panel(-0.013, base + y, d / 2 + 0.004, 0.024, 0.004, P.iron, M.metal);
  k.box(0.016, base + 0.037, d / 2 + 0.007, 0.004, 0.007, 0.005, P.bronze, M.metal);
  const nw = Math.max(0, Math.round(w / 0.1) - 1);
  for (let i = 0; i < nw; i++) {
    const x = (i % 2 === 0 ? -1 : 1) * (0.06 + Math.floor(i / 2) * 0.08);
    if (Math.abs(x) < w / 2 - 0.02) k.panel(x, base + 0.038, d / 2 + 0.002, 0.032, 0.036, P.glass, M.window);
  }
  windowRow(k, base + 0.038, d / 2, w, 0.036, Math.max(1, Math.round(w / 0.12)), Math.PI);
  a.door = [0, 0, d / 2 + 0.04];
  // roof
  const rc = P.roofs[roof][o.roofVar % P.roofs[roof].length];
  const rm = roof === 'thatch' ? M.thatch : M.tile;
  k.gable(0, top, 0, W, roofH, D, rc, rm, roof === 'thatch' ? 0.03 : 0.02, plaster, M.plaster);
  if (roof === 'thatch') k.box(0, top + roofH - 0.01, 0, W + 0.05, 0.02, 0.025, mulc(rc, 0.75), M.thatch);
  else {
    k.push().at(-W / 2 - 0.02, top + roofH, 0).rot(0, 0, -Math.PI / 2);
    k.cyl(0, 0, 0, 0.008, 0.008, W + 0.04, 6, mulc(rc, 1.12), rm);
    k.pop();
  }
  if (chimneyAt) chimney(k, a, W / 2 * 0.55 * chimneyAt, top + roofH * 0.3, -D * 0.18, roofH * 0.9);
  if (sign) {
    k.box(w / 2 * 0.6, base + h1 * 0.8, d / 2 + 0.04, 0.004, 0.004, 0.07, P.iron, M.metal);
    k.box(w / 2 * 0.6, base + h1 * 0.55, d / 2 + 0.06, 0.004, 0.045, 0.045, P.blue, M.cloth);
    a.light.push([w / 2 * 0.2, base + h1 * 0.85, d / 2 + 0.02]);
  }
  return k.build();
}

// ---- House variants ----
const HOUSE_SPECS = [];
{
  const rnd = mulberry32(42);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < 14; i++) {
    const big = i >= 8;
    const w = big ? 0.22 + rnd() * 0.08 : 0.15 + rnd() * 0.07;
    HOUSE_SPECS.push({
      w, d: w * (0.62 + rnd() * 0.25), h1: 0.09 + rnd() * 0.02, h2: big || rnd() < 0.45 ? 0.075 + rnd() * 0.02 : 0,
      roofH: 0.07 + rnd() * 0.05, roof: pick(['clay', 'clay', 'slate', 'thatch']), roofVar: Math.floor(rnd() * 3),
      plaster: pick(P.plaster), stoneGround: rnd() < 0.3, shutter: rnd() < 0.5 ? pick([P.blue, P.green, P.red, P.wood]) : null,
      chimneyAt: rnd() < 0.8 ? (rnd() < 0.5 ? 1 : -1) : 0,
    });
  }
}
HOUSE_SPECS.forEach((s, i) => defineModel('house' + i, a => house(a, s)));
export const HOUSE_COUNT = HOUSE_SPECS.length;

// Rural cottages: thatched, single storey.
for (let i = 0; i < 5; i++) {
  defineModel('cottage' + i, a => house(a, { w: 0.16 + i * 0.012, d: 0.12, h1: 0.085, roofH: 0.085, roof: 'thatch', roofVar: i, plaster: P.plaster[i % 5], chimneyAt: i % 2 ? 1 : -1, shutter: i % 2 ? P.green : null }));
}

defineModel('tavern', a => {
  const g = house(a, { w: 0.34, d: 0.22, h1: 0.1, h2: 0.09, roofH: 0.11, roof: 'clay', roofVar: 1, plaster: P.plaster[3], sign: true, chimneyAt: 1, shutter: P.red });
  a.light.push([-0.12, 0.1, 0.14]);
  a.seat.push([0.12, 0, 0.2], [-0.1, 0, 0.21], [0.02, 0, 0.23]);
  return g;
});

defineModel('smithy', a => {
  const k = new Kit();
  k.box(0, -0.12, 0, 0.3, 0.14, 0.22, P.stoneMid, M.stone);
  // back room
  k.box(0.04, 0.02, -0.04, 0.22, 0.1, 0.12, P.stone, M.stone);
  k.gable(0.04, 0.12, -0.04, 0.22, 0.06, 0.12, P.roofs.slate[0], M.tile, 0.015, P.stone, M.stone);
  // open forge shed with posts
  for (const x of [-0.13, 0.13]) for (const z of [0.02, 0.1]) k.box(x, 0.02, z, 0.014, 0.12, 0.014, P.timber, M.wood);
  k.push().at(0, 0.14, 0.06).rot(-0.25, 0, 0);
  k.box(0, 0, 0, 0.3, 0.012, 0.12, P.roofs.clay[1], M.tile);
  k.pop();
  // forge hearth and chimney
  k.box(-0.08, 0.02, 0.03, 0.08, 0.05, 0.06, P.stoneDark, M.stone);
  k.box(-0.08, 0.07, 0.03, 0.05, 0.005, 0.04, col(0xff6a1a), M.fire);
  k.box(-0.1, 0.07, -0.01, 0.045, 0.2, 0.045, P.stoneMid, M.stone);
  a.smoke.push([-0.1, 0.28, -0.01]);
  a.forge.push([-0.08, 0.08, 0.03]);
  a.fire.push([-0.08, 0.075, 0.03]);
  // anvil
  k.box(0.04, 0.02, 0.08, 0.02, 0.025, 0.018, P.iron, M.metal);
  k.box(0.04, 0.045, 0.08, 0.045, 0.012, 0.02, P.iron, M.metal);
  a.work.push([0.04, 0, 0.115]);
  // racks of tools
  k.box(0.12, 0.03, -0.02, 0.01, 0.06, 0.06, P.wood, M.wood);
  a.door = [0.0, 0, 0.18];
  return k.build();
});

defineModel('chapel', a => {
  const k = new Kit();
  k.box(0, -0.12, 0, 0.2, 0.14, 0.4, P.stoneMid, M.stone);
  k.box(0, 0.02, 0, 0.18, 0.16, 0.38, P.stone, M.stone);
  k.push().at(0, 0, 0, Math.PI / 2);
  k.gable(0, 0.18, 0, 0.38, 0.12, 0.18, P.roofs.slate[0], M.tile, 0.02, P.stone, M.stone);
  k.pop();
  // tower at the front
  k.box(0, 0.02, 0.2, 0.1, 0.34, 0.1, P.stoneWarm, M.stone);
  k.pyramid(0, 0.36, 0.2, 0.1, 0.18, 0.1, P.roofs.slate[1], M.tile, 0.01);
  k.box(0, 0.54, 0.2, 0.006, 0.05, 0.006, P.gold, M.gold);
  k.box(0, 0.565, 0.2, 0.03, 0.006, 0.006, P.gold, M.gold);
  k.panel(0, 0.25, 0.253, 0.035, 0.05, P.iron, M.metal);
  // windows along the nave
  for (const z of [-0.12, -0.02, 0.08]) {
    k.push().at(0.091, 0, z, Math.PI / 2); k.panel(0, 0.06, 0.001, 0.03, 0.08, col(0x4466aa), M.window); k.pop();
    k.push().at(-0.091, 0, z, -Math.PI / 2); k.panel(0, 0.06, 0.001, 0.03, 0.08, col(0x4466aa), M.window); k.pop();
  }
  k.panel(0, 0.02, 0.252, 0.05, 0.09, P.door, M.wood);
  a.door = [0, 0, 0.3];
  a.light.push([0, 0.1, 0.27]);
  return k.build();
});

defineModel('cathedral', a => {
  const k = new Kit();
  const L = 1.0, W = 0.34, H = 0.36;
  k.box(0, -0.14, 0, W + 0.1, 0.16, L + 0.1, P.stoneMid, M.stone);
  k.box(0, 0.02, 0, W, H, L, P.stoneWarm, M.stone);
  // aisles
  for (const s of [-1, 1]) {
    k.box(s * (W / 2 + 0.06), 0.02, 0, 0.12, H * 0.55, L * 0.9, P.stone, M.stone);
    k.push().at(s * (W / 2 + 0.06), 0.02 + H * 0.55, 0).rot(0, 0, s * 0.45);
    k.box(0, 0, 0, 0.15, 0.01, L * 0.9, P.roofs.slate[1], M.tile);
    k.pop();
    for (let i = 0; i < 6; i++) {
      const z = -L * 0.4 + i * (L * 0.8 / 5);
      k.box(s * (W / 2 + 0.13), 0.02, z, 0.03, H * 0.75, 0.035, P.stone, M.stone);
      k.push().at(s * (W / 2 + 0.001), 0, z, s * Math.PI / 2); k.panel(0, H * 0.62, 0, 0.04, 0.12, col(0x5577bb), M.window); k.pop();
    }
  }
  k.push().at(0, 0, 0, Math.PI / 2);
  k.gable(0, 0.02 + H, 0, L, 0.2, W, P.roofs.slate[0], M.tile, 0.02, P.stoneWarm, M.stone);
  k.pop();
  // twin towers at the facade
  for (const s of [-1, 1]) {
    k.box(s * 0.13, 0.02, L / 2 + 0.02, 0.13, H + 0.34, 0.13, P.stoneWarm, M.stone);
    k.pyramid(s * 0.13, 0.02 + H + 0.34, L / 2 + 0.02, 0.13, 0.28, 0.13, P.roofs.slate[1], M.tile, 0.012);
    k.box(s * 0.13, H + 0.64, L / 2 + 0.02, 0.006, 0.07, 0.006, P.gold, M.gold);
    a.banner.push([s * 0.13, H + 0.7, L / 2 + 0.02, 0.22]);
  }
  // rose window and portal
  k.cyl(0, 0.02 + H * 0.72, L / 2 + 0.002, 0.07, 0.07, 0.002, 12, col(0x6a5acd), M.window, { top: false });
  k.push().at(0, 0.02 + H * 0.72, L / 2 + 0.004).rot(Math.PI / 2, 0, 0); k.cyl(0, 0, 0, 0.065, 0.065, 0.004, 12, col(0x5577cc), M.window); k.pop();
  k.panel(0, 0.02, L / 2 + 0.003, 0.08, 0.14, P.door, M.wood);
  // apse
  k.cyl(0, 0.02, -L / 2, W / 2, W / 2, H * 0.8, 8, P.stoneWarm, M.stone, { top: false });
  k.cone(0, 0.02 + H * 0.8, -L / 2, W / 2 + 0.02, 0.14, 8, P.roofs.slate[0], M.tile);
  // central spire
  k.box(0, H + 0.02, 0.05, 0.08, 0.14, 0.08, P.stoneWarm, M.stone);
  k.cone(0, H + 0.16, 0.05, 0.06, 0.32, 8, P.roofs.slate[1], M.tile);
  a.door = [0, 0, L / 2 + 0.08];
  a.light.push([0, 0.12, L / 2 + 0.05], [0, 0.3, L / 2 + 0.02]);
  return k.build();
});

function towerModel(a, r, h, roofType = 'cone', color = P.stone) {
  const k = new Kit();
  k.cyl(0, -0.14, 0, r + 0.015, r + 0.015, 0.16, 10, P.stoneMid, M.stone);
  k.cyl(0, 0.02, 0, r, r * 0.94, h, 10, color, M.stone, { top: roofType !== 'cone' });
  if (roofType === 'cone') {
    k.cyl(0, 0.02 + h, 0, r * 0.94 + 0.012, r * 0.94 + 0.012, 0.02, 10, P.stoneMid, M.stone);
    k.cone(0, 0.04 + h, 0, r + 0.025, r * 2.6, 10, P.roofs.royal[0], M.tile);
    a.banner.push([0, 0.04 + h + r * 2.6, 0, 0.16]);
  } else {
    // battlements
    for (let i = 0; i < 10; i++) {
      const an = (i / 10) * Math.PI * 2;
      k.box(Math.sin(an) * r * 0.9, 0.02 + h, Math.cos(an) * r * 0.9, 0.028, 0.035, 0.028, color, M.stone);
    }
    a.banner.push([0, 0.02 + h + 0.12, 0, 0.16]);
    k.box(0, 0.02 + h, 0, 0.005, 0.12, 0.005, P.wood, M.wood);
  }
  // arrow slits
  for (let i = 0; i < 4; i++) {
    const an = (i / 4) * Math.PI * 2 + 0.3;
    k.push().at(Math.sin(an) * (r * 0.97 + 0.002), 0, Math.cos(an) * (r * 0.97 + 0.002), an);
    k.panel(0, h * 0.55, 0, 0.012, 0.05, col(0x1a1a1a), M.window);
    k.panel(0, h * 0.25, 0, 0.012, 0.04, col(0x1a1a1a), M.window);
    k.pop();
  }
  a.light.push([0, h * 0.6, r + 0.02]);
  return k.build();
}

defineModel('tower', a => towerModel(a, 0.1, 0.42, 'cone'));
defineModel('tower_big', a => towerModel(a, 0.13, 0.55, 'cone'));
defineModel('tower_flat', a => towerModel(a, 0.1, 0.38, 'flat'));

defineModel('keep', a => {
  const k = new Kit();
  const W = 0.44, H = 0.72;
  k.box(0, -0.16, 0, W + 0.06, 0.18, W + 0.06, P.stoneMid, M.stone);
  k.box(0, 0.02, 0, W, H, W, P.stone, M.stone);
  // buttresses
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * W / 2, 0.02, sz * W / 2, 0.08, H * 0.4, 0.08, P.stoneMid, M.stone);
  // battlements
  for (const [x0, z0, x1, z1] of [[-W / 2, W / 2, W / 2, W / 2], [W / 2, -W / 2, -W / 2, -W / 2], [W / 2, W / 2, W / 2, -W / 2], [-W / 2, -W / 2, -W / 2, W / 2]]) {
    k.merlons(x0 * 0.96, z0 * 0.96, x1 * 0.96, z1 * 0.96, 0.02 + H, 0.03, P.stone, 0.035, 0.03);
  }
  // corner turrets
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.cyl(sx * W / 2, 0.02 + H * 0.7, sz * W / 2, 0.06, 0.06, H * 0.45, 8, P.stoneWarm, M.stone, { top: false });
    k.cone(sx * W / 2, 0.02 + H * 1.15, sz * W / 2, 0.075, 0.2, 8, P.roofs.royal[0], M.tile);
    a.banner.push([sx * W / 2, 0.02 + H * 1.15 + 0.2, sz * W / 2, 0.14]);
  }
  // central roof
  k.pyramid(0, 0.02 + H, 0, W * 0.72, 0.22, W * 0.72, P.roofs.slate[0], M.tile, 0);
  a.banner.push([0, 0.02 + H + 0.32, 0, 0.26]);
  k.box(0, H + 0.02, 0, 0.007, 0.3, 0.007, P.wood, M.wood);
  // windows and great door
  for (let f = 0; f < 3; f++) {
    for (let s = 0; s < 4; s++) {
      k.push().at(0, 0, 0, (s * Math.PI) / 2);
      for (const x of [-0.12, 0, 0.12]) k.panel(x, 0.2 + f * 0.17, W / 2 + 0.002, 0.03, 0.06, P.glass, M.window);
      k.pop();
    }
  }
  k.panel(0, 0.02, W / 2 + 0.003, 0.09, 0.13, P.door, M.wood);
  k.panel(0, 0.2, W / 2 + 0.004, 0.14, 0.02, P.blue, M.cloth);
  // heraldic banners on the facade
  for (const x of [-0.13, 0.13]) {
    k.panel(x, 0.32, W / 2 + 0.004, 0.06, 0.2, P.blue, M.cloth);
    k.panel(x, 0.42, W / 2 + 0.005, 0.03, 0.03, P.gold, M.gold);
  }
  a.door = [0, 0, W / 2 + 0.08];
  a.light.push([-0.08, 0.14, W / 2 + 0.03], [0.08, 0.14, W / 2 + 0.03]);
  a.smoke.push([W / 2 * 0.6, H + 0.1, -W / 2 * 0.6]);
  return k.build();
});

// Straight curtain wall segment of length L along x, walkway and crenellations.
defineModel('wall', a => {
  const k = new Kit();
  const L = 0.5, H = 0.24, T = 0.07;
  k.box(0, -0.16, 0, L, 0.18, T + 0.03, P.stoneMid, M.stone);
  k.box(0, 0.02, 0, L, H, T, P.stone, M.stone);
  k.merlons(-L / 2, T / 2 - 0.012, L / 2, T / 2 - 0.012, 0.02 + H, 0.022, P.stone, 0.03, 0.028);
  k.merlons(-L / 2, -T / 2 + 0.012, L / 2, -T / 2 + 0.012, 0.02 + H, 0.02, P.stone, 0.025, 0.035);
  return { geometry: k.build(), footprint: [L, T] };
});

defineModel('gatehouse', a => {
  const k = new Kit();
  const H = 0.36;
  for (const s of [-1, 1]) {
    k.box(s * 0.13, -0.16, 0, 0.14, 0.18, 0.18, P.stoneMid, M.stone);
    k.box(s * 0.13, 0.02, 0, 0.12, H, 0.16, P.stone, M.stone);
    k.merlons(s * 0.13 - 0.06, 0.07, s * 0.13 + 0.06, 0.07, 0.02 + H, 0.02, P.stone, 0.028, 0.02);
    k.merlons(s * 0.13 - 0.06, -0.07, s * 0.13 + 0.06, -0.07, 0.02 + H, 0.02, P.stone, 0.028, 0.02);
    k.pyramid(s * 0.13, 0.02 + H, 0, 0.1, 0.12, 0.14, P.roofs.royal[0], M.tile, 0.01);
    k.panel(s * 0.13, 0.2, 0.082, 0.05, 0.12, P.blue, M.cloth);
    a.light.push([s * 0.075, 0.12, 0.1]);
  }
  // arch bridge over the passage
  k.box(0, 0.18, 0, 0.14, 0.14, 0.16, P.stone, M.stone);
  k.box(0, 0.32, 0, 0.14, 0.02, 0.16, P.stoneMid, M.stone);
  k.panel(0, 0.13, 0.081, 0.12, 0.05, P.iron, M.metal); // portcullis
  a.banner.push([-0.13, 0.52, 0, 0.16], [0.13, 0.52, 0, 0.16]);
  return { geometry: k.build(), footprint: [0.4, 0.18] };
});

defineModel('windmill', a => {
  const k = new Kit();
  k.cyl(0, -0.12, 0, 0.1, 0.1, 0.14, 8, P.stoneMid, M.stone);
  k.cyl(0, 0.02, 0, 0.09, 0.065, 0.34, 8, P.plaster[0], M.plaster, { top: false });
  k.cone(0, 0.36, 0, 0.085, 0.12, 8, P.roofs.thatch[0], M.thatch);
  k.panel(0, 0.02, 0.087, 0.04, 0.07, P.door, M.wood);
  k.push().at(0, 0, 0.078, 0); k.panel(0, 0.18, 0.001, 0.025, 0.03, P.glass, M.window); k.pop();
  k.box(0, 0.36, 0.07, 0.03, 0.03, 0.06, P.wood, M.wood);
  a.sails.push([0, 0.375, 0.105, 0.26]);
  a.door = [0, 0, 0.15];
  return k.build();
});

defineModel('watermill', a => {
  const g = house(a, { w: 0.24, d: 0.18, h1: 0.1, h2: 0.07, roofH: 0.09, roof: 'thatch', roofVar: 0, plaster: P.plaster[1], chimneyAt: 0, stoneGround: true });
  a.wheel.push([0.15, 0.08, 0, 0.1]);
  return g;
});

defineModel('barn', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.3, 0.12, 0.2, P.stoneMid, M.stone);
  k.box(0, 0.02, 0, 0.28, 0.13, 0.18, col(0x7a3b2a), M.wood);
  k.gable(0, 0.15, 0, 0.28, 0.12, 0.18, P.roofs.thatch[1], M.thatch, 0.025, col(0x7a3b2a), M.wood);
  k.panel(0, 0.02, 0.092, 0.09, 0.1, P.wood, M.wood);
  k.panel(0, 0.12, 0.093, 0.1, 0.008, P.timber, M.wood);
  a.door = [0, 0, 0.16];
  a.work.push([0.1, 0, 0.14]);
  return k.build();
});

defineModel('farmhouse', a => house(a, { w: 0.2, d: 0.14, h1: 0.09, roofH: 0.09, roof: 'thatch', roofVar: 1, plaster: P.plaster[0], chimneyAt: 1, shutter: P.green }));

defineModel('granary', a => {
  const k = new Kit();
  for (const x of [-0.05, 0.05]) for (const z of [-0.04, 0.04]) k.box(x, 0, z, 0.02, 0.05, 0.02, P.stoneMid, M.stone);
  k.box(0, 0.05, 0, 0.14, 0.1, 0.11, P.wood, M.wood);
  k.gable(0, 0.15, 0, 0.14, 0.07, 0.11, P.roofs.thatch[0], M.thatch, 0.02, P.wood, M.wood);
  return k.build();
});

defineModel('stall', a => {
  const k = new Kit();
  const r = mulberry32(7);
  for (const x of [-0.06, 0.06]) for (const z of [-0.04, 0.04]) k.box(x, 0, z, 0.008, 0.09, 0.008, P.wood, M.wood);
  k.box(0, 0.04, 0.02, 0.13, 0.012, 0.06, P.woodLight, M.wood);
  // goods
  const goods = [col(0xc0392b), col(0xe67e22), col(0x7fb03a), col(0xd9b44a), col(0x8e5a3a)];
  for (let i = 0; i < 5; i++) k.box(-0.05 + i * 0.025, 0.052, 0.02, 0.018, 0.012, 0.03, goods[i], M.plain);
  k.push().at(0, 0.09, 0).rot(-0.22, 0, 0);
  for (let i = 0; i < 4; i++) k.box(-0.06 + i * 0.04 + 0.01, 0, 0, 0.04, 0.006, 0.12, i % 2 ? P.cream : P.blue, M.cloth);
  k.pop();
  a.work.push([0, 0, -0.07]);
  return k.build();
});
defineModel('stall_red', a => {
  const k = new Kit();
  for (const x of [-0.06, 0.06]) for (const z of [-0.04, 0.04]) k.box(x, 0, z, 0.008, 0.09, 0.008, P.wood, M.wood);
  k.box(0, 0.04, 0.02, 0.13, 0.012, 0.06, P.woodLight, M.wood);
  for (let i = 0; i < 4; i++) k.blob(-0.045 + i * 0.03, 0.06, 0.02, 0.012, 0.01, 0.012, [col(0x2e8b57), col(0xd35400), col(0xf1c40f), col(0x8e44ad)][i], M.plain, 0, 0.1, i);
  k.push().at(0, 0.09, 0).rot(-0.22, 0, 0);
  for (let i = 0; i < 4; i++) k.box(-0.06 + i * 0.04 + 0.01, 0, 0, 0.04, 0.006, 0.12, i % 2 ? P.cream : P.red, M.cloth);
  k.pop();
  a.work.push([0, 0, -0.07]);
  return k.build();
});

defineModel('well', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.045, 0.045, 0.04, 10, P.stone, M.stone, { topColor: col(0x0e1a22), topMat: M.plain });
  for (const x of [-0.04, 0.04]) k.box(x, 0.04, 0, 0.008, 0.07, 0.008, P.wood, M.wood);
  k.gable(0, 0.105, 0, 0.1, 0.035, 0.07, P.roofs.clay[0], M.tile, 0.01);
  k.box(0, 0.08, 0, 0.08, 0.006, 0.006, P.wood, M.wood);
  a.work.push([0.07, 0, 0]);
  return k.build();
});

defineModel('fountain', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.16, 0.16, 0.035, 14, P.stoneWarm, M.stone, { topColor: col(0x2a6f8a), topMat: M.water });
  k.cyl(0, 0.035, 0, 0.03, 0.025, 0.1, 8, P.stone, M.stone);
  k.cyl(0, 0.1, 0, 0.07, 0.05, 0.02, 10, P.stoneWarm, M.stone, { topColor: col(0x2a6f8a), topMat: M.water });
  k.cyl(0, 0.12, 0, 0.012, 0.012, 0.06, 6, P.bronze, M.metal);
  k.blob(0, 0.19, 0, 0.02, 0.02, 0.02, P.bronze, M.metal, 0, 0, 3);
  a.work.push([0.2, 0, 0], [-0.2, 0, 0], [0, 0, 0.2]);
  return k.build();
});

defineModel('statue_king', a => {
  const k = new Kit();
  k.box(0, 0, 0, 0.1, 0.06, 0.1, P.stoneWarm, M.stone);
  k.box(0, 0.06, 0, 0.08, 0.02, 0.08, P.stone, M.stone);
  k.cyl(0, 0.08, 0, 0.025, 0.02, 0.1, 6, P.bronze, M.metal);
  k.blob(0, 0.2, 0, 0.018, 0.02, 0.018, P.bronze, M.metal, 0, 0, 1);
  k.box(0.03, 0.08, 0.0, 0.008, 0.14, 0.008, P.bronze, M.metal);
  k.cone(0, 0.215, 0, 0.018, 0.02, 5, P.gold, M.gold);
  return k.build();
});

defineModel('lamppost', a => {
  const k = new Kit();
  k.box(0, 0, 0, 0.008, 0.1, 0.008, P.iron, M.metal);
  k.box(0, 0.1, 0, 0.02, 0.022, 0.02, col(0x5a4a30), M.window);
  k.pyramid(0, 0.122, 0, 0.024, 0.012, 0.024, P.iron, M.metal, 0);
  a.light.push([0, 0.11, 0]);
  return k.build();
});

defineModel('haystack', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.05, 0.045, 0.04, 8, P.hay, M.thatch);
  k.cone(0, 0.04, 0, 0.047, 0.05, 8, P.hay, M.thatch);
  return k.build();
});

defineModel('fence', a => {
  const k = new Kit();
  for (const x of [-0.12, -0.04, 0.04, 0.12]) k.box(x, 0, 0, 0.008, 0.045, 0.008, P.wood, M.wood);
  k.box(0, 0.02, 0, 0.26, 0.006, 0.004, P.woodLight, M.wood);
  k.box(0, 0.036, 0, 0.26, 0.006, 0.004, P.woodLight, M.wood);
  return { geometry: k.build(), footprint: [0.26, 0.01] };
});

defineModel('barrels', a => {
  const k = new Kit();
  k.cyl(0, 0, 0, 0.018, 0.018, 0.04, 7, P.wood, M.wood);
  k.cyl(0.035, 0, 0.01, 0.018, 0.018, 0.04, 7, P.wood, M.wood);
  k.cyl(0.015, 0.04, 0.005, 0.018, 0.018, 0.04, 7, P.wood, M.wood);
  k.box(-0.03, 0, 0.03, 0.035, 0.03, 0.03, P.woodLight, M.wood);
  return k.build();
});

defineModel('cart', a => {
  const k = new Kit();
  k.box(0, 0.03, 0, 0.06, 0.025, 0.1, P.woodLight, M.wood);
  for (const x of [-0.035, 0.035]) { k.push().at(x, 0.025, 0, 0).rot(0, 0, Math.PI / 2); k.cyl(0, -0.004, 0, 0.025, 0.025, 0.008, 8, P.wood, M.wood); k.pop(); }
  k.box(0, 0.035, 0.09, 0.006, 0.006, 0.09, P.wood, M.wood);
  k.blob(0, 0.07, 0, 0.025, 0.018, 0.04, P.hay, M.thatch, 0, 0.2, 5);
  return k.build();
});

defineModel('dock', a => {
  const k = new Kit();
  const L = 0.6;
  for (let i = 0; i < 4; i++) for (const x of [-0.05, 0.05]) k.box(x, -0.5, i * L / 3 - L / 2 + 0.02, 0.014, 0.56, 0.014, P.timber, M.wood);
  k.box(0, 0.05, 0, 0.13, 0.012, L, P.woodLight, M.wood);
  for (let i = 0; i < 8; i++) k.box(0, 0.062, -L / 2 + (i + 0.5) * L / 8, 0.13, 0.002, 0.004, P.timber, M.wood);
  a.work.push([0.03, 0.06, L / 2 - 0.04]);
  a.light.push([0.06, 0.12, L / 2 - 0.02]);
  k.box(0.06, 0.06, L / 2 - 0.02, 0.006, 0.05, 0.006, P.wood, M.wood);
  return { geometry: k.build(), footprint: [0.13, L] };
});

defineModel('lighthouse', a => {
  const k = new Kit();
  k.cyl(0, -0.12, 0, 0.13, 0.13, 0.14, 10, P.stoneMid, M.stone);
  for (let i = 0; i < 5; i++) k.cyl(0, 0.02 + i * 0.16, 0, 0.1 - i * 0.012, 0.1 - (i + 1) * 0.012, 0.16, 10, i % 2 ? P.red : P.cream, M.plaster, { top: false });
  k.cyl(0, 0.82, 0, 0.07, 0.07, 0.015, 10, P.iron, M.metal);
  k.cyl(0, 0.835, 0, 0.045, 0.045, 0.07, 8, col(0xffe6a0), M.window, { top: false });
  k.cone(0, 0.905, 0, 0.06, 0.07, 8, P.iron, M.metal);
  a.beam.push([0, 0.87, 0]);
  a.light.push([0, 0.87, 0]);
  k.panel(0, 0.02, 0.101, 0.04, 0.07, P.door, M.wood);
  a.door = [0, 0, 0.16];
  return k.build();
});

defineModel('abbey', a => {
  const k = new Kit();
  // cloister square with church on one side
  k.box(0, -0.12, 0, 0.62, 0.14, 0.62, P.stoneMid, M.stone);
  for (const [x, z, w, d] of [[0, -0.25, 0.6, 0.12], [-0.25, 0.05, 0.12, 0.48], [0.25, 0.05, 0.12, 0.48], [0, 0.25, 0.36, 0.12]]) {
    k.box(x, 0.02, z, w, 0.14, d, P.stoneWarm, M.stone);
    if (w > d) k.gable(x, 0.16, z, w, 0.08, d, P.roofs.slate[0], M.tile, 0.015, P.stoneWarm, M.stone);
    else { k.push().at(x, 0, z, Math.PI / 2); k.gable(0, 0.16, 0, d, 0.08, w, P.roofs.slate[0], M.tile, 0.015, P.stoneWarm, M.stone); k.pop(); }
  }
  k.box(0.22, 0.02, -0.25, 0.1, 0.42, 0.1, P.stoneWarm, M.stone);
  k.pyramid(0.22, 0.44, -0.25, 0.1, 0.16, 0.1, P.roofs.slate[1], M.tile, 0.01);
  k.box(0, 0.02, 0, 0.3, 0.004, 0.3, P.green, M.leaf);
  k.cyl(0, 0.02, 0, 0.04, 0.04, 0.03, 8, P.stone, M.stone);
  for (let i = 0; i < 6; i++) { k.push().at(-0.12 + i * 0.05, 0, -0.19, 0); k.panel(0, 0.07, 0.001, 0.02, 0.05, col(0x6688bb), M.window); k.pop(); }
  a.door = [0, 0, 0.36];
  a.smoke.push([-0.25, 0.3, 0.2]);
  a.light.push([0, 0.1, 0.33], [0.22, 0.35, -0.19]);
  a.seat.push([0.1, 0.02, 0.08], [-0.08, 0.02, -0.06]);
  return k.build();
});

defineModel('guardtower', a => {
  const k = new Kit();
  for (const x of [-0.05, 0.05]) for (const z of [-0.05, 0.05]) k.box(x, 0, z, 0.016, 0.28, 0.016, P.timber, M.wood);
  k.box(0, 0.28, 0, 0.15, 0.015, 0.15, P.woodLight, M.wood);
  for (const s of [-1, 1]) { k.box(0, 0.295, s * 0.07, 0.15, 0.04, 0.008, P.wood, M.wood); k.box(s * 0.07, 0.295, 0, 0.008, 0.04, 0.15, P.wood, M.wood); }
  k.pyramid(0, 0.35, 0, 0.15, 0.09, 0.15, P.roofs.thatch[1], M.thatch, 0.01);
  for (const x of [-0.05, 0.05]) for (const z of [-0.05, 0.05]) k.box(x, 0.3, z, 0.01, 0.05, 0.01, P.timber, M.wood);
  a.light.push([0, 0.32, 0]);
  a.banner.push([0.07, 0.48, 0.07, 0.14]);
  return k.build();
});

defineModel('stable', a => {
  const k = new Kit();
  k.box(0, -0.1, 0, 0.32, 0.12, 0.18, P.stoneMid, M.stone);
  k.box(0, 0.02, -0.03, 0.3, 0.1, 0.1, P.wood, M.wood);
  for (let i = 0; i < 4; i++) k.box(-0.12 + i * 0.08, 0.02, 0.05, 0.01, 0.1, 0.01, P.timber, M.wood);
  k.push().at(0, 0.12, 0.0).rot(-0.28, 0, 0); k.box(0, 0, 0, 0.32, 0.01, 0.2, P.roofs.thatch[0], M.thatch); k.pop();
  a.work.push([0.05, 0, 0.1]);
  return k.build();
});

// Construction site stages for a new tower in the capital.
for (let s = 0; s < 4; s++) {
  defineModel('construct' + s, a => {
    const k = new Kit();
    k.box(0, -0.1, 0, 0.36, 0.12, 0.36, P.stoneMid, M.stone);
    const h = [0.04, 0.16, 0.3, 0.44][s];
    k.box(0, 0.02, 0, 0.26, h, 0.26, P.stoneWarm, M.stone);
    // scaffolding
    for (const x of [-0.16, 0.16]) for (const z of [-0.16, 0.16]) k.box(x, 0.02, z, 0.008, h + 0.12, 0.008, P.wood, M.wood);
    for (let y = 0.1; y < h + 0.1; y += 0.1) {
      k.box(0, y, 0.16, 0.34, 0.006, 0.03, P.woodLight, M.wood);
      k.box(0, y, -0.16, 0.34, 0.006, 0.03, P.woodLight, M.wood);
    }
    // treadwheel crane
    k.box(0.28, 0, 0.0, 0.012, h + 0.26, 0.012, P.timber, M.wood);
    k.push().at(0.28, h + 0.24, 0).rot(0, 0, 0.9); k.box(0, -0.2, 0, 0.01, 0.4, 0.01, P.timber, M.wood); k.pop();
    k.push().at(0.28, 0.05, 0.06).rot(Math.PI / 2, 0, 0); k.cyl(0, -0.01, 0, 0.05, 0.05, 0.02, 10, P.wood, M.wood); k.pop();
    // stone piles
    k.box(-0.26, 0, 0.12, 0.08, 0.03, 0.06, P.stone, M.stone);
    k.box(-0.24, 0.03, 0.12, 0.05, 0.025, 0.05, P.stoneWarm, M.stone);
    a.work.push([0.2, 0, 0.2], [-0.2, 0, 0.22], [0, h + 0.03, 0.14], [-0.2, 0, -0.2]);
    return k.build();
  });
}

defineModel('bridge', a => {
  // Stone arch bridge spanning z from -0.5 to 0.5 (scaled along z to fit).
  const k = new Kit();
  const L = 1, W = 0.16;
  k.box(0, 0.0, 0, W, 0.04, L, P.stoneWarm, M.stone, { topMat: M.cobble, top: P.stoneMid });
  for (const s of [-1, 1]) k.box(s * (W / 2 - 0.008), 0.04, 0, 0.016, 0.035, L, P.stone, M.stone);
  // arches
  const n = 3;
  for (let i = 0; i < n; i++) {
    const z0 = -L / 2 + (i / n) * L, z1 = -L / 2 + ((i + 1) / n) * L;
    const zm = (z0 + z1) / 2;
    for (let j = 0; j < 6; j++) {
      const a0 = (j / 6) * Math.PI, a1 = ((j + 1) / 6) * Math.PI;
      const r = (z1 - z0) / 2 * 0.9;
      const p0 = [zm - Math.cos(a0) * r, -Math.sin(a0) * r * 0.9 - 0.02], p1 = [zm - Math.cos(a1) * r, -Math.sin(a1) * r * 0.9 - 0.02];
      for (const s of [-1, 1]) {
        const x = s * W / 2;
        k.quad([x, p0[1], p0[0]], [x, p1[1], p1[0]], [x, 0, p1[0]], [x, 0, p0[0]], P.stone, M.stone);
      }
    }
    // piers
    if (i > 0) k.box(0, -0.6, z0, W * 1.1, 0.6, 0.05, P.stoneMid, M.stone);
  }
  a.light.push([W / 2, 0.1, 0.0]);
  return { geometry: k.build(), footprint: [W, L] };
});

defineModel('aqueduct', a => {
  // One arch span: 0.42 long along z, top channel at y = 0, legs down to -1.2 (clipped by terrain).
  const k = new Kit();
  const L = 0.42, W = 0.07;
  k.box(0, -0.04, 0, W + 0.02, 0.04, L, P.stoneWarm, M.stone);
  k.box(0, 0, 0, W * 0.5, 0.004, L, col(0x2d6f8f), M.water);
  for (const s of [-1, 1]) k.box(s * (W / 2 + 0.002), 0, 0, 0.012, 0.018, L, P.stone, M.stone);
  k.box(0, -1.4, -L / 2 + 0.03, W, 1.36, 0.06, P.stone, M.stone);
  for (let j = 0; j < 8; j++) {
    const a0 = (j / 8) * Math.PI, a1 = ((j + 1) / 8) * Math.PI;
    const r = L / 2 - 0.03;
    const p0 = [Math.cos(a0) * r + 0.0, -0.1 - Math.sin(a0) * 0.0 - (1 - Math.sin(a0)) * r * 0.9 - 0.02];
    const p1 = [Math.cos(a1) * r + 0.0, -0.1 - (1 - Math.sin(a1)) * r * 0.9 - 0.02];
    for (const s of [-1, 1]) k.quad([s * W / 2, p0[1], p0[0] + 0.03 * 0], [s * W / 2, p1[1], p1[0]], [s * W / 2, -0.04, p1[0]], [s * W / 2, -0.04, p0[0]], P.stone, M.stone);
  }
  return { geometry: k.build(), footprint: [W, L] };
});
