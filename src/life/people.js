// Townsfolk: every settlement near the camera wakes up with inhabitants who keep schedules,
// walk the street graph, work, gather and react to events. Far settlements sleep.

import * as THREE from 'three';
import { ACT } from '../render/rig.js';
import { TOOL } from '../models/characters.js';
import { mulberry32, hashString } from '../core/noise.js';
import { PLANET_RADIUS, dirToLatLon } from '../core/sphere.js';

const R = PLANET_RADIUS;

const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const PAL = {
  human: {
    cloth: [0x7a5a3a, 0x5d6e3a, 0x8a3b2e, 0x3b5a8a, 0x9a8a6a, 0x6a4a6a, 0xb0925a, 0x4a6a6a, 0xa05a30, 0x7a7a7a].map(C),
    pants: [0x4a3a2a, 0x3a3a44, 0x5a4a3a, 0x2e3a2e, 0x6a5a4a].map(C),
    skin: [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0xf6d7b8].map(C),
    hair: [0x2a1a10, 0x6a4a2a, 0xb08a4a, 0xd8c078, 0x8a3a1a, 0x9a9a9a, 0x1a1a1a].map(C),
  },
  elf: { cloth: [0x3f7a5a, 0xd8d8c8, 0x5a8a9a, 0x7a9a5a, 0xc8b878].map(C), pants: [0x3a4a3a, 0x5a5a4a].map(C), skin: [0xf6e0c8, 0xe8d0b8, 0xd8c0a8].map(C), hair: [0xe8e0c0, 0xc8d0d8, 0x2a2a2a, 0xa06a3a].map(C) },
  dwarf: { cloth: [0x8a3a2a, 0x5a4a3a, 0x4a5a6a, 0x7a6a3a].map(C), pants: [0x3a2a1a, 0x4a4a4a].map(C), skin: [0xe8b898, 0xd8a078].map(C), hair: [0xa04a1a, 0x5a3a1a, 0x9a9a9a, 0x2a1a10, 0xd88a3a].map(C) },
  fae: { cloth: [0xf0a8d8, 0xa8d8f0, 0xc8a8f0, 0xa8f0c8, 0xf0e0a8].map(C), pants: [0x8a6aa8, 0x6a8aa8].map(C), skin: [0xe8d8f8, 0xd8f0e8, 0xf8e0e8].map(C), hair: [0xff7ab8, 0x7ad8ff, 0xb08aff, 0xffe07a].map(C) },
  beast: { cloth: [0x8a6a4a, 0x6a4a2a, 0x9a3a2a, 0x5a5a3a].map(C), pants: [0x4a3a2a, 0x3a2a1a].map(C), skin: [0x8a6a4a, 0x6a5a4a, 0x9a8a7a, 0x5a4a3a, 0xa08060].map(C), hair: [0x3a2a1a, 0xe8dcc0].map(C) },
  undead: { cloth: [0x3a3a44, 0x4a3a3a, 0x2e3a33, 0x5a5a5a].map(C), pants: [0x2a2a2a, 0x3a3030].map(C), skin: [0xd8d0b8, 0xc8c0a8, 0xb8c8b0].map(C), hair: [0x5a5a5a, 0x8a8a8a].map(C) },
  draconic: { cloth: [0x2a2a2a, 0x5a1a1a, 0x3a2a1a, 0x7a5a2a].map(C), pants: [0x2a1a1a, 0x3a3a3a].map(C), skin: [0xb8401a, 0xd87a2a, 0x4a8a3a, 0x3a6aa8, 0x9a2a2a].map(C), hair: [0xd8c8a0, 0x2a2a2a].map(C) },
};
const GUARD_TABARD = { human: C(0x2a4f9e), elf: C(0x2c8a9a), dwarf: C(0xc79a3c), beast: C(0x9e3a2a), draconic: C(0xa3201c), undead: C(0x2f4f3a), fae: C(0xb35ad6) };

// Inhabitants per settlement kind.
const POP = { capital: 150, city: 100, port: 70, town: 64, village: 34, hamlet: 14, castle: 24, fort: 18, hold: 48, mine: 18,
  enclave: 44, glade: 18, circle: 10, camp: 40, temple: 56, necropolis: 40, barrow: 8, monastery: 14, ruin: 0, stilts: 24, lighthouse: 8 };

const _m = new THREE.Matrix4();

