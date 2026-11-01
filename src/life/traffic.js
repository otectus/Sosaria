// Road travellers, river boats and sea ships. Every position is a pure function of world time,
// so traffic keeps moving whether or not anyone is looking.

import * as THREE from 'three';
import { ACT } from '../render/rig.js';
import { TOOL } from '../models/characters.js';
import { mulberry32, hashString } from '../core/noise.js';
import { PLANET_RADIUS, arcDist, tangentFrame } from '../core/sphere.js';

const R = PLANET_RADIUS;
const _m = new THREE.Matrix4();
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// Precomputed arc-length table for a polyline of unit dirs.
export class Track {
  constructor(dirs, levels, loop = false) {
    this.dirs = dirs; this.levels = levels; this.loop = loop;
    this.cum = [0];
    for (let i = 1; i < dirs.length; i++) this.cum.push(this.cum[i - 1] + arcDist(dirs[i - 1], dirs[i]));
    this.length = this.cum[this.cum.length - 1];
    this.center = new THREE.Vector3();
    for (const d of dirs) this.center.add(new THREE.Vector3(...d));
    this.center.normalize().multiplyScalar(R);
    this.radius = 0;
    for (const d of dirs) this.radius = Math.max(this.radius, this.center.distanceTo(new THREE.Vector3(...d).multiplyScalar(R)));
  }
  // Sample at arc length s: writes dir, level and tangent (unit, world).
  at(s, out) {
    s = Math.max(0, Math.min(this.length - 1e-6, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - this.cum[lo]) / Math.max(1e-9, this.cum[hi] - this.cum[lo]);
    const a = this.dirs[lo], b = this.dirs[hi];
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
    const l = Math.hypot(x, y, z);
    out.d[0] = x / l; out.d[1] = y / l; out.d[2] = z / l;
    out.level = this.levels ? this.levels[lo] + (this.levels[hi] - this.levels[lo]) * t : 0;
    out.tx = b[0] - a[0]; out.ty = b[1] - a[1]; out.tz = b[2] - a[2];
    const tl = Math.hypot(out.tx, out.ty, out.tz) || 1;
    out.tx /= tl; out.ty /= tl; out.tz /= tl;
    return out;
  }
}

// Matrix from dir, height and a world tangent forward.
function worldMatrix(out, d, h, fx, fy, fz, s) {
  const upx = d[0], upy = d[1], upz = d[2];
  const dp = fx * upx + fy * upy + fz * upz;
  fx -= upx * dp; fy -= upy * dp; fz -= upz * dp;
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  const rx = upy * fz - upz * fy, ry = upz * fx - upx * fz, rz = upx * fy - upy * fx;
  const r = R + h, E = out.elements;
  E[0] = rx * s; E[1] = ry * s; E[2] = rz * s; E[3] = 0;
  E[4] = upx * s; E[5] = upy * s; E[6] = upz * s; E[7] = 0;
  E[8] = fx * s; E[9] = fy * s; E[10] = fz * s; E[11] = 0;
  E[12] = upx * r; E[13] = upy * r; E[14] = upz * r; E[15] = 1;
  return out;
}
export { worldMatrix };

// Ping-pong with rests at each end: returns { s, dir(+1/-1), resting }.
function shuttle(time, L, speed, rest, offset) {
  const tt = L / speed;
  const P = 2 * (tt + rest);
  let u = ((time + offset) % P + P) % P;
  if (u < tt) return { s: u * speed, dir: 1, resting: false };
  u -= tt;
  if (u < rest) return { s: L, dir: 1, resting: true };
  u -= rest;
  if (u < tt) return { s: L - u * speed, dir: -1, resting: false };
  return { s: 0, dir: -1, resting: true };
}

const HUMANOIDS = new Set(['human', 'elf', 'dwarf', 'fae', 'beast', 'undead', 'draconic']);
const PARTY = [
  { cloth: 0x9aa8b8, tool: TOOL.sword, race: 'human' },
  { cloth: 0x3a2a6a, tool: TOOL.staff, race: 'human' },
  { cloth: 0x3f7a5a, tool: TOOL.bow, race: 'elf' },
  { cloth: 0x8a3a2a, tool: TOOL.axe, race: 'dwarf' },
];

export class Traffic {
  constructor(world, sites, crowds, simulation = null) {
    this.world = world; this.crowds = crowds;
    this.field = world.field;
    this.simulation = simulation;
    this.shipments = new Map();
    this.roadTracks = new Map(world.roads.map(r => [`road:${r.a}:${r.b}`, { track: new Track(r.dirs, r.levels), a: r.a }]));
    this.groups = [];
    this.tmp = { d: [0, 0, 0], level: 0, tx: 0, ty: 0, tz: 0 };
    const siteById = new Map(sites.map(s => [s.s.id, s]));
    // Road travellers
    world.roads.forEach((road, ri) => {
      const track = new Track(road.dirs, road.levels);
      const A = siteById.get(road.a), B = siteById.get(road.b);
      const cult = (A && A.s.culture) || (B && B.s.culture) || 'human';
      const rnd = mulberry32(hashString(road.a + road.b));
      const n = Math.max(1, Math.round(track.length / 9));
      for (let i = 0; i < n; i++) {
        const r = rnd();
        let type;
        if (cult === 'human') type = r < 0.3 ? 'wagon' : r < 0.5 ? 'rider' : r < 0.65 ? 'walkers' : r < 0.78 ? 'patrol' : r < 0.9 ? 'party' : 'caravan';
        else if (cult === 'beast') type = r < 0.5 ? 'hunters' : r < 0.8 ? 'walkers' : 'boarriders';
        else if (cult === 'dwarf') type = r < 0.5 ? 'orecart' : 'walkers';
        else if (cult === 'draconic') type = r < 0.6 ? 'porters' : 'patrol';
        else if (cult === 'elf') type = r < 0.5 ? 'rider' : 'walkers';
        else type = 'walkers';
        this.groups.push({ kind: 'road', type, track, cult, speed: (type === 'rider' ? 0.14 : type.includes('cart') || type === 'wagon' || type === 'caravan' ? 0.07 : 0.05) * (0.85 + rnd() * 0.3),
          rest: 20 + rnd() * 60, offset: rnd() * 5000, seed: rnd() * 1000, name: road.a + '→' + road.b,
          colors: this.pickColors(cult, rnd) });
      }
    });
    // River boats (only on stretches below the lowest waterfall)
    for (const rv of world.rivers) {
      if (rv.lava || rv.length < 6) continue;
      let start = 0;
      for (const f of rv.falls) start = Math.max(start, f + 2);
      const dirs = rv.dirs.slice(start), levels = rv.levels.slice(start);
      if (dirs.length < 10) continue;
      const track = new Track(dirs, levels);
      const rnd = mulberry32(hashString(rv.id));
      const n = Math.max(1, Math.round(track.length / 10));
      const type = rv.id === 'silverfall' || rv.id === 'silverrun' ? 'swanboat' : rv.id.startsWith('redrun') ? 'raft' : rv.id === 'jungle' ? 'canoe' : rnd() < 0.5 ? 'rowboat' : 'fishboat';
      for (let i = 0; i < n; i++) this.groups.push({ kind: 'river', type, track, speed: 0.05 + rnd() * 0.03, rest: 30 + rnd() * 30, offset: rnd() * 3000, seed: rnd() * 1000, colors: this.pickColors('human', rnd) });
    }
    // Sea lanes
    for (const lane of world.lanes) {
      const track = new Track(lane.dirs, null, !!lane.loop);
      const rnd = mulberry32(hashString(lane.id));
      const type = lane.kind === 'merchant' ? 'cog' : lane.kind === 'warship' ? 'warship' : lane.kind === 'ghost' ? 'ghostship' : lane.kind === 'pirate' ? 'pirate' : lane.kind === 'canoe' ? 'canoe' : 'fishboat';
      const n = lane.kind === 'merchant' ? Math.max(1, Math.round(track.length / 30)) : lane.kind === 'fisher' ? 3 : 1;
      for (let i = 0; i < n; i++) this.groups.push({ kind: 'sea', type, track, loop: !!lane.loop, speed: (type === 'canoe' || type === 'fishboat' ? 0.08 : 0.16) * (0.9 + rnd() * 0.2), rest: 40, offset: rnd() * 8000, seed: rnd() * 1000, name: lane.id, colors: this.pickColors('human', rnd) });
    }
    this.visible = [];
  }

