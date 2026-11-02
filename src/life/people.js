// Townsfolk as a view of persistent residents. Every figure on screen is a person record from the
// simulation; this module only interpolates their authoritative tasks along the walkable graph.
// Which towns are drawn depends on the camera and real time, never on world time (finding F03).

import * as THREE from 'three';
import { ACT } from '../render/rig.js';
import { TOOL } from '../models/characters.js';
import { PLANET_RADIUS } from '../core/sphere.js';
import { hourAt } from '../sim/clock.js';
import { personView } from '../sim/explain.js';

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
const RUNNING = new Set(['respond', 'salvage']);
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

const pick = (list, n) => list[n % list.length];

function look(p) {
  const pal = PAL[p.species] || PAL.human, a = p.appearance;
  return {
    colA: p.occupation === 'guard' ? (GUARD_TABARD[p.species] || pick(pal.cloth, a)) : pick(pal.cloth, a),
    colB: pick(pal.pants, a >> 4), skin: pick(pal.skin, a >> 8), hair: pick(pal.hair, a >> 12),
    scale: (p.age === 'child' ? 0.62 : p.age === 'elder' ? 0.9 : 0.92 + (a % 13) / 100) * 0.78,
  };
}

class SiteView {
  constructor(site, place, people) {
    this.site = site; this.place = place; this.people = people;
    this.field = people.world.field;
    this.lon = site.s.lon;
    this.agents = new Map();
    this.paths = new Map();
    this.sync();
  }
  // Agents are exactly the residents present here (not travelling between towns).
  sync() {
    const state = this.people.sim.state;
    const here = new Set();
    for (const p of Object.values(state.residents)) if (p.at.site === this.place.id && !p.journey) here.add(p.id);
    for (const id of this.agents.keys()) if (!here.has(id)) this.agents.delete(id);
    for (const id of here) if (!this.agents.has(id)) {
      const p = state.residents[id];
      this.agents.set(id, { personId: id, id: p.appearance, name: p.name, race: p.species, role: p.occupation, ...look(p), x: 0, y: 0, fx: 0, fy: 1, act: ACT.idle, tool: TOOL.none, inside: false, phase: (p.appearance % 1000) / 10, world: new THREE.Vector3() });
    }
    this.syncTick = state.tick;
  }
  path(from, to) {
    const key = `${from}>${to}`;
    let p = this.paths.get(key);
    if (!p) {
      const route = this.place.nav.route(from, to);
      const pts = route ? this.place.nav.points(route) : [this.place.nav.nodes[from], this.place.nav.nodes[to]];
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      p = { pts, cum, length: cum.at(-1) };
      if (this.paths.size > 2000) this.paths.clear();
      this.paths.set(key, p);
    }
    return p;
  }
  update(now) {
    const state = this.people.sim.state, nodes = this.place.nav.nodes;
    const night = (() => { const h = hourAt(now, this.lon); return h < 6 || h > 20; })();
    // Figures standing at the same spot share it in a small ring instead of overlapping.
    const crowd = new Map();
    for (const ag of this.agents.values()) {
      const p = state.residents[ag.personId], t = p?.task;
      if (!p) { ag.inside = true; continue; }
      if (!t) {
        // Before a first decision, a resident simply stands where the record places them.
        const [nx, ny] = nodes[p.at.node];
        ag.x = nx; ag.y = ny; ag.inside = false; ag.act = ACT.idle; ag.tool = TOOL.none; ag.walking = false;
        continue;
      }
      const pose = t.pose || ['idle', 'none'];
      if (now < t.arr && t.from !== t.to) {
        const path = this.path(t.from, t.to);
        const goal = path.length * Math.max(0, Math.min(1, (now - t.dep) / Math.max(1e-6, t.arr - t.dep)));
        let k = 1;
        while (k < path.pts.length - 1 && path.cum[k] < goal) k++;
        const a = path.pts[k - 1], b = path.pts[k], seg = Math.max(1e-9, path.cum[k] - path.cum[k - 1]);
        const f = Math.max(0, Math.min(1, (goal - path.cum[k - 1]) / seg));
        ag.x = a[0] + (b[0] - a[0]) * f; ag.y = a[1] + (b[1] - a[1]) * f;
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (L > 1e-6) { ag.fx = dx / L; ag.fy = dy / L; }
        const carrying = Object.keys(state.inventories[`inv:carry:${p.id}`]?.goods || {}).length > 0;
        ag.act = RUNNING.has(t.k) || pose[0] === 'run' || pose[0] === 'flee' ? (pose[0] === 'flee' ? ACT.flee : ACT.run) : carrying || pose[1] === 'bucket' ? ACT.carry : ACT.walk;
        ag.tool = carrying ? TOOL.sack : pose[1] === 'bucket' ? TOOL.bucket : night && p.occupation === 'guard' ? TOOL.torch : TOOL.none;
        ag.inside = false; ag.walking = true;
      } else {
        const key = t.to;
        const slot = crowd.get(key) || 0;
        crowd.set(key, slot + 1);
        const [nx, ny] = nodes[t.to];
        const ring = slot ? 0.035 + 0.012 * Math.floor((slot - 1) / 6) : 0, ang = slot * 1.0472 + (key % 7);
        ag.x = nx + Math.cos(ang) * ring; ag.y = ny + Math.sin(ang) * ring;
        ag.inside = t.inside;
        ag.act = ACT[pose[0]] ?? ACT.idle;
        ag.tool = TOOL[pose[1]] ?? TOOL.none;
        if (p.occupation === 'guard' && night && ag.tool === TOOL.spear) ag.tool = TOOL.torch;
        if (slot && ag.act === ACT.talk) { ag.fx = -Math.cos(ang); ag.fy = -Math.sin(ang); }
        ag.walking = false;
      }
    }
  }
  render(crowds, time) {
    const site = this.site;
    for (const ag of this.agents.values()) {
      if (ag.inside) continue;
      const d = site.dir(ag.x, ag.y);
      let h = Math.max(0, this.field.height(d[0], d[1], d[2]));
      if (ag.race === 'fae') h += 0.012 + 0.006 * Math.sin(time * 2 + ag.id);
      localMatrix(_m, d, h, site.e, site.n, ag.fx, ag.fy, ag.scale);
      ag.world.set(_m.elements[12], _m.elements[13], _m.elements[14]);
      (crowds[ag.race] || crowds.human).push(_m, ag.act, ag.phase, 1, ag.tool, ag.colA, ag.colB, ag.skin, ag.hair);
    }
  }
}