// Build an instance matrix from a unit dir, height, local-frame forward (fx east, fy north) and scale.
export function localMatrix(out, d, h, e, n, fx, fy, s) {
  const upx = d[0], upy = d[1], upz = d[2];
  let Fx = e[0] * fx + n[0] * fy, Fy = e[1] * fx + n[1] * fy, Fz = e[2] * fx + n[2] * fy;
  const dp = Fx * upx + Fy * upy + Fz * upz;
  Fx -= upx * dp; Fy -= upy * dp; Fz -= upz * dp;
  const fl = Math.hypot(Fx, Fy, Fz) || 1;
  Fx /= fl; Fy /= fl; Fz /= fl;
  const Rx = upy * Fz - upz * Fy, Ry = upz * Fx - upx * Fz, Rz = upx * Fy - upy * Fx;
  const r = R + h;
  const E = out.elements;
  E[0] = Rx * s; E[1] = Ry * s; E[2] = Rz * s; E[3] = 0;
  E[4] = upx * s; E[5] = upy * s; E[6] = upz * s; E[7] = 0;
  E[8] = Fx * s; E[9] = Fy * s; E[10] = Fz * s; E[11] = 0;
  E[12] = upx * r; E[13] = upy * r; E[14] = upz * r; E[15] = 1;
  return out;
}

class Nav {
  constructor(site) {
    this.nodes = []; // [x, y]
    this.adj = [];
    const add = (x, y) => { this.nodes.push([x, y]); this.adj.push([]); return this.nodes.length - 1; };
    const link = (a, b) => { if (a === b) return; if (!this.adj[a].includes(b)) this.adj[a].push(b); if (!this.adj[b].includes(a)) this.adj[b].push(a); };
    for (const st of site.streets) {
      let prev = -1;
      const p = st.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, ay] = p[i], [bx, by] = p[i + 1];
        const L = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.round(L / 0.25));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          const id = add(ax + (bx - ax) * t, ay + (by - ay) * t);
          if (prev >= 0) link(prev, id);
          prev = id;
        }
      }
      const last = p[p.length - 1];
      const id = add(last[0], last[1]);
      if (prev >= 0) link(prev, id);
    }
    const plaza = add(site.plaza[0], site.plaza[1]);
    this.plaza = plaza;
    // Junctions between streets.
    const N = this.nodes.length;
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
      const d = Math.hypot(this.nodes[a][0] - this.nodes[b][0], this.nodes[a][1] - this.nodes[b][1]);
      if (d < 0.2) link(a, b);
    }
    const near = this.nearestK(site.plaza[0], site.plaza[1], 4);
    for (const i of near) link(plaza, i);
    if (N === 1) { /* no streets: plaza only */ }
  }
  nearest(x, y) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = (this.nodes[i][0] - x) ** 2 + (this.nodes[i][1] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  nearestK(x, y, k) {
    return this.nodes.map((p, i) => [i, (p[0] - x) ** 2 + (p[1] - y) ** 2]).sort((a, b) => a[1] - b[1]).slice(1, k + 1).map(a => a[0]);
  }
  path(ax, ay, bx, by) {
    const s = this.nearest(ax, ay), g = this.nearest(bx, by);
    const pts = [];
    if (s !== g) {
      const came = new Map([[s, -1]]);
      const queue = [s];
      let found = false;
      while (queue.length) {
        const c = queue.shift();
        if (c === g) { found = true; break; }
        for (const nb of this.adj[c]) if (!came.has(nb)) { came.set(nb, c); queue.push(nb); }
      }
      if (found) {
        let c = g;
        while (c !== -1) { pts.push(this.nodes[c]); c = came.get(c); }
        pts.reverse();
      }
    } else pts.push(this.nodes[s]);
    pts.push([bx, by]);
    return pts;
  }
}

let AGENT_ID = 1;

class SiteSim {
  constructor(site, world, people) {
    this.site = site; this.world = world; this.people = people;
    this.field = world.field;
    this.nav = new Nav(site);
    this.culture = site.s.culture === 'ruin' ? 'human' : site.s.culture;
    this.race = this.culture;
    const [lat, lon] = dirToLatLon(site.d);
    this.lon = lon;
    this.agents = [];
    this.alarm = null;
    this.rnd = mulberry32(hashString(site.s.id) ^ 0x51f);
    this.spawn();
  }

  spots(kind) { return this.site.work.filter(w => w.kind === kind); }