  pickColors(cult, rnd) {
    const cloth = { human: [0x2a4f9e, 0x8a3b2e, 0x5d6e3a, 0x9a8a6a, 0xd9c8a0], beast: [0x8a6a4a, 0x9e3a2a], dwarf: [0x8a3a2a, 0x4a5a6a], draconic: [0x5a1a1a, 0x2a2a2a], elf: [0x3f7a5a, 0xd8d8c8], undead: [0x3a3a44] }[cult] || [0x7a5a3a];
    const skin = { human: [0xf1c9a5, 0xe0ac7e, 0xc68642], beast: [0x8a6a4a, 0x6a5a4a], dwarf: [0xe8b898], draconic: [0xb8401a, 0x4a8a3a], elf: [0xf6e0c8], undead: [0xd8d0b8] }[cult] || [0xf1c9a5];
    const p = (arr) => col(arr[Math.floor(rnd() * arr.length)]);
    return { a: p(cloth), b: col(0x4a3a2a), skin: p(skin), hair: p([0x2a1a10, 0x6a4a2a, 0xb08a4a, 0x8a3a1a]), sail: p([0xe9dcbc, 0xd9c8a0, 0x2a4f9e, 0xb3342a]) };
  }

  // Place a single figure at arc length s on a group's track.
  person(g, s, lateral, race, act, tool, colA, speedMul = 1, scale = 0.78, lift = 0) {
    if (!HUMANOIDS.has(race)) race = 'human';
    const T = g.track.at(s, this.tmp);
    let fx = T.tx * g.dirSign, fy = T.ty * g.dirSign, fz = T.tz * g.dirSign;
    const d = T.d;
    // lateral offset: right vector = up x fwd
    const rx = d[1] * fz - d[2] * fy, ry = d[2] * fx - d[0] * fz, rz = d[0] * fy - d[1] * fx;
    const dd = [d[0] + rx * lateral / R, d[1] + ry * lateral / R, d[2] + rz * lateral / R];
    const l = Math.hypot(dd[0], dd[1], dd[2]); dd[0] /= l; dd[1] /= l; dd[2] /= l;
    const h = (g.kind === 'road' ? Math.max(T.level, this.field.height(dd[0], dd[1], dd[2])) : T.level) + lift;
    worldMatrix(_m, dd, h, fx, fy, fz, scale);
    const c = g.colors;
    this.crowds.get(race).push(_m, act, g.seed + lateral * 10, speedMul, tool, colA || c.a, c.b, c.skin, c.hair);
    return _m;
  }