export class People {
  constructor(world, sites, catalog, structures, crowds, sim) {
    this.world = world; this.sites = sites; this.catalog = catalog; this.structures = structures; this.sim = sim;
    this.active = new Map();
    this.crowds = {};
    for (const race of ['human', 'elf', 'dwarf', 'fae', 'beast', 'undead', 'draconic']) this.crowds[race] = crowds.get(race);
    this.lastScan = -Infinity; this.lastCamera = new THREE.Vector3(); this.lastAlt = -1;
  }
  // `now` is canonical ticks including the interpolation fraction; `realMs` drives view streaming.
  update(now, camera, alt, realMs = performance.now()) {
    const cam = camera.position;
    if (cam.distanceToSquared(this.lastCamera) > 0.01 || alt !== this.lastAlt || realMs - this.lastScan > 250) {
      this.lastCamera.copy(cam); this.lastAlt = alt; this.lastScan = realMs;
      const want = [];
      if (alt < 7) for (const site of this.sites) {
        if (!site.centerWorld) continue;
        const d = site.centerWorld.distanceTo(cam);
        if (d < site.s.radius + 5.5) want.push([d, site]);
      }
      want.sort((a, b) => a[0] - b[0]);
      const keep = new Set(want.slice(0, 3).map(w => w[1].s.id));
      for (const id of [...this.active.keys()]) if (!keep.has(id)) this.active.delete(id);
      for (const [, site] of want.slice(0, 3)) if (!this.active.has(site.s.id)) this.active.set(site.s.id, new SiteView(site, this.catalog.byId[site.s.id], this));
    }
    const tick = this.sim.state.tick;
    for (const view of this.active.values()) {
      if (view.syncTick !== tick && realMs - (view.syncAt || 0) > 100) { view.sync(); view.syncAt = realMs; }
      view.update(now);
      view.render(this.crowds, now * 0.29);
    }
  }
  reset() { this.active.clear(); this.lastScan = -Infinity; }
  simFor(site) { return this.active.get(site.s.id) || null; }
  describe(ag) { return personView(this.sim.state, this.catalog, ag.personId); }
  *visibleAgents() { for (const view of this.active.values()) for (const ag of view.agents.values()) if (!ag.inside && ag.world.lengthSq() > 1) yield { ag, sim: view }; }
  get count() { let n = 0; for (const v of this.active.values()) n += v.agents.size; return n; }
}