  spawn() {
    const site = this.site, s = site.s, rnd = this.rnd;
    const total = POP[s.kind] ?? 20;
    if (!total) return;
    const doors = site.doors;
    const homes = doors.filter(d => d.kind === 'home' || d.kind === 'farm');
    const byRole = (k) => doors.filter(d => d.kind === k);
    // Work spots from model anchors belonging to this site.
    const A = this.people.structures.anchors;
    const localOf = (p) => {
      const q = p.clone().normalize();
      const dx = q.x - site.d[0], dy = q.y - site.d[1], dz = q.z - site.d[2];
      return { x: (dx * site.e[0] + dy * site.e[1] + dz * site.e[2]) * R, y: (dx * site.n[0] + dy * site.n[1] + dz * site.n[2]) * R };
    };
    const forges = [], seats = [], works = [];
    for (const a of A.work) if (a.site === site) { const l = localOf(a.p); l.model = a.rec.model; works.push(l); }
    for (const a of A.seat) if (a.site === site) seats.push(localOf(a.p));
    for (const w of works) if (w.model === 'smithy' || w.model === 'dwarf_forge' || w.model === 'lava_forge') forges.push(w);
    const stalls = this.spots('stall').concat(works.filter(w => w.model === 'stall' || w.model === 'stall_red'));
    const fields = this.spots('field');
    const docks = this.spots('dock');
    const temple = byRole('temple')[0] || byRole('castle')[0];
    const tavern = byRole('tavern')[0];
    const construct = works.filter(w => w.model && w.model.startsWith('construct'));
    const mines = byRole('mine').concat(works.filter(w => w.model === 'mine_entrance'));
    const gates = byRole('gate').concat(byRole('guard'));
    const gather = this.spots('gather').concat(this.spots('well'), this.spots('pray'), this.spots('dance'), this.spots('fire'));

    const roles = [];
    const push = (role, n) => { for (let i = 0; i < n; i++) roles.push(role); };
    const cult = this.culture;
    if (cult === 'human') {
      push('guard', Math.max(2, Math.round(total * 0.1)));
      push('smith', Math.min(forges.length * 2, Math.round(total * 0.06) + 1));
      push('merchant', Math.min(stalls.length, Math.round(total * 0.12)));
      push('farmer', fields.length ? Math.round(total * 0.2) : 0);
      push('priest', temple ? 2 : 0);
      push('child', Math.round(total * 0.12));
      push('elder', Math.round(total * 0.08));
      push('builder', construct.length ? 5 : 0);
      push('fisher', docks.length ? 3 : 0);
      push('bard', tavern ? 1 : 0);
      push('noble', s.kind === 'capital' ? 4 : 0);
    } else if (cult === 'elf') { push('guard', 4); push('priest', 4); push('elder', 5); push('bard', 2); push('child', 4); }
    else if (cult === 'dwarf') { push('guard', 5); push('smith', Math.max(2, forges.length * 2)); push('miner', mines.length ? 8 : 2); push('elder', 3); push('child', 3); }
    else if (cult === 'fae') { push('dancer', Math.round(total * 0.4)); push('elder', 3); push('child', 4); }
    else if (cult === 'beast') { push('hunter', 6); push('guard', 4); push('dancer', 6); push('elder', 4); push('child', 5); push('smith', 1); }
    else if (cult === 'draconic') { push('guard', 6); push('priest', 6); push('smith', Math.max(2, forges.length * 2)); push('child', 4); push('merchant', 3); }
    else if (cult === 'undead') { push('priest', 5); push('guard', 4); push('elder', 6); push('smith', 1); }
    while (roles.length < total) roles.push('villager');
    roles.length = total;

    const pal = PAL[cult] || PAL.human;
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    for (const role of roles) {
      const home = homes.length ? pick(homes) : { x: site.plaza[0] + (rnd() - 0.5), y: site.plaza[1] + (rnd() - 0.5) };
      const ag = {
        id: AGENT_ID++, role, race: cult, home,
        colA: role === 'guard' ? (GUARD_TABARD[cult] || pick(pal.cloth)) : pick(pal.cloth), colB: pick(pal.pants), skin: pick(pal.skin), hair: pick(pal.hair),
        scale: (role === 'child' ? 0.62 : 0.9 + rnd() * 0.14) * 0.78,
        x: home.x, y: home.y, fx: 0, fy: 1, path: null, pi: 0, act: ACT.idle, tool: 0, speed: 0.06 + rnd() * 0.025,
        phase: rnd() * 100, inside: false, busyUntil: 0, task: null, name: null,
      };
      // Workplace
      if (role === 'smith') ag.work = forges.length ? pick(forges) : null;
      if (role === 'merchant') ag.work = stalls.length ? pick(stalls) : null;
      if (role === 'farmer') ag.work = fields.length ? pick(fields) : null;
      if (role === 'fisher') ag.work = docks.length ? pick(docks) : null;
      if (role === 'builder') ag.work = construct.length ? pick(construct) : null;
      if (role === 'miner') ag.work = mines.length ? pick(mines) : (forges[0] || null);
      if (role === 'priest') ag.work = temple ? { x: temple.x, y: temple.y } : (gather[0] || null);
      if (role === 'guard') ag.work = gates.length ? pick(gates) : null;
      if (role === 'elder') ag.work = seats.length ? pick(seats) : (gather.length ? pick(gather) : null);
      if (role === 'dancer') ag.work = gather.length ? pick(gather) : null;
      if (role === 'bard') ag.work = tavern ? { x: tavern.x, y: tavern.y } : null;
      ag.tavern = tavern ? { x: tavern.x + (rnd() - 0.5) * 0.12, y: tavern.y + (rnd() - 0.5) * 0.12 } : null;
      ag.name = this.people.nameFor(ag, rnd);
      // Start partway into the day so the town looks lived-in immediately.
      this.planNext(ag, true);
      if (ag.path) { const k = Math.floor(rnd() * ag.path.length); ag.pi = k; const p = ag.path[k]; ag.x = p[0]; ag.y = p[1]; }
      else if (ag.target) { ag.x = ag.target.x; ag.y = ag.target.y; }
      this.agents.push(ag);
    }
  }