  update(time, camera, alt) {
    const cam = camera.position;
    this.visible.length = 0;
    const range = alt < 12 ? 24 : 0;
    const seaRange = alt < 45 ? 80 : 0;
    for (const g of this.groups) {
      const rr = g.kind === 'sea' ? seaRange : range;
      if (!rr) continue;
      if (g.track.center.distanceTo(cam) > rr + g.track.radius) continue;
      let s, resting = false;
      if (g.loop) { s = ((time * g.speed + g.offset) % g.track.length + g.track.length) % g.track.length; g.dirSign = 1; }
      else { const sh = shuttle(time, g.track.length, g.speed, g.rest, g.offset); s = sh.s; g.dirSign = sh.dir; resting = sh.resting; }
      if (resting && g.kind === 'road') continue;
      const T = g.track.at(s, this.tmp);
      const p = new THREE.Vector3(T.d[0], T.d[1], T.d[2]).multiplyScalar(R + Math.max(0, T.level));
      if (p.distanceTo(cam) > rr) continue;
      g.pos = p;
      this.visible.push(g);
      this.drawGroup(g, s, resting);
    }
    if (this.simulation) this.updateShipments(camera, alt);
  }

  updateShipments(camera, alt) {
    const state = this.simulation.state;
    const live = new Set();
    for (const trip of state.trips) {
      const parked = trip.status === 'delivered' && state.tick - trip.completed < 30;
      if (trip.status !== 'travelling' && !parked) continue;
      const road = this.roadTracks.get(trip.route);
      if (!road) continue;
      live.add(trip.id);
      let g = this.shipments.get(trip.id);
      if (!g) {
        g = { kind: 'road', type: Object.keys(trip.cargo).length ? 'wagon' : 'rider', track: road.track, cult: 'human',
          dirSign: road.a === trip.from ? 1 : -1, seed: hashString(trip.id) % 1000, name: `${trip.from}→${trip.to}`,
          colors: this.pickColors('human', mulberry32(hashString(trip.id))), pos: new THREE.Vector3() };
        this.shipments.set(trip.id, g);
      }
      g.trip = trip;
      const paused = parked || state.routes[trip.route].closedUntil > state.tick;
      const progress = Math.min(1, (trip.progress + (paused ? 0 : this.simulation.time.fraction)) / trip.duration);
      const s = (g.dirSign === 1 ? progress : 1 - progress) * g.track.length;
      const T = g.track.at(s, this.tmp);
      g.pos.set(...T.d).multiplyScalar(R + T.level);
      if (alt < 12 && g.pos.distanceTo(camera.position) < 24) {
        this.visible.push(g); this.drawGroup(g, s, paused);
      }
    }
    for (const id of this.shipments.keys()) if (!live.has(id)) this.shipments.delete(id);
  }

