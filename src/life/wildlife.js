// Wildlife, monsters and birds. Groups wander deterministic paths around home ranges chosen from
// each realm's habitat, so herds graze, packs prowl and flocks wheel whether or not you watch.

import * as THREE from 'three';
import { ACT } from '../render/rig.js';
import { TOOL } from '../models/characters.js';
import { mulberry32 } from '../core/noise.js';
import { latLonToDir, PLANET_RADIUS, tangentFrame, offsetDir } from '../core/sphere.js';
import { worldMatrix } from './traffic.js';

const R = PLANET_RADIUS;
const _m = new THREE.Matrix4();
const c = (hex) => { const k = new THREE.Color(hex); return [k.r, k.g, k.b]; };

// crowd, count range, wander radius, speed, colors, scale, habitat predicate key, display name
const SPECIES = {
  deer: { crowd: 'deer', n: [3, 6], r: 1.2, speed: 0.05, coat: [0x8a5a34, 0x7a4a2a], scale: 1, name: 'Red deer', hab: 'forest' },
  whitestag: { crowd: 'deer', n: [1, 1], r: 1.4, speed: 0.05, coat: [0xf4f1ea], scale: 1.25, name: 'The White Stag', hab: 'forest' },
  sheep: { crowd: 'sheep', n: [5, 9], r: 0.5, speed: 0.02, coat: [0xefe8da, 0xe4dccb, 0x3a3230], scale: 1, name: 'Sheep', hab: 'farm', shepherd: true },
  cow: { crowd: 'cow', n: [3, 6], r: 0.45, speed: 0.02, coat: [0x3a2a1e, 0xefe8da, 0x7a4a2a], scale: 1, name: 'Cattle', hab: 'farm' },
  horse: { crowd: 'horse', n: [2, 5], r: 0.6, speed: 0.04, coat: [0x5a3a22, 0x2a1e18, 0xd8c8b0, 0x8a6a4a], scale: 1, name: 'Horses', hab: 'farm' },
  wolf: { crowd: 'wolf', n: [3, 6], r: 2.0, speed: 0.09, coat: [0x6a6a6a, 0x4a4540, 0x8a8078], scale: 1.1, name: 'Wolf pack', hab: 'wild', prowl: true },
  frostwolf: { crowd: 'wolf', n: [3, 5], r: 2.0, speed: 0.09, coat: [0xe8eef4, 0xc8d0d8], scale: 1.3, name: 'Frost wolves', hab: 'cold', prowl: true },
  boar: { crowd: 'boar', n: [2, 4], r: 0.9, speed: 0.05, coat: [0x3a2a20, 0x4a3a2a], scale: 1, name: 'Boars', hab: 'forest' },
  makka: { crowd: 'makka', n: [5, 9], r: 2.5, speed: 0.035, coat: [0x6a4a2a, 0x8a6a42, 0x5a3a22], scale: 1, name: 'Makka herd', hab: 'steppe' },
  bear: { crowd: 'bear', n: [1, 2], r: 1.2, speed: 0.04, coat: [0x4a3222, 0x2a2220], scale: 1, name: 'Bear', hab: 'forest' },
  mammoth: { crowd: 'mammoth', n: [3, 5], r: 2.5, speed: 0.03, coat: [0x5a3a22, 0x6a4a2a], scale: 1, name: 'Mammoths', hab: 'cold' },
  unicorn: { crowd: 'unicorn', n: [1, 2], r: 1.0, speed: 0.05, coat: [0xfbf8f2], scale: 1, name: 'Unicorn', hab: 'forest' },
  goat: { crowd: 'goat', n: [3, 6], r: 1.0, speed: 0.03, coat: [0xe8e2d8, 0x8a7a6a], scale: 1, name: 'Mountain goats', hab: 'mount' },
  spider: { crowd: 'spider', n: [1, 3], r: 0.8, speed: 0.07, coat: [0x1e1a22, 0x2a2230], scale: 1.8, name: 'Giant spiders', hab: 'dark', prowl: true },
  troll: { crowd: 'beast', n: [1, 2], r: 1.5, speed: 0.04, coat: [0x5a6a4a, 0x6a7a5a], scale: 2.6, name: 'Hill trolls', hab: 'wild', humanoid: true, tool: TOOL.hammer },
  yeti: { crowd: 'beast', n: [1, 2], r: 1.5, speed: 0.04, coat: [0xf0f4f8], scale: 2.3, name: 'Yeti', hab: 'cold', humanoid: true },
  golem: { crowd: 'dwarf', n: [1, 1], r: 0.8, speed: 0.02, coat: [0x7a7670], scale: 3.4, name: 'Rock golem', hab: 'mount', humanoid: true },
  skeleton: { crowd: 'undead', n: [3, 6], r: 1.0, speed: 0.035, coat: [0x3a3a44], scale: 0.78, name: 'Wandering dead', hab: 'cursed', humanoid: true, tool: TOOL.sword, nocturnal: true },
  treant: { crowd: 'treant', n: [1, 2], r: 1.0, speed: 0.012, coat: [0xffffff], scale: 1.5, name: 'Treant', hab: 'forest' },
  raptor: { crowd: 'draconic', n: [3, 5], r: 1.8, speed: 0.1, coat: [0x3a7a3a, 0x7a8a3a], scale: 1.0, name: 'Raptors', hab: 'jungle', humanoid: true, prowl: true },
  kobold: { crowd: 'draconic', n: [2, 4], r: 1.0, speed: 0.05, coat: [0xb8401a, 0xd87a2a], scale: 0.55, name: 'Kobold scavengers', hab: 'volcanic', humanoid: true, tool: TOOL.sack },
  tortoise: { crowd: 'tortoise', n: [1, 1], r: 9, speed: 0.012, coat: [0x6a6a4a], scale: 1, name: 'The Great Tortoise', hab: 'fixed' },
  griffin: { crowd: 'griffin', n: [1, 2], r: 3, speed: 0.4, coat: [0xc8a060, 0xe8e0d0], scale: 1, name: 'Griffins', hab: 'fixed', fly: 3.2 },
  wyvern: { crowd: 'wyvern', n: [1, 2], r: 4, speed: 0.45, coat: [0x4a6a3a, 0x7a3a2a], scale: 1, name: 'Wyverns', hab: 'fixed', fly: 4.5 },
  serpent: { crowd: 'serpent', n: [1, 1], r: 6, speed: 0.15, coat: [0x2a6a6a, 0x3a5a8a], scale: 1.6, name: 'Sea serpent', hab: 'fixed', sea: true },
};