  hour() { return this.people.clock.hourAt(this.lon); }

  // Decide the next thing to do from the schedule.
  planNext(ag, init = false) {
    const h = this.hour();
    const rnd = this.rnd;
    const night = h < 5.5 || h > 21.5;
    const evening = h >= 18 && h <= 22.5;
    const undead = ag.race === 'undead';
    const asleep = undead ? (h > 7.5 && h < 18.5 && rnd() < 0.6) : night;
    let target = null, act = ACT.idle, tool = TOOL.none, dur = 20 + rnd() * 40;
    const site = this.site;
    const plaza = { x: site.plaza[0] + (rnd() - 0.5) * 0.5, y: site.plaza[1] + (rnd() - 0.5) * 0.5 };
    const role = ag.role;
    if (role === 'guard') {
      // Guards work around the clock: posts and patrols, torches after dark.
      tool = night || evening ? TOOL.torch : (ag.race === 'human' && rnd() < 0.4 ? TOOL.sword : TOOL.spear);
      if (rnd() < 0.5 && ag.work) { target = ag.work; act = ACT.guard; dur = 30 + rnd() * 40; }
      else {
        const n = this.nav.nodes[Math.floor(rnd() * this.nav.nodes.length)];
        target = { x: n[0], y: n[1] }; act = ACT.guard; dur = 4 + rnd() * 8;
      }
    } else if (asleep) {
      target = ag.home; act = ACT.idle; dur = 60 + rnd() * 60; ag.goInside = true;
    } else if (evening && ag.tavern && role !== 'child' && rnd() < 0.6) {
      target = ag.tavern; act = rnd() < 0.3 ? ACT.cheer : ACT.talk; dur = 30 + rnd() * 50;
      if (role === 'bard') { act = ACT.dance; tool = TOOL.lute; }
    } else {
      const work = ag.work;
      const workHours = h >= 6.5 && h <= 18.5;
      if (role === 'smith' && work && workHours) { target = work; act = ACT.hammer; tool = TOOL.hammer; dur = 40 + rnd() * 60; }
      else if (role === 'merchant' && work && workHours) { target = work; act = rnd() < 0.6 ? ACT.talk : ACT.idle; dur = 40 + rnd() * 60; }
      else if (role === 'farmer' && work && workHours) {
        target = { x: work.x + (rnd() - 0.5) * 0.4, y: work.y + (rnd() - 0.5) * 0.4 };
        const r = rnd(); act = r < 0.6 ? ACT.farm : r < 0.8 ? ACT.carry : ACT.idle; tool = act === ACT.farm ? TOOL.hoe : act === ACT.carry ? TOOL.sack : 0; dur = 30 + rnd() * 50;
      } else if (role === 'fisher' && work && h > 4.5 && h < 13) { target = work; act = ACT.fish; tool = TOOL.rod; dur = 60 + rnd() * 60; }
      else if (role === 'builder' && work && workHours) { target = { x: work.x + (rnd() - 0.5) * 0.1, y: work.y + (rnd() - 0.5) * 0.1 }; act = rnd() < 0.6 ? ACT.hammer : ACT.carry; tool = act === ACT.hammer ? TOOL.hammer : TOOL.sack; dur = 20 + rnd() * 30; }
      else if (role === 'miner' && workHours) { target = work ? { x: work.x + (rnd() - 0.5) * 0.2, y: work.y + (rnd() - 0.5) * 0.2 } : plaza; act = rnd() < 0.6 ? ACT.mine : ACT.carry; tool = act === ACT.mine ? TOOL.pick : TOOL.sack; dur = 30 + rnd() * 40; }
      else if (role === 'priest') { target = work ? { x: work.x + (rnd() - 0.5) * 0.3, y: work.y + (rnd() - 0.5) * 0.3 } : plaza; act = rnd() < 0.6 ? ACT.pray : ACT.talk; tool = ag.race === 'elf' || ag.race === 'draconic' ? TOOL.staff : 0; dur = 30 + rnd() * 40; }
      else if (role === 'elder') { target = work || plaza; act = rnd() < 0.7 ? ACT.sit : ACT.talk; dur = 60 + rnd() * 80; }
      else if (role === 'child') { target = { x: plaza.x + (rnd() - 0.5) * 0.4, y: plaza.y + (rnd() - 0.5) * 0.4 }; act = rnd() < 0.6 ? ACT.play : ACT.idle; dur = 8 + rnd() * 16; }
      else if (role === 'dancer') { target = work ? { x: work.x + (rnd() - 0.5) * 0.35, y: work.y + (rnd() - 0.5) * 0.35 } : plaza; act = rnd() < 0.6 ? ACT.dance : ACT.talk; dur = 15 + rnd() * 25; }
      else if (role === 'hunter') {
        const a = rnd() * Math.PI * 2, r = site.s.radius * (1.2 + rnd() * 1.5);
        target = { x: Math.sin(a) * r, y: Math.cos(a) * r }; act = ACT.idle; tool = TOOL.bow; dur = 10 + rnd() * 20;
      } else if (role === 'bard') { target = plaza; act = ACT.dance; tool = TOOL.lute; dur = 20 + rnd() * 20; }
      else if (role === 'noble') { target = plaza; act = ACT.talk; dur = 20 + rnd() * 40; }
      else {
        // villager errands: fetch water, visit the market, chat, carry goods
        const r = rnd();
        const wells = this.spots('well').concat(this.spots('gather'));
        if (r < 0.25 && wells.length) { const w = wells[Math.floor(rnd() * wells.length)]; target = { x: w.x + (rnd() - 0.5) * 0.1, y: w.y + (rnd() - 0.5) * 0.1 }; act = ACT.idle; tool = TOOL.bucket; dur = 6 + rnd() * 10; }
        else if (r < 0.5) { target = plaza; act = ACT.talk; dur = 15 + rnd() * 30; }
        else if (r < 0.7) { const hm = site.doors[Math.floor(rnd() * site.doors.length)]; target = hm ? { x: hm.x, y: hm.y } : plaza; act = ACT.talk; dur = 10 + rnd() * 20; }
        else if (r < 0.85) { target = ag.home; act = ACT.idle; dur = 20 + rnd() * 30; }
        else { target = plaza; act = ACT.carry; tool = TOOL.sack; dur = 5 + rnd() * 10; }
      }
    }
    if (!target) target = plaza;
    ag.target = target; ag.nextAct = act; ag.nextTool = tool; ag.dur = dur;
    ag.carryTool = tool === TOOL.sack || tool === TOOL.bucket || tool === TOOL.torch || tool === TOOL.spear || tool === TOOL.lute || tool === TOOL.staff ? tool : 0;
    if (!init && ag.goInside && !asleep) ag.goInside = false;
    const p = this.nav.path(ag.x, ag.y, target.x, target.y);
    ag.path = p; ag.pi = 0;
    ag.state = 'walk';
    if (init && !(ag.goInside)) { ag.state = 'act'; ag.x = target.x; ag.y = target.y; ag.path = null; ag.busyUntil = this.people.time + rnd() * dur; ag.act = act; ag.tool = tool; }
    if (init && ag.goInside) { ag.inside = true; ag.x = target.x; ag.y = target.y; ag.state = 'act'; ag.busyUntil = this.people.time + rnd() * dur; ag.path = null; }
  }