  drawGroup(g, s, resting) {
    const sg = g.dirSign;
    const moving = resting ? ACT.idle : ACT.walk;
    const c = g.colors;
    if (g.kind === 'river' || g.kind === 'sea') {
      const T = g.track.at(s, this.tmp);
      const h = g.kind === 'river' ? T.level + 0.004 : 0.01;
      worldMatrix(_m, T.d, h, T.tx * sg, T.ty * sg, T.tz * sg, 1);
      const crowd = this.crowds.get(g.type);
      crowd.push(_m, ACT.swim, g.seed, 1, 0, c.sail, g.type === 'ghostship' ? col(0x6bff9a) : g.type === 'pirate' ? col(0x1a1a1a) : col(0x2a4f9e), c.skin, c.hair);
      // A rower or sailor aboard small boats.
      if (g.type === 'rowboat' || g.type === 'canoe' || g.type === 'fishboat' || g.type === 'raft' || g.type === 'swanboat') {
        const race = g.type === 'swanboat' ? 'elf' : g.type === 'raft' || g.type === 'canoe' ? (g.type === 'canoe' ? 'draconic' : 'beast') : 'human';
        const m = _m.clone();
        const up = new THREE.Vector3(T.d[0], T.d[1], T.d[2]);
        m.elements[12] += up.x * 0.012; m.elements[13] += up.y * 0.012; m.elements[14] += up.z * 0.012;
        m.scale(new THREE.Vector3(0.7, 0.7, 0.7));
        this.crowds.get(race).push(m, g.type === 'fishboat' ? ACT.fish : ACT.sit, g.seed, 1, g.type === 'fishboat' ? TOOL.rod : 0, c.a, c.b, c.skin, c.hair);
      }
      return;
    }
    const back = (k) => s - sg * k;
    switch (g.type) {
      case 'wagon': case 'caravan': case 'orecart': {
        const n = g.type === 'caravan' ? 2 : 1;
        for (let w = 0; w < n; w++) {
          const s0 = back(w * 0.3);
          this.drawVehicle(g, s0 - sg * 0.07, g.type === 'orecart' ? 'orecart' : w % 2 ? 'cart' : 'wagon', moving);
          this.drawAnimal(g, s0 + sg * 0.03, g.type === 'orecart' ? 'goat' : 'horse', moving, g.type === 'orecart' ? [0.6, 0.55, 0.5] : null);
          this.person(g, s0 - sg * 0.02, 0.0, g.cult === 'dwarf' ? 'dwarf' : 'human', ACT.sit, 0, null, 1, 0.7, 0.03);
        }
        if (g.type === 'caravan') { this.person(g, back(0.62), -0.03, 'human', moving, TOOL.spear, col(0x2a4f9e)); this.person(g, back(0.66), 0.03, 'human', moving, TOOL.spear, col(0x2a4f9e)); }
        break;
      }
      case 'rider': {
        this.drawAnimal(g, s, g.cult === 'elf' && g.seed % 3 < 1 ? 'unicorn' : 'horse', resting ? ACT.idle : ACT.run, null);
        this.person(g, s - g.dirSign * 0.005, 0, g.cult === 'elf' ? 'elf' : 'human', ACT.sit, TOOL.spear, null, 1, 0.72, 0.048);
        break;
      }
      case 'walkers': case 'porters': case 'hunters': {
        const n = 2 + Math.floor(g.seed % 3);
        const race = g.cult === 'undead' ? 'undead' : g.cult;
        for (let i = 0; i < n; i++) this.person(g, back(i * 0.07), ((i % 2) - 0.5) * 0.03, race, g.type === 'porters' ? ACT.carry : moving,
          g.type === 'porters' ? TOOL.sack : g.type === 'hunters' ? TOOL.bow : (i === 0 ? TOOL.staff : TOOL.sack));
        if (g.type === 'hunters') this.drawAnimal(g, back(-0.06), 'wolf', resting ? ACT.idle : ACT.walk, [0.45, 0.42, 0.4]);
        break;
      }
      case 'patrol': {
        const race = g.cult === 'draconic' ? 'draconic' : 'human';
        for (let i = 0; i < 3; i++) this.person(g, back(i * 0.06), 0, race, moving, TOOL.spear, race === 'human' ? col(0x2a4f9e) : col(0xa3201c));
        break;
      }
      case 'party': {
        PARTY.forEach((m, i) => this.person(g, back(i * 0.055), ((i % 2) - 0.5) * 0.025, m.race, moving, m.tool, col(m.cloth)));
        break;
      }
      case 'boarriders': {
        for (let i = 0; i < 2; i++) { this.drawAnimal(g, back(i * 0.1), 'boar', resting ? ACT.idle : ACT.run, [0.35, 0.25, 0.2], 1.6); this.person(g, back(i * 0.1), 0, 'beast', ACT.sit, TOOL.spear, null, 1, 0.7, 0.03); }
        break;
      }
    }
  }