// Hand-placed groups in addition to habitat sampling: [species, lat, lon]
const PLACED = [
  ['tortoise', -30, 22], ['whitestag', 47.8, -12.2], ['unicorn', 46.2, -8.6], ['unicorn', 22.4, -12.8],
  ['treant', 48.8, -15.5], ['treant', 23, -10.2], ['golem', 56.4, -36.2], ['golem', 54.6, -22],
  ['griffin', -39.8, 34.5], ['griffin', 48.4, -103], ['griffin', 51, 125], ['wyvern', 26, 86], ['wyvern', 44.2, -95], ['wyvern', 15, 92],
  ['serpent', 12, -62], ['serpent', -25, 120], ['serpent', 40, 160], ['serpent', -50, -20],
  ['spider', 44.6, 123.6], ['spider', 45.2, 124.4], ['troll', 45.8, 125.8], ['troll', 43.2, -93.4], ['skeleton', 18.6, -175.6], ['skeleton', 26.4, 171.8],
];

// Regions sampled for habitat groups: [lat, lon, radiusDeg, count, speciesList]
const RANGES = [
  [34, -38, 12, 26, ['deer', 'deer', 'boar', 'sheep', 'cow', 'horse', 'sheep', 'wolf']],
  [47, -12, 6, 10, ['deer', 'deer', 'boar', 'bear']],
  [56, -38, 9, 12, ['goat', 'wolf', 'bear', 'goat', 'troll']],
  [72, -10, 14, 12, ['mammoth', 'frostwolf', 'yeti', 'mammoth']],
  [-28, 18, 14, 18, ['makka', 'makka', 'boar', 'wolf', 'raptor']],
  [22, 80, 10, 8, ['kobold', 'goat', 'kobold']],
  [19, -176, 6, 8, ['skeleton', 'spider', 'skeleton']],
  [46, 128, 9, 12, ['deer', 'troll', 'wolf', 'boar', 'spider', 'bear']],
  [-16, -110, 7, 8, ['raptor', 'boar', 'raptor']],
  [47, -100, 7, 8, ['goat', 'wolf', 'sheep', 'troll']],
  [-36, 134, 5, 6, ['spider', 'wolf', 'spider']],
  [23, -12, 4, 4, ['deer', 'deer']],
];