  update(dt) {
    const now = this.people.time;
    const al = this.alarm && this.alarm.until > now ? this.alarm : null;
    for (const ag of this.agents) {
      if (al) { this.react(ag, al, dt); continue; }
      if (ag.reacting) { ag.reacting = false; this.planNext(ag); }
      if (ag.state === 'walk') {
        const p = ag.path;
        if (!p || ag.pi >= p.length) { ag.state = 'act'; ag.busyUntil = now + ag.dur; ag.act = ag.nextAct; ag.tool = ag.nextTool; if (ag.goInside) ag.inside = true; continue; }
        const [tx, ty] = p[ag.pi];
        const dx = tx - ag.x, dy = ty - ag.y;
        const d = Math.hypot(dx, dy);
        const sp = ag.speed * (ag.race === 'undead' ? 0.55 : 1) * (ag.role === 'child' ? 1.3 : 1);
        if (d < 0.02) { ag.pi++; continue; }
        const st = Math.min(d, sp * dt);
        ag.x += (dx / d) * st; ag.y += (dy / d) * st;
        ag.fx += ((dx / d) - ag.fx) * Math.min(1, dt * 8); ag.fy += ((dy / d) - ag.fy) * Math.min(1, dt * 8);
        ag.act = ag.carryTool === TOOL.sack || ag.carryTool === TOOL.bucket ? ACT.carry : ACT.walk;
        ag.tool = ag.carryTool;
        ag.inside = false;
      } else {
        if (now > ag.busyUntil) this.planNext(ag);
        else if (ag.act === ACT.talk || ag.act === ACT.idle || ag.act === ACT.sit) {
          // Face the nearest neighbour when chatting.
          if (!ag.faceT || now > ag.faceT) {
            ag.faceT = now + 3 + Math.random() * 4;
            let best = null, bd = 0.25;
            for (const o of this.agents) { if (o === ag || o.inside) continue; const dd = Math.hypot(o.x - ag.x, o.y - ag.y); if (dd < bd) { bd = dd; best = o; } }
            if (best) { const dx = best.x - ag.x, dy = best.y - ag.y, l = Math.hypot(dx, dy) || 1; ag.fx = dx / l; ag.fy = dy / l; if (ag.act !== ACT.sit) ag.act = ACT.talk; }
          }
        }
      }
    }
  }