  drawVehicle(g, s, kind, act) {
    const T = g.track.at(s, this.tmp);
    const h = Math.max(T.level, this.field.height(T.d[0], T.d[1], T.d[2]));
    worldMatrix(_m, T.d, h, T.tx * g.dirSign, T.ty * g.dirSign, T.tz * g.dirSign, 1);
    this.crowds.get(kind).push(_m, act, g.seed, 1, 0, g.colors.sail, col(0x8a3a2a), g.colors.skin, g.colors.hair);
  }

  drawAnimal(g, s, kind, act, tint, scale = 1) {
    const T = g.track.at(s, this.tmp);
    const h = Math.max(T.level, this.field.height(T.d[0], T.d[1], T.d[2]));
    worldMatrix(_m, T.d, h, T.tx * g.dirSign, T.ty * g.dirSign, T.tz * g.dirSign, scale);
    const coat = tint || (g.seed % 4 < 1 ? [0.9, 0.88, 0.85] : g.seed % 4 < 2 ? [0.35, 0.22, 0.14] : g.seed % 4 < 3 ? [0.15, 0.12, 0.1] : [0.55, 0.38, 0.22]);
    this.crowds.get(kind).push(_m, act, g.seed, 1, 0, coat, coat, coat, [0.12, 0.1, 0.08]);
  }
}