const BIRDS = [
  // kind, lat, lon, count, altitude, radius
  ['gull', 27.9, -27.2, 14], ['gull', 2.3, -40.8, 10], ['gull', -12.2, 8.4, 10], ['gull', 16.8, 70.4, 8], ['gull', 36.8, -60.6, 8], ['gull', 21.4, -38.5, 8], ['gull', -39.2, -146.8, 10],
  ['crow', 18.3, -176.2, 16], ['crow', 47.2, -46, 14], ['crow', 44.6, 123.6, 12], ['crow', 26.2, 171.6, 10],
  ['song', 37.6, -27.5, 10], ['song', 32.5, -51, 10], ['song', 48.9, -10.3, 12], ['song', 23.6, -13.8, 12], ['song', 29, -44.3, 8], ['song', 44, -40, 8],
  ['eagle', 56, -40, 3], ['eagle', 75, 0, 3], ['eagle', 50, 128, 2], ['eagle', -40, 34, 3],
  ['bat', 18.3, -176.2, 16], ['bat', 53.4, -28.5, 10], ['bat', 20.4, -178.6, 12],
];
const BIRD_STYLE = {
  gull: { coat: 0xf2f2f0, wing: 0xb8c0c8, alt: [0.5, 1.6], r: [0.8, 2.2], scale: 1.3, speed: 0.5 },
  crow: { coat: 0x1a1a1e, wing: 0x2a2a30, alt: [0.4, 1.4], r: [0.6, 1.6], scale: 1.1, speed: 0.6 },
  song: { coat: 0xd87a2a, wing: 0x6a4a2a, alt: [0.15, 0.6], r: [0.3, 0.9], scale: 0.7, speed: 0.9 },
  eagle: { coat: 0x5a3a22, wing: 0x3a2a1a, alt: [2.5, 4.5], r: [1.5, 3.5], scale: 3.2, speed: 0.25 },
  bat: { coat: 0x2a2226, wing: 0x1a1418, alt: [0.2, 1.0], r: [0.4, 1.2], scale: 1.0, speed: 1.2, night: true },
};

function habitatOK(field, d, hab, info) {
  const h = field.height(d[0], d[1], d[2]);
  if (h < 0.12) return false;
  field.regionWeights(d[0], d[1], d[2]);
  const cold = field.regionProp('cold'), forest = field.regionProp('forest'), marsh = field.regionProp('marsh'), volcanic = field.regionProp('volcanic');
  switch (hab) {
    case 'forest': return forest > 0.35 && h < 3.5;
    case 'farm': return h < 1.6 && cold < 0.3 && forest < 0.6;
    case 'wild': return h < 3.8 && cold < 0.5;
    case 'cold': return cold > 0.4;
    case 'steppe': return field.regionProp('hills') < 0.6 && forest < 0.3 && cold < 0.2;
    case 'mount': return h > 1.8;
    case 'dark': return forest > 0.4 || marsh > 0.3 || field.regionProp('cursed') > 0.2;
    case 'cursed': return field.regionProp('cursed') > 0.3;
    case 'jungle': return forest > 0.5 && cold < 0.1;
    case 'volcanic': return volcanic > 0.4;
    default: return true;
  }
}