  react(ag, al, dt) {
    ag.reacting = true;
    if (al.kind === 'thief') {
      if (!this.thief || this.thief.inside || this.thiefAlarm !== al) {
        this.thiefAlarm = al;
        this.thief = this.agents.find(a => a.role === 'villager' && !a.inside) || this.agents[0];
        this.thiefStart = this.people.time;
      }
      const th = this.thief;
      const t = this.people.time - this.thiefStart;
      if (ag === th) {
        // The cutpurse darts around the market square.
        const a = t * 0.9, r = 0.45 + 0.2 * Math.sin(t * 0.37);
        this.moveToward(ag, al.x + Math.sin(a) * r, al.y + Math.cos(a) * r, dt, 2.6, ACT.run, TOOL.sack);
        return;
      }
      const dx = th.x - ag.x, dy = th.y - ag.y, d = Math.hypot(dx, dy) || 1;
      if (ag.role === 'guard') {
        if (d > 0.07) this.moveToward(ag, th.x, th.y, dt, 2.4, ACT.run, TOOL.sword);
        else { ag.act = ACT.fight; ag.tool = TOOL.sword; ag.fx = dx / d; ag.fy = dy / d; }
      } else if (d < 1.5) { ag.act = ACT.point; ag.fx = dx / d; ag.fy = dy / d; }
      return;
    }
    const dx = al.x - ag.x, dy = al.y - ag.y, d = Math.hypot(dx, dy) || 1;
    const brave = ag.role === 'guard' || (al.kind === 'fire' && ag.role !== 'child');
    if (al.kind === 'dragon' || al.kind === 'sky') {
      // Look up and point, children and elders run home.
      if (ag.role === 'child' || ag.role === 'elder' || (ag.id % 3 === 0)) this.moveToward(ag, ag.home.x, ag.home.y, dt, 2.1, ACT.flee);
      else { ag.act = ag.id % 2 ? ACT.point : ACT.cheer; ag.fx = dx / d; ag.fy = dy / d; }
      return;
    }
    if (al.kind === 'festival') {
      if (d > 0.35) this.moveToward(ag, al.x + Math.sin(ag.id) * 0.3, al.y + Math.cos(ag.id) * 0.3, dt, 1.0, ACT.walk);
      else { ag.act = ag.id % 3 === 0 ? ACT.cheer : ACT.dance; ag.fx = dx / d; ag.fy = dy / d; }
      return;
    }
    if (brave) {
      if (d > 0.14) this.moveToward(ag, al.x - (dx / d) * 0.1, al.y - (dy / d) * 0.1, dt, 2.2, ACT.run, al.kind === 'fire' ? TOOL.bucket : TOOL.sword);
      else { ag.act = al.kind === 'fire' ? ACT.carry : ACT.fight; ag.tool = al.kind === 'fire' ? TOOL.bucket : TOOL.sword; ag.fx = dx / d; ag.fy = dy / d; }
      return;
    }
    if (d < 1.4) this.moveToward(ag, ag.home.x, ag.home.y, dt, 2.2, ACT.flee);
    else { ag.act = ACT.point; ag.fx = dx / d; ag.fy = dy / d; }
  }

  moveToward(ag, x, y, dt, mul, act, tool = 0) {
    const dx = x - ag.x, dy = y - ag.y, d = Math.hypot(dx, dy);
    if (d < 0.03) { ag.act = act === ACT.flee ? ACT.idle : ACT.idle; if (act === ACT.flee) ag.inside = true; return; }
    const st = Math.min(d, ag.speed * mul * dt);
    ag.x += (dx / d) * st; ag.y += (dy / d) * st;
    ag.fx = dx / d; ag.fy = dy / d;
    ag.act = act; ag.tool = tool; ag.inside = false;
  }

  worldPos(ag, out) {
    const p = this.site.dir(ag.x, ag.y);
    const h = Math.max(0, this.field.height(p[0], p[1], p[2]));
    return out.set(p[0], p[1], p[2]).multiplyScalar(R + h);
  }

  render(crowds) {
    const site = this.site;
    for (const ag of this.agents) {
      if (ag.inside) continue;
      const lane = ((ag.id % 5) - 2) * 0.012;
      const x = ag.x + (-ag.fy) * lane * (ag.state === 'walk' ? 1 : 0), y = ag.y + ag.fx * lane * (ag.state === 'walk' ? 1 : 0);
      const d = site.dir(x, y);
      let h = Math.max(0, this.field.height(d[0], d[1], d[2]));
      if (ag.race === 'fae') h += 0.012 + 0.006 * Math.sin(this.people.time * 2 + ag.id);
      localMatrix(_m, d, h, site.e, site.n, ag.fx, ag.fy, ag.scale);
      ag.world = ag.world || new THREE.Vector3();
      ag.world.set(_m.elements[12], _m.elements[13], _m.elements[14]);
      crowds[ag.race].push(_m, ag.act, ag.phase, 1, ag.tool, ag.colA, ag.colB, ag.skin, ag.hair);
    }
  }
}

const NAMES = {
  human: { first: ['Aldric', 'Brenna', 'Cedric', 'Dagny', 'Edda', 'Falk', 'Gwen', 'Hale', 'Isolde', 'Jory', 'Kestra', 'Lorne', 'Maud', 'Niall', 'Osric', 'Perrin', 'Quill', 'Rowan', 'Sabine', 'Tamsin', 'Ulric', 'Vera', 'Wystan', 'Yara'], last: ['Ashdown', 'Barrow', 'Cobb', 'Dunmore', 'Fletcher', 'Greaves', 'Hollis', 'Marsh', 'Oakes', 'Thatcher', 'Wren', 'Smith', 'Miller', 'Tanner'] },
  elf: { first: ['Aerith', 'Caelir', 'Elowen', 'Faelar', 'Ilyra', 'Lorien', 'Maelis', 'Nimue', 'Sylvar', 'Thalion', 'Vaela'], last: ['of the Silver Bough', 'Moonweaver', 'Starwhisper', 'Dawnsong'] },
  dwarf: { first: ['Bori', 'Dagna', 'Durin', 'Grima', 'Hilda', 'Korrin', 'Morga', 'Thrain', 'Ulfa', 'Brokk'], last: ['Ironhand', 'Deepdelver', 'Stonebeard', 'Anvilborn', 'Coppervein'] },
  fae: { first: ['Bramble', 'Dewdrop', 'Fennel', 'Hollyhock', 'Moth', 'Nettle', 'Pip', 'Sorrel', 'Thistle', 'Wisp'], last: ['of the Ring', 'Lanternfoot', 'Mooncap'] },
  beast: { first: ['Grakka', 'Horn', 'Kurr', 'Maw', 'Rakk', 'Snarl', 'Tusk', 'Ursa', 'Vorra', 'Yrl'], last: ['Bloodfang', 'Longstride', 'Ashpelt', 'Thornhide', 'Swiftclaw'] },
  undead: { first: ['Old Bertram', 'Lady Mirel', 'Sexton Voss', 'Brother Ash', 'Widow Cray', 'Sir Hollen'], last: ['(departed)', 'the Restless', 'of the Mere'] },
  draconic: { first: ['Kesh', 'Ssarva', 'Tokk', 'Vrisk', 'Yzza', 'Zarn', 'Ixi', 'Rhask'], last: ['Scaleborn', 'Emberclaw', 'of the Brazier', 'Cinderkin'] },
};
const ROLE_TITLES = { guard: 'guard', smith: 'smith', merchant: 'merchant', farmer: 'farmer', priest: 'priest', child: 'child', elder: 'elder', builder: 'mason',
  fisher: 'fisher', bard: 'bard', noble: 'courtier', villager: 'townsfolk', miner: 'miner', dancer: 'reveler', hunter: 'hunter' };