export class Wildlife {
  constructor(world, crowds) {
    this.world = world; this.crowds = crowds; this.field = world.field;
    this.groups = [];
    const rnd = mulberry32(8080);
    const addGroup = (key, d) => {
      const S = SPECIES[key];
      const n = S.n[0] + Math.floor(rnd() * (S.n[1] - S.n[0] + 1));
      const { east, north } = tangentFrame(d);
      const members = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = i === 0 ? 0 : 0.05 + rnd() * 0.12 * Math.sqrt(n);
        const coat = c(S.coat[Math.floor(rnd() * S.coat.length)]);
        members.push({ ox: Math.cos(a) * r, oy: Math.sin(a) * r, coat, phase: rnd() * 50, scale: S.scale * (0.85 + rnd() * 0.3) });
      }
      this.groups.push({ key, S, d, e: east, n: north, members, w1: 0.013 + rnd() * 0.01, w2: 0.021 + rnd() * 0.015, p1: rnd() * 6.3, p2: rnd() * 6.3, p3: rnd() * 6.3, p4: rnd() * 6.3,
        name: S.name, pos: new THREE.Vector3(), center: new THREE.Vector3(...d).multiplyScalar(R) });
    };
    for (const [key, lat, lon] of PLACED) addGroup(key, latLonToDir(lat, lon));
    for (const [lat, lon, rad, count, list] of RANGES) {
      let made = 0;
      for (let tries = 0; tries < count * 12 && made < count; tries++) {
        const key = list[Math.floor(rnd() * list.length)];
        const la = lat + (rnd() - 0.5) * 2 * rad, lo = lon + (rnd() - 0.5) * 2 * rad / Math.max(0.3, Math.cos(lat * Math.PI / 180));
        const d = latLonToDir(la, lo);
        if (!habitatOK(this.field, d, SPECIES[key].hab)) continue;
        addGroup(key, d);
        made++;
      }
    }
    // Farm animals around every farming settlement.
    for (const s of world.settlements) {
      if (!s.pad.farmR || s.culture !== 'human') continue;
      for (let i = 0; i < 3; i++) {
        const a = rnd() * Math.PI * 2, r = s.radius + 0.6 + rnd() * (s.pad.farmR - s.radius - 0.6);
        const d = offsetDir(s.d, Math.cos(a) * r, Math.sin(a) * r);
        if (this.field.height(d[0], d[1], d[2]) < 0.15) continue;
        addGroup(['sheep', 'cow', 'horse'][i % 3], d);
      }
    }
    // Bird flocks
    this.flocks = BIRDS.map(([kind, lat, lon, n], i) => {
      const st = BIRD_STYLE[kind];
      const d = latLonToDir(lat, lon);
      const { east, north } = tangentFrame(d);
      const birds = [];
      for (let k = 0; k < n; k++) birds.push({ r: st.r[0] + rnd() * (st.r[1] - st.r[0]), alt: st.alt[0] + rnd() * (st.alt[1] - st.alt[0]), ph: rnd() * 6.28, w: (0.25 + rnd() * 0.25) * st.speed * (rnd() < 0.5 ? 1 : -1), wob: rnd() * 6.28 });
      return { kind, st, d, e: east, n: north, birds, center: new THREE.Vector3(...d).multiplyScalar(R), coat: c(st.coat), wing: c(st.wing), ground: Math.max(0, this.field.height(d[0], d[1], d[2])) };
    });
    this.visible = [];
    this.addGroup = addGroup;
    this.rnd = rnd;
  }

  // A raiding party appears at a point for a while (used by events).
  spawnRaid(key, d, seconds, now) {
    const before = this.groups.length;
    this.addGroup(key, d);
    const g = this.groups[before];
    if (!g) return;
    g.until = now + seconds;
    g.S = { ...g.S, r: 0.35, prowl: true };
    g.temp = true;
  }

  groupCenter(g, t, out) {
    const A = g.S.r;
    const x = A * (0.6 * Math.sin(g.w1 * t + g.p1) + 0.4 * Math.sin(g.w2 * t * 1.7 + g.p2));
    const y = A * (0.6 * Math.sin(g.w1 * t * 1.3 + g.p3) + 0.4 * Math.sin(g.w2 * t + g.p4));
    const dx = A * (0.6 * g.w1 * Math.cos(g.w1 * t + g.p1) + 0.4 * g.w2 * 1.7 * Math.cos(g.w2 * t * 1.7 + g.p2));
    const dy = A * (0.6 * g.w1 * 1.3 * Math.cos(g.w1 * t * 1.3 + g.p3) + 0.4 * g.w2 * Math.cos(g.w2 * t + g.p4));
    out.x = x; out.y = y; out.vx = dx; out.vy = dy;
    return out;
  }

  update(time, camera, alt, clock) {
    const cam = camera.position;
    this.visible.length = 0;
    const tc = { x: 0, y: 0, vx: 0, vy: 0 };
    this.groups = this.groups.filter(g => !g.temp || g.until > time);
    for (const g of this.groups) {
      const big = g.S.fly || g.key === 'tortoise' || g.S.sea || g.key === 'mammoth' || g.key === 'golem';
      const range = big ? (alt < 40 ? 60 : 0) : (alt < 12 ? 18 : 0);
      if (!range || g.center.distanceTo(cam) > range + g.S.r * 2) continue;
      const tSpeed = g.S.speed / Math.max(0.2, g.S.r) * 6;
      this.groupCenter(g, time * tSpeed * 0.05 * 20, tc);
      if (g.S.fly) { this.drawFlyer(g, time); continue; }
      if (g.S.sea) { this.drawSerpent(g, time, tc); continue; }
      const night = clock ? (() => { const h = clock.hourAt(Math.atan2(-g.d[2], g.d[0]) * 180 / Math.PI); return h < 6 || h > 20; })() : false;
      if (g.S.nocturnal && !night) continue;
      const spd = Math.hypot(tc.vx, tc.vy);
      let act;
      if (g.S.prowl) act = spd > 0.004 ? ACT.run : ACT.walk;
      else act = spd > 0.006 ? ACT.walk : ACT.graze;
      if (g.S.humanoid) act = spd > 0.004 ? ACT.walk : ACT.idle;
      const fx = tc.vx, fy = tc.vy;
      for (let i = 0; i < g.members.length; i++) {
        const m = g.members[i];
        const wob = 0.02 * Math.sin(time * 0.3 + m.phase);
        const x = tc.x + m.ox + wob, y = tc.y + m.oy + wob * 0.7;
        const dd = [g.d[0] + (g.e[0] * x + g.n[0] * y) / R, g.d[1] + (g.e[1] * x + g.n[1] * y) / R, g.d[2] + (g.e[2] * x + g.n[2] * y) / R];
        const l = Math.hypot(dd[0], dd[1], dd[2]); dd[0] /= l; dd[1] /= l; dd[2] /= l;
        const h = this.field.height(dd[0], dd[1], dd[2]);
        if (h < 0.0 && !g.S.sea) continue;
        const Fx = g.e[0] * fx + g.n[0] * fy, Fy = g.e[1] * fx + g.n[1] * fy, Fz = g.e[2] * fx + g.n[2] * fy;
        const mAct = act === ACT.graze && (i + Math.floor(time * 0.1 + m.phase)) % 3 === 0 ? ACT.idle : act;
        worldMatrix(_m, dd, Math.max(0, h), Fx || g.n[0], Fy || g.n[1], Fz || g.n[2], m.scale);
        const crowd = this.crowds.get(g.S.crowd);
        if (g.S.humanoid) crowd.push(_m, mAct, m.phase, 1, g.S.tool || 0, m.coat, m.coat, m.coat, [0.9, 0.9, 0.85]);
        else crowd.push(_m, mAct, m.phase, 1, 0, m.coat, m.coat, m.coat, [0.92, 0.9, 0.85]);
        if (i === 0) { g.pos.set(_m.elements[12], _m.elements[13], _m.elements[14]); }
      }
      // A shepherd with every flock of sheep.
      if (g.S.shepherd) {
        const x = tc.x + 0.12, y = tc.y - 0.1;
        const dd = [g.d[0] + (g.e[0] * x + g.n[0] * y) / R, g.d[1] + (g.e[1] * x + g.n[1] * y) / R, g.d[2] + (g.e[2] * x + g.n[2] * y) / R];
        const l = Math.hypot(dd[0], dd[1], dd[2]); dd[0] /= l; dd[1] /= l; dd[2] /= l;
        const h = Math.max(0, this.field.height(dd[0], dd[1], dd[2]));
        worldMatrix(_m, dd, h, g.e[0] * fx + g.n[0] * fy || 1, g.e[1] * fx + g.n[1] * fy, g.e[2] * fx + g.n[2] * fy, 0.72);
        this.crowds.get('human').push(_m, spd > 0.006 ? ACT.walk : ACT.idle, g.p1 * 10, 1, TOOL.staff, [0.35, 0.3, 0.2], [0.3, 0.25, 0.2], [0.9, 0.7, 0.55], [0.4, 0.3, 0.2]);
      }
      this.visible.push(g);
    }
    // Birds
    for (const f of this.flocks) {
      const range = f.kind === 'eagle' ? 50 : 22;
      if (alt > 25 || f.center.distanceTo(cam) > range) continue;
      if (f.st.night && clock) { const h = clock.hourAt(Math.atan2(-f.d[2], f.d[0]) * 180 / Math.PI); if (h > 5.5 && h < 19.5) continue; }
      const crowd = this.crowds.get('bird');
      for (const b of f.birds) {
        const a = b.ph + time * b.w;
        const x = Math.cos(a) * b.r + 0.3 * Math.sin(time * 0.1 + b.wob), y = Math.sin(a) * b.r;
        const dd = [f.d[0] + (f.e[0] * x + f.n[0] * y) / R, f.d[1] + (f.e[1] * x + f.n[1] * y) / R, f.d[2] + (f.e[2] * x + f.n[2] * y) / R];
        const l = Math.hypot(dd[0], dd[1], dd[2]); dd[0] /= l; dd[1] /= l; dd[2] /= l;
        const h = f.ground + b.alt + 0.08 * Math.sin(time * 0.7 + b.wob);
        const tx = -Math.sin(a) * Math.sign(b.w), ty = Math.cos(a) * Math.sign(b.w);
        worldMatrix(_m, dd, h, f.e[0] * tx + f.n[0] * ty, f.e[1] * tx + f.n[1] * ty, f.e[2] * tx + f.n[2] * ty, f.st.scale);
        const glide = f.kind === 'eagle' || (f.kind === 'gull' && Math.sin(time * 0.5 + b.wob) > 0.3);
        crowd.push(_m, glide ? ACT.glide : ACT.fly, b.wob * 10, f.kind === 'song' ? 1.3 : 1, 0, f.coat, f.wing, f.coat, f.coat);
      }
    }
  }

  drawFlyer(g, time) {
    const crowd = this.crowds.get(g.S.crowd);
    for (let i = 0; i < g.members.length; i++) {
      const m = g.members[i];
      const a = time * g.S.speed / g.S.r + m.phase;
      const r = g.S.r * (0.8 + 0.2 * Math.sin(time * 0.05 + m.phase));
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const dd = [g.d[0] + (g.e[0] * x + g.n[0] * y) / R, g.d[1] + (g.e[1] * x + g.n[1] * y) / R, g.d[2] + (g.e[2] * x + g.n[2] * y) / R];
      const l = Math.hypot(dd[0], dd[1], dd[2]); dd[0] /= l; dd[1] /= l; dd[2] /= l;
      const ground = Math.max(0, this.field.height(dd[0], dd[1], dd[2]));
      const h = ground + g.S.fly + 0.6 * Math.sin(time * 0.3 + m.phase);
      const tx = -Math.sin(a), ty = Math.cos(a);
      worldMatrix(_m, dd, h, g.e[0] * tx + g.n[0] * ty, g.e[1] * tx + g.n[1] * ty, g.e[2] * tx + g.n[2] * ty, m.scale);
      // bank into the turn
      _m.multiply(new THREE.Matrix4().makeRotationZ(0.35));
      crowd.push(_m, Math.sin(time * 0.4 + m.phase) > 0 ? ACT.glide : ACT.fly, m.phase, 0.8, 0, m.coat, m.coat, m.coat, [0.9, 0.85, 0.7]);
      if (i === 0) g.pos.set(_m.elements[12], _m.elements[13], _m.elements[14]);
    }
    this.visible.push(g);
  }

  drawSerpent(g, time, tc) {
    // Surfaces for a while, then dives.
    const cyc = Math.sin(time * 0.05 + g.p1);
    const h = -0.25 + 0.3 * Math.max(0, cyc);
    if (h < -0.1) return;
    const x = tc.x, y = tc.y;
    const dd = [g.d[0] + (g.e[0] * x + g.n[0] * y) / R, g.d[1] + (g.e[1] * x + g.n[1] * y) / R, g.d[2] + (g.e[2] * x + g.n[2] * y) / R];
    const l = Math.hypot(dd[0], dd[1], dd[2]); dd[0] /= l; dd[1] /= l; dd[2] /= l;
    if (this.field.height(dd[0], dd[1], dd[2]) > -0.3) return;
    worldMatrix(_m, dd, h, g.e[0] * tc.vx + g.n[0] * tc.vy, g.e[1] * tc.vx + g.n[1] * tc.vy, g.e[2] * tc.vx + g.n[2] * tc.vy, g.members[0].scale);
    this.crowds.get('serpent').push(_m, ACT.swim, g.p2 * 10, 1, 0, g.members[0].coat, [0.7, 0.8, 0.6], g.members[0].coat, [0.9, 0.8, 0.4]);
    g.pos.set(_m.elements[12], _m.elements[13], _m.elements[14]);
    this.visible.push(g);
  }
}