const RACE_TITLES = { human: 'human', elf: 'elf', dwarf: 'dwarf', fae: 'faeborne', beast: 'beastfolk', undead: 'restless dead', draconic: 'dragonkin' };

export const DOING = {
  [ACT.idle]: 'taking a breather', [ACT.walk]: 'on an errand', [ACT.run]: 'running', [ACT.hammer]: 'hammering at the forge', [ACT.farm]: 'working the field',
  [ACT.talk]: 'trading gossip', [ACT.carry]: 'hauling goods', [ACT.cheer]: 'cheering', [ACT.guard]: 'keeping watch', [ACT.chop]: 'chopping wood', [ACT.sit]: 'resting their feet',
  [ACT.pray]: 'at prayer', [ACT.dance]: 'dancing', [ACT.fish]: 'fishing off the dock', [ACT.flee]: 'fleeing for cover', [ACT.fight]: 'fighting', [ACT.play]: 'playing tag',
  [ACT.point]: 'pointing at the sky', [ACT.mine]: 'swinging a pick',
};

export class People {
  constructor(world, sites, clock, structures, crowds) {
    this.world = world; this.sites = sites; this.clock = clock; this.structures = structures;
    this.time = 0;
    this.active = new Map();
    this.crowds = {};
    for (const race of ['human', 'elf', 'dwarf', 'fae', 'beast', 'undead', 'draconic']) this.crowds[race] = crowds.get(race);
  }

  nameFor(ag, rnd) {
    const N = NAMES[ag.race] || NAMES.human;
    const f = N.first[Math.floor(rnd() * N.first.length)], l = N.last[Math.floor(rnd() * N.last.length)];
    return `${f} ${l}`;
  }

  describe(ag, site) {
    return { title: ag.name, sub: `${RACE_TITLES[ag.race]} ${ROLE_TITLES[ag.role] || ''} of ${site.s.name}`, doing: DOING[ag.act] || 'going about their day' };
  }

  simFor(site) { return this.active.get(site.s.id) || null; }

  update(dt, camera, alt) {
    this.time += dt;
    const cam = camera.position;
    // Activate settlements near the camera (limit to the closest few).
    if (!this.lastScan || this.time - this.lastScan > 0.5) {
      this.lastScan = this.time;
      const want = [];
      if (alt < 7) {
        for (const site of this.sites) {
          if (!site.centerWorld) continue;
          const d = site.centerWorld.distanceTo(cam);
          if (d < site.s.radius + 5.5) want.push([d, site]);
        }
      }
      want.sort((a, b) => a[0] - b[0]);
      const keep = new Set(want.slice(0, 3).map(w => w[1].s.id));
      for (const id of [...this.active.keys()]) if (!keep.has(id)) this.active.delete(id);
      for (const [, site] of want.slice(0, 3)) if (!this.active.has(site.s.id)) this.active.set(site.s.id, new SiteSim(site, this.world, this));
    }
    for (const sim of this.active.values()) { sim.update(dt); sim.render(this.crowds); }
  }

  // All visible agents (for picking and following).
  *visibleAgents() {
    for (const sim of this.active.values()) for (const ag of sim.agents) if (!ag.inside && ag.world) yield { ag, sim };
  }

  get count() { let n = 0; for (const s of this.active.values()) n += s.agents.length; return n; }
}
