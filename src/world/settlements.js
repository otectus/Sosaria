// Settlement layout: streets, buildings, walls, farms, docks and the points of interest that
// villagers use. Works in each settlement's local tangent frame (x = east, y = north).

import { getModel } from '../models/registry.js';
import { HOUSE_COUNT } from '../models/human.js';
import { mulberry32, hashString, smoothstep } from '../core/noise.js';
import { offsetInFrame, PLANET_RADIUS, dirToLatLon, arcDist, normalize } from '../core/sphere.js';
import { I_H, INFO_SIZE } from './field.js';

const R = PLANET_RADIUS;

// Oriented rectangle in local 2D.
function obb(x, y, w, d, th, pad = 0.015) {
  const c = Math.cos(th), s = Math.sin(th);
  // forward (model +Z) = (sin th, cos th); right = (-cos th, sin th)
  return { x, y, hw: w / 2 + pad, hd: d / 2 + pad, fx: s, fy: c, rx: -c, ry: s };
}
function obbOverlap(a, b) {
  const axes = [[a.rx, a.ry], [a.fx, a.fy], [b.rx, b.ry], [b.fx, b.fy]];
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [ax, ay] of axes) {
    const ra = a.hw * Math.abs(a.rx * ax + a.ry * ay) + a.hd * Math.abs(a.fx * ax + a.fy * ay);
    const rb = b.hw * Math.abs(b.rx * ax + b.ry * ay) + b.hd * Math.abs(b.fx * ax + b.fy * ay);
    if (Math.abs(dx * ax + dy * ay) > ra + rb) return false;
  }
  return true;
}

function segDist2D(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const L = ex * ex + ey * ey;
  let t = L > 0 ? ((px - ax) * ex + (py - ay) * ey) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}

class Site {
  constructor(world, s, rnd) {
    this.world = world; this.s = s; this.rnd = rnd;
    this.field = world.field;
    this.d = s.d; this.e = s.east; this.n = s.north;
    this.items = [];     // placements
    this.boxes = [];     // collision OBBs
    this.streets = [];   // {pts:[[x,y]...], hw, paved}
    this.doors = [];     // {x,y, kind}
    this.work = [];      // {x,y, kind}
    this.info = new Float64Array(INFO_SIZE);
    this.water = [];
  }
  dir(x, y) { return offsetInFrame(this.d, this.e, this.n, x, y); }
  h(x, y) { const p = this.dir(x, y); return this.field.height(p[0], p[1], p[2]); }
  wet(x, y) {
    const p = this.dir(x, y);
    this.field.heightInfo(p[0], p[1], p[2], 0, this.info);
    const i = this.info;
    return i[I_H] < 0.06 || (i[3] - i[4]) < 0.08 || i[10] < 0.05;
  }
  slopeOK(x, y, w, d, th, maxDrop = 0.08) {
    const c = Math.cos(th), s = Math.sin(th);
    const hs = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = a * w / 2, lz = b * d / 2;
      hs.push(this.h(x + (-c) * lx + s * lz, y + s * lx + c * lz));
    }
    const mn = Math.min(...hs), mx = Math.max(...hs);
    return { ok: mx - mn < maxDrop && mn > 0.05, base: mn, drop: mx - mn };
  }
  onStreet(x, y, r) {
    for (const st of this.streets) {
      const p = st.pts;
      for (let i = 0; i < p.length - 1; i++) if (segDist2D(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < st.hw + r) return true;
    }
    return false;
  }
  collides(b) { for (const o of this.boxes) if (obbOverlap(b, o)) return true; return false; }

  // Try to place a model; returns the placement or null.
  place(model, x, y, th, opts = {}) {
    const m = getModel(model);
    const sc = opts.scale ?? 1;
    const w = (opts.w ?? m.footprint[0]) * sc, d = (opts.d ?? m.footprint[1]) * sc;
    const b = obb(x, y, w, d, th, opts.pad ?? 0.012);
    if (!opts.force) {
      if (this.collides(b)) return null;
      if (!opts.allowStreet && this.onStreet(x, y, Math.min(w, d) * 0.45)) return null;
      if (!opts.allowWet && this.wet(x, y)) return null;
    }
    const sl = this.slopeOK(x, y, w, d, th, opts.maxDrop ?? 0.1);
    if (!opts.force && !sl.ok) return null;
    if (!opts.noCollide) this.boxes.push(b);
    const it = { id: `building:${this.s.id}:${this.items.length}`, model, x, y, th, scale: sc, sy: opts.sy ?? sc, h: opts.h ?? (sl.base - (opts.sink ?? 0.0)), tag: opts.tag || null, role: opts.role || null };
    this.items.push(it);
    if (m.anchors.door && opts.role !== 'none') {
      const a = m.anchors.door;
      const c = Math.cos(th), s = Math.sin(th);
      const dx = x + (-c) * a[0] * sc + s * a[2] * sc, dy = y + s * a[0] * sc + c * a[2] * sc;
      this.doors.push({ x: dx, y: dy, kind: opts.role || 'home', item: it });
    }
    return it;
  }

  street(pts, hw, paved = true) { this.streets.push({ pts, hw, paved }); }

  // Buildings lining a polyline, both sides, facing it.
  lineStreet(pts, hw, models, opts = {}) {
    const step = opts.step ?? 0.3;
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      const tx = (bx - ax) / L, ty = (by - ay) / L;
      for (let s = acc; s < L; s += step) {
        const px = ax + tx * s, py = ay + ty * s;
        if (opts.skip && opts.skip(px, py)) continue;
        for (const side of [-1, 1]) {
          if (this.rnd() < (opts.gap ?? 0.12)) continue;
          const model = models(px, py);
          const m = getModel(model);
          const nx = -ty * side, ny = tx * side; // outward normal
          const off = hw + m.footprint[1] / 2 + 0.03 + this.rnd() * 0.02;
          const x = px + nx * off, y = py + ny * off;
          const th = Math.atan2(-nx, -ny); // face the street
          this.place(model, x, y, th, { role: opts.role || 'home' });
        }
      }
      acc = (acc + step - (L % step)) % step;
    }
  }
}

function roadExits(world, s, r) {
  const out = [];
  for (const road of world.roads) {
    let pts = null;
    if (road.a === s.id) pts = road.dirs;
    else if (road.b === s.id) pts = road.dirs.slice().reverse();
    if (!pts) continue;
    for (const p of pts) {
      if (arcDist(p, s.d) > r) {
        const v = [p[0] - s.d[0], p[1] - s.d[1], p[2] - s.d[2]];
        const x = (v[0] * s.east[0] + v[1] * s.east[1] + v[2] * s.east[2]) * R;
        const y = (v[0] * s.north[0] + v[1] * s.north[1] + v[2] * s.north[2]) * R;
        out.push(Math.atan2(x, y));
        break;
      }
    }
  }
  return out;
}

function fillAngles(angles, count, rnd) {
  const a = angles.slice();
  while (a.length < count) {
    if (!a.length) { a.push(rnd() * Math.PI * 2); continue; }
    a.sort((p, q) => p - q);
    let best = 0, gap = 0;
    for (let i = 0; i < a.length; i++) {
      const nx = i === a.length - 1 ? a[0] + Math.PI * 2 : a[i + 1];
      if (nx - a[i] > gap) { gap = nx - a[i]; best = i; }
    }
    a.push(a[best] + gap / 2 + (rnd() - 0.5) * 0.3);
  }
  return a.map(x => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
}

function radialPts(ang, r0, r1, seed, step = 0.2) {
  const pts = [];
  for (let r = r0; r <= r1 + 1e-6; r += step) {
    const a = ang + Math.sin(r * 1.4 + seed) * 0.1;
    pts.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return pts;
}
function ringPts(r, seed, step = 0.2) {
  const n = Math.max(12, Math.round((Math.PI * 2 * r) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.04 * Math.sin(a * 3 + seed));
    pts.push([Math.sin(a) * rr, Math.cos(a) * rr]);
  }
  return pts;
}

const houseModel = (rnd, big) => 'house' + (big ? 8 + Math.floor(rnd() * (HOUSE_COUNT - 8)) : Math.floor(rnd() * 8));

// ---------------------------------------------------------------------------------------------
function layoutHuman(site, world) {
  const s = site.s, rnd = site.rnd;
  const K = { capital: [7, 1.35, [1.25, 2.55], 3.9], city: [6, 0.5, [1.1, 2.1], 2.9], port: [5, 0.45, [1.2], 0], town: [5, 0.42, [1.25], 0],
    village: [3, 0.34, [], 0], hamlet: [2, 0.28, [], 0], castle: [2, 0.9, [], 1.05], fort: [2, 0.7, [], 1.0], lighthouse: [1, 0.25, [], 0], monastery: [1, 0.7, [], 0] }[s.kind];
  const [nRad, r0, rings, wallR] = K;
  const padR = s.radius;
  const exits = roadExits(world, s, padR * 1.1);
  const angles = fillAngles(exits, Math.max(nRad, exits.length), rnd);
  const mainAng = exits.length ? exits[0] : angles[0];
  const seed = rnd() * 10;
  const outerR = wallR ? wallR + 0.2 : padR * 1.02;
  site.plaza = [0, 0];

  // ---- Core: castle, keep or plaza ----
  if (s.kind === 'capital') {
    site.place('keep', 0, 0, mainAng, { force: true, tag: 'keep', role: 'castle' });
    // inner curtain wall ring with towers
    ringWall(site, 1.0, mainAng, 'tower', 5, true);
    // Market plaza along the main road
    site.plaza = [Math.sin(mainAng) * 2.45, Math.cos(mainAng) * 2.45];
  } else if (s.kind === 'castle' || s.kind === 'fort') {
    site.place(s.culture === 'dwarf' ? 'keep' : 'keep', 0, 0, mainAng, { force: true, scale: s.kind === 'fort' ? 0.75 : 0.9, tag: 'keep', role: 'castle' });
    ringWall(site, wallR, mainAng, 'tower_flat', 4, true);
  } else if (s.kind === 'lighthouse') {
    const sea = seaDirection(site, 1.0);
    const lx = Math.sin(sea) * 0.55, ly = Math.cos(sea) * 0.55;
    site.place('lighthouse', lx, ly, sea, { force: true, tag: 'lighthouse', role: 'work' });
    site.plaza = [-lx * 0.4, -ly * 0.4];
  } else if (s.kind === 'monastery') {
    site.place('abbey', 0, 0, mainAng, { force: true, tag: 'abbey', role: 'temple' });
    site.plaza = [Math.sin(mainAng) * 0.6, Math.cos(mainAng) * 0.6];
  }

  // ---- Streets ----
  const radStart = s.kind === 'capital' ? 1.2 : r0;
  for (const a of angles) {
    const pts = radialPts(a, radStart, outerR + (wallR ? 0.6 : 0.3), seed);
    site.street(pts, s.kind === 'hamlet' ? 0.05 : 0.065, s.kind !== 'hamlet' && s.kind !== 'village');
  }
  for (const r of rings) site.street(ringPts(r, seed), 0.055, true);
  if (s.kind === 'capital') {
    // plaza link and square
    const [px, py] = site.plaza;
    site.street([[px - 0.45, py], [px + 0.45, py]], 0.35, true);
  } else if (s.kind !== 'castle' && s.kind !== 'fort' && s.kind !== 'monastery' && s.kind !== 'lighthouse') {
    site.street([[-r0 * 0.9, 0], [r0 * 0.9, 0]], r0 * 0.9, ['city', 'town', 'port'].includes(s.kind));
  }

  // ---- Plaza furniture ----
  const [px, py] = site.plaza;
  if (s.kind === 'capital' || s.kind === 'city') {
    site.place('fountain', px, py, 0, { force: true, allowStreet: true, tag: 'fountain', role: 'none' });
    site.work.push({ x: px + 0.2, y: py, kind: 'gather' }, { x: px - 0.2, y: py + 0.1, kind: 'gather' });
    if (s.kind === 'capital') site.place('statue_king', px + 0.42, py + 0.25, rnd() * 6, { force: true, allowStreet: true, role: 'none' });
  } else if (['town', 'port', 'village', 'hamlet'].includes(s.kind)) {
    site.place('well', px + 0.05, py + 0.04, rnd() * 6, { force: true, allowStreet: true, tag: 'well', role: 'none' });
    site.work.push({ x: px + 0.12, y: py, kind: 'well' });
  }
  const stalls = { capital: 10, city: 8, port: 6, town: 5, village: 2, hamlet: 0 }[s.kind] || 0;
  const plazaR = s.kind === 'capital' ? 0.52 : r0 * 0.72;
  for (let i = 0; i < stalls; i++) {
    const a = (i / stalls) * Math.PI * 2 + 0.3;
    const x = px + Math.sin(a) * plazaR, y = py + Math.cos(a) * plazaR;
    const it = site.place(i % 2 ? 'stall' : 'stall_red', x, y, a + Math.PI, { allowStreet: true, force: false, pad: 0.004, role: 'none', tag: 'stall' });
    if (it) site.work.push({ x: x - Math.sin(a) * 0.08, y: y - Math.cos(a) * 0.08, kind: 'stall' });
  }

  // ---- Walls around capital/city ----
  if (wallR && (s.kind === 'capital' || s.kind === 'city')) ringWall(site, wallR, angles, 'tower_big', 0, false, angles);

  // ---- Special buildings near the plaza ----
  const specials = [];
  if (s.kind === 'capital') specials.push('cathedral', 'tavern', 'tavern', 'smithy', 'smithy', 'stable', 'granary', 'construct');
  else if (s.kind === 'city' || s.kind === 'port') specials.push('chapel', 'tavern', 'smithy', 'stable', 'granary');
  else if (s.kind === 'town') specials.push('chapel', 'tavern', 'smithy', 'granary');
  else if (s.kind === 'village') specials.push(s.inn ? 'tavern' : 'chapel', 'smithy', 'tavern');
  else if (s.kind === 'hamlet') specials.push(s.inn ? 'tavern' : 'smithy', s.inn ? 'stable' : 'granary');
  else if (s.kind === 'castle' || s.kind === 'fort') specials.push('smithy', 'stable');
  for (const sp of specials) {
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const a = rnd() * Math.PI * 2, r = (s.kind === 'capital' ? 1.6 : r0 + 0.25) + rnd() * (tries * 0.04 + 0.3);
      const x = px * (s.kind === 'capital' ? 0.6 : 1) + Math.sin(a) * r, y = py * (s.kind === 'capital' ? 0.6 : 1) + Math.cos(a) * r;
      const th = Math.atan2(px - x, py - y) + (rnd() - 0.5) * 0.4;
      const model = sp === 'construct' ? 'construct' + (Math.floor(world.day0 || 0) % 4) : sp;
      const role = sp === 'tavern' ? 'tavern' : sp === 'smithy' ? 'smithy' : sp === 'chapel' || sp === 'cathedral' ? 'temple' : sp === 'construct' ? 'construct' : 'work';
      if (site.place(model, x, y, th, { role, tag: sp, maxDrop: sp === 'cathedral' ? 0.2 : 0.12 })) placed = true;
    }
  }

  // ---- Houses along streets ----
  const inner = (x, y) => Math.hypot(x, y);
  const houseFn = (x, y) => houseModel(rnd, inner(x, y) < (wallR ? wallR * 0.6 : padR * 0.55) && s.kind !== 'hamlet');
  const cottageFn = () => 'cottage' + Math.floor(rnd() * 5);
  for (const st of site.streets) {
    if (st.hw > 0.3) continue;
    const rural = s.kind === 'hamlet' || s.kind === 'village';
    site.lineStreet(st.pts, st.hw, rural ? (x, y) => (rnd() < 0.5 ? cottageFn() : houseFn(x, y)) : houseFn, {
      step: rural ? 0.42 : 0.29, gap: rural ? 0.35 : 0.1,
      skip: (x, y) => Math.hypot(x, y) > (wallR ? wallR - 0.2 : padR * 1.05) || (s.kind === 'capital' && Math.hypot(x, y) < 1.3),
    });
  }
  // infill inside walls for dense towns
  if (s.kind === 'capital' || s.kind === 'city' || s.kind === 'town' || s.kind === 'port') {
    const n = { capital: 900, city: 400, town: 160, port: 160 }[s.kind];
    const lim = wallR ? wallR - 0.25 : padR * 0.95;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * lim;
      const x = Math.sin(a) * r, y = Math.cos(a) * r;
      if (s.kind === 'capital' && Math.hypot(x, y) < 1.3) continue;
      const th = nearestStreetFacing(site, x, y);
      site.place(houseFn(x, y), x, y, th, { role: 'home' });
    }
  }
  // Lampposts along paved streets
  if (['capital', 'city', 'town', 'port'].includes(s.kind)) {
    for (const st of site.streets) {
      if (!st.paved || st.hw > 0.3) continue;
      for (let i = 2; i < st.pts.length; i += 3) {
        const [ax, ay] = st.pts[i - 1], [bx, by] = st.pts[i];
        const L = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / L, ny = (bx - ax) / L;
        const side = i % 2 ? 1 : -1;
        site.place('lamppost', bx + nx * side * (st.hw + 0.02), by + ny * side * (st.hw + 0.02), 0, { allowStreet: true, role: 'none', pad: 0.002, tag: 'lamp' });
      }
    }
  }

  // Guard towers at the exits of unwalled towns
  if (!wallR && ['town', 'village', 'port'].includes(s.kind)) {
    for (const a of exits.slice(0, 2)) {
      const r = padR * 0.95;
      site.place('guardtower', Math.sin(a + 0.25) * r, Math.cos(a + 0.25) * r, a, { role: 'guard', tag: 'guardtower' });
    }
  }

  // ---- Countryside: farmsteads, windmills, watermill, docks ----
  const farmR = s.pad.farmR;
  if (farmR > 0) {
    const nFarms = { capital: 12, city: 9, town: 6, port: 4, village: 5, hamlet: 3, castle: 3, fort: 2, monastery: 1, lighthouse: 1 }[s.kind] || 2;
    for (let i = 0, made = 0; i < 60 && made < nFarms; i++) {
      const a = rnd() * Math.PI * 2, r = padR + 0.4 + rnd() * (farmR - padR - 0.4);
      const x = Math.sin(a) * r, y = Math.cos(a) * r;
      const th = nearestStreetFacing(site, x, y, true);
      if (site.place('farmhouse', x, y, th, { role: 'farm' })) {
        made++;
        const c = Math.cos(th), sn = Math.sin(th);
        site.place('barn', x + (-c) * 0.28 - sn * 0.05, y + sn * 0.28 - c * 0.05, th + Math.PI / 2, { role: 'barn' });
        for (let hsk = 0; hsk < 2; hsk++) site.place('haystack', x + (rnd() - 0.5) * 0.5, y + (rnd() - 0.5) * 0.5, rnd() * 6, { role: 'none' });
        site.place('fence', x + sn * 0.22, y + c * 0.22, th + Math.PI / 2, { role: 'none' });
        site.work.push({ x: x + sn * 0.35, y: y + c * 0.35, kind: 'field' });
      }
    }
    const nMills = { capital: 4, city: 3, town: 2, village: 2, hamlet: 1 }[s.kind] || 0;
    for (let i = 0, made = 0; i < 80 && made < nMills; i++) {
      const a = rnd() * Math.PI * 2, r = padR + 0.3 + rnd() * (farmR * 0.8 - padR);
      const x = Math.sin(a) * r, y = Math.cos(a) * r;
      if (site.h(x, y) < 0.3) continue;
      if (site.place('windmill', x, y, rnd() * 6, { role: 'mill', tag: 'windmill' })) made++;
    }
    // field work points
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = padR + 0.3 + rnd() * (farmR * 0.7 - padR);
      const x = Math.sin(a) * r, y = Math.cos(a) * r;
      if (!site.wet(x, y)) site.work.push({ x, y, kind: 'field' });
    }
  }
  if (s.mill || ['town', 'city', 'capital', 'village'].includes(s.kind)) {
    // watermill on the nearest river bank
    const rv = nearRiverBank(site, padR * 1.6);
    if (rv) site.place('watermill', rv.x, rv.y, rv.th, { role: 'mill', force: false, allowWet: false, tag: 'watermill' });
  }
  if (s.coastal || s.kind === 'port') {
    const sea = seaDirection(site, padR * 1.4);
    if (sea !== null) {
      for (let k = 0; k < (s.kind === 'port' ? 3 : 1); k++) {
        const a = sea + (k - 1) * 0.35;
        // walk outward until we reach water
        for (let r = 0.4; r < padR * 1.8; r += 0.05) {
          const x = Math.sin(a) * r, y = Math.cos(a) * r;
          if (site.h(x, y) < 0.02) {
            const bx = x + Math.sin(a) * 0.22, by = y + Math.cos(a) * 0.22;
            const it = site.place('dock', bx, by, a, { force: true, allowWet: true, h: 0.0, role: 'none', tag: 'dock' });
            if (it) site.docks.push({ x: bx + Math.sin(a) * 0.35, y: by + Math.cos(a) * 0.35, th: a });
            site.work.push({ x: x + Math.sin(a) * 0.3, y: y + Math.cos(a) * 0.3, kind: 'dock' });
            break;
          }
        }
      }
    }
  }
}

function ringWall(site, r, gateAngs, towerModel, towerEvery, inner, radials = null) {
  const gates = Array.isArray(gateAngs) ? gateAngs : [gateAngs];
  const n = Math.max(8, Math.round((Math.PI * 2 * r) / 0.46));
  const tn = towerEvery || Math.max(4, Math.round(n / 12));
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const nearGate = gates.some(g => Math.abs(angDiff(a, g)) < 0.34 / r);
    const x = Math.sin(a) * r, y = Math.cos(a) * r;
    if (nearGate) continue;
    site.place('wall', x, y, a, { force: true, allowStreet: true, scale: 1, w: 0.5, d: 0.07, noCollide: false, role: 'none', tag: 'wall', sink: 0.02 });
    if (i % tn === 0) {
      const ta = (i / n) * Math.PI * 2;
      site.place(towerModel, Math.sin(ta) * r, Math.cos(ta) * r, ta, { force: true, allowStreet: true, role: 'guard', tag: 'tower' });
    }
  }
  for (const g of gates) site.place('gatehouse', Math.sin(g) * r, Math.cos(g) * r, g, { force: true, allowStreet: true, role: 'gate', tag: 'gate' });
  site.walls = { r, gates };
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

function nearestStreetFacing(site, x, y, farOK = false) {
  let best = null, bd = 1e9;
  for (const st of site.streets) {
    const p = st.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      const ex = bx - ax, ey = by - ay, L = ex * ex + ey * ey;
      let t = L > 0 ? ((x - ax) * ex + (y - ay) * ey) / L : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + ex * t, qy = ay + ey * t;
      const d = Math.hypot(x - qx, y - qy);
      if (d < bd) { bd = d; best = [qx, qy]; }
    }
  }
  if (!best || (!farOK && bd > 2)) return site.rnd() * Math.PI * 2;
  return Math.atan2(best[0] - x, best[1] - y);
}

function seaDirection(site, r) {
  let best = null, bh = 1e9;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const h = site.h(Math.sin(a) * r, Math.cos(a) * r) + site.h(Math.sin(a) * r * 0.6, Math.cos(a) * r * 0.6);
    if (h < bh) { bh = h; best = a; }
  }
  return bh < 0.1 ? best : (bh < 0.4 ? best : null);
}

function nearRiverBank(site, r) {
  const f = site.field, info = site.info;
  let best = null, bd = 1e9;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    for (let rr = 0.3; rr < r; rr += 0.15) {
      const x = Math.sin(a) * rr, y = Math.cos(a) * rr;
      const p = site.dir(x, y);
      f.heightInfo(p[0], p[1], p[2], 0, info);
      const edge = info[3] - info[4];
      if (edge > 0.12 && edge < 0.22 && info[5] === 0 && Math.abs(rr - r * 0.5) < bd) {
        bd = Math.abs(rr - r * 0.5);
        // face away from the river: the offset vector points from the river to here
        const ox = info[17], oy = info[18], oz = info[19];
        const lx = ox * site.e[0] + oy * site.e[1] + oz * site.e[2];
        const ly = ox * site.n[0] + oy * site.n[1] + oz * site.n[2];
        best = { x, y, th: Math.atan2(lx, ly) + Math.PI / 2 };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
function layoutElf(site, world) {
  const s = site.s, rnd = site.rnd;
  if (s.kind === 'glade') {
    site.place('moonwell', 0, 0, 0, { force: true, tag: 'moonwell', role: 'temple' });
    site.work.push({ x: 0.45, y: 0, kind: 'pray' }, { x: -0.4, y: 0.2, kind: 'pray' }, { x: 0.1, y: -0.45, kind: 'pray' });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; site.place('elf_arch', Math.sin(a) * 0.9, Math.cos(a) * 0.9, a, { role: 'none' }); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 1; site.place('elf_pavilion', Math.sin(a) * 1.3, Math.cos(a) * 1.3, a, { role: 'home' }); }
    site.place('elf_spire', 1.5, -0.5, 0, { role: 'home' });
    return;
  }
  site.place('elf_greatspire', 0, 0, 0, { force: true, tag: 'greatspire', role: 'temple' });
  const exits = roadExits(world, s, s.radius * 1.1);
  for (const a of fillAngles(exits, 5, rnd)) site.street(radialPts(a, 0.4, s.radius * 1.05, rnd() * 5, 0.2), 0.045, true);
  site.street(ringPts(1.1, 2), 0.04, true);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * (s.radius * 0.95 - 0.6);
    const x = Math.sin(a) * r, y = Math.cos(a) * r;
    const pick = rnd();
    const model = pick < 0.35 ? 'elf_spire' : pick < 0.6 ? 'elf_tree' : pick < 0.85 ? 'elf_pavilion' : 'elf_arch';
    site.place(model, x, y, nearStreetOrOut(site, x, y), { role: model === 'elf_arch' ? 'none' : 'home', maxDrop: 0.2 });
  }
  site.work.push({ x: 0.35, y: 0.1, kind: 'pray' }, { x: -0.3, y: -0.2, kind: 'gather' }, { x: 0.05, y: 0.4, kind: 'gather' });
}

function nearStreetOrOut(site, x, y) { return Math.atan2(-x, -y) + (site.rnd() - 0.5) * 0.8; }

function layoutDwarf(site, world) {
  const s = site.s, rnd = site.rnd;
  // Face away from the mountain: the gate is cut into the uphill side.
  let up = 0, best = -1e9;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const h = site.h(Math.sin(a) * s.radius * 1.6, Math.cos(a) * s.radius * 1.6);
    if (h > best) { best = h; up = a; }
  }
  const gx = Math.sin(up) * s.radius * 0.75, gy = Math.cos(up) * s.radius * 0.75;
  if (s.kind === 'hold') {
    site.place('dwarf_gate', gx, gy, up + Math.PI, { force: true, tag: 'dwarfgate', role: 'temple', sink: 0.15 });
    for (const sd of [-1, 1]) {
      const a = up + Math.PI + sd * 0.5;
      site.place('dwarf_statue', gx + Math.sin(a) * 0.9, gy + Math.cos(a) * 0.9, up + Math.PI, { role: 'none', maxDrop: 0.2 });
    }
  } else if (s.kind === 'mine') {
    site.place('mine_entrance', gx, gy, up + Math.PI, { force: true, tag: 'mine', role: 'mine', sink: 0.1 });
    for (let i = 0; i < 4; i++) site.place('minecart', gx + Math.sin(up + Math.PI) * (0.4 + i * 0.12), gy + Math.cos(up + Math.PI) * (0.4 + i * 0.12), up, { role: 'none', pad: 0.0 });
    for (let i = 0; i < 4; i++) site.place('ore_pile', (rnd() - 0.5) * 1.4, (rnd() - 0.5) * 1.4, rnd() * 6, { role: 'none' });
  } else {
    // fort: small stone keep and walls
    site.place('keep', 0, 0, up + Math.PI, { force: true, scale: 0.7, tag: 'keep', role: 'castle' });
    ringWall(site, 1.0, up + Math.PI, 'tower_flat', 4, true);
  }
  const down = up + Math.PI;
  site.street(radialPts(down, 0.0, s.radius * 1.4, 1, 0.2), 0.07, true);
  site.street([[gx, gy], [Math.sin(down) * 0.3, Math.cos(down) * 0.3]], 0.12, true);
  for (let i = 0; i < 40; i++) {
    const a = down + (rnd() - 0.5) * 2.8, r = 0.4 + rnd() * s.radius * 0.9;
    const x = Math.sin(a) * r, y = Math.cos(a) * r;
    const model = rnd() < 0.22 ? 'dwarf_forge' : 'dwarf_house';
    site.place(model, x, y, Math.atan2(-x + gx * 0.3, -y + gy * 0.3), { role: model === 'dwarf_forge' ? 'smithy' : 'home', maxDrop: 0.14 });
  }
}

function layoutFae(site, world) {
  const s = site.s, rnd = site.rnd;
  if (s.kind === 'circle') {
    site.place('stones', 0, 0, rnd() * 6, { force: true, tag: 'stones', role: 'temple' });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; site.place('fae_lantern', Math.sin(a) * 0.85, Math.cos(a) * 0.85, a, { role: 'none', pad: 0 }); }
    site.work.push({ x: 0.3, y: 0.1, kind: 'dance' }, { x: -0.25, y: 0.15, kind: 'dance' }, { x: 0.05, y: -0.3, kind: 'dance' });
    return;
  }
  site.place('flower_pavilion', 0, 0, 0, { force: true, tag: 'pavilion', role: 'temple' });
  const models = ['mushroom_red', 'mushroom_violet', 'mushroom_blue'];
  for (let ring = 0; ring < 2; ring++) {
    const n = 7 + ring * 5, r = 0.55 + ring * 0.45;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3 + rnd() * 0.2;
      site.place(models[(i + ring) % 3], Math.sin(a) * r, Math.cos(a) * r, a + Math.PI, { role: 'home', maxDrop: 0.15 });
    }
  }
  for (let i = 0; i < 16; i++) { const a = rnd() * Math.PI * 2, r = 0.3 + rnd() * 1.4; site.place('fae_lantern', Math.sin(a) * r, Math.cos(a) * r, rnd() * 6, { role: 'none', pad: 0.0 }); }
  site.work.push({ x: 0.2, y: 0.1, kind: 'dance' }, { x: -0.2, y: 0.1, kind: 'dance' }, { x: 0.0, y: -0.25, kind: 'gather' });
}

function layoutBeast(site, world) {
  const s = site.s, rnd = site.rnd;
  if (s.kind === 'circle') {
    site.place('totem', 0, 0, 0, { force: true, tag: 'totem', role: 'temple' });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; site.place('totem', Math.sin(a) * 0.6, Math.cos(a) * 0.6, a + Math.PI, { role: 'none', scale: 0.7 }); }
    site.place('bonfire', 0.3, 0.25, 0, { role: 'none', tag: 'bonfire' });
    site.work.push({ x: 0.3, y: 0.1, kind: 'pray' }, { x: -0.2, y: -0.2, kind: 'pray' });
    return;
  }
  if (s.kind === 'stilts') {
    const sea = seaDirection(site, 1.2) ?? 0;
    for (let i = 0; i < 14; i++) {
      const a = sea + (rnd() - 0.5) * 2.2, r = 0.3 + rnd() * 1.1;
      site.place('stilt_hut', Math.sin(a) * r, Math.cos(a) * r, a, { role: 'home', allowWet: true, maxDrop: 0.3 });
    }
    site.place('totem', -Math.sin(sea) * 0.4, -Math.cos(sea) * 0.4, sea, { role: 'none' });
    site.place('bonfire', 0, 0, 0, { role: 'none', tag: 'bonfire', allowWet: false });
    return;
  }
  site.place('longhouse', 0.3, 0.2, rnd() * 6, { force: true, tag: 'longhouse', role: 'temple' });
  site.place('bonfire', -0.2, -0.1, 0, { force: true, tag: 'bonfire', role: 'none' });
  site.work.push({ x: -0.05, y: -0.1, kind: 'fire' }, { x: -0.35, y: 0.0, kind: 'fire' });
  for (let ring = 0; ring < 3; ring++) {
    const n = 6 + ring * 4, r = 0.6 + ring * 0.38;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      if (rnd() < 0.15) continue;
      const model = rnd() < 0.1 ? 'drying_rack' : 'tent';
      site.place(model, Math.sin(a) * r, Math.cos(a) * r, a + Math.PI, { role: model === 'tent' ? 'home' : 'none', maxDrop: 0.15 });
    }
  }
  for (let i = 0; i < 4; i++) { const a = rnd() * Math.PI * 2; site.place('totem', Math.sin(a) * 1.0, Math.cos(a) * 1.0, a, { role: 'none' }); }
  // palisade ring
  const pr = s.radius * 1.0, n = Math.round((Math.PI * 2 * pr) / 0.5);
  const exits = roadExits(world, s, s.radius * 1.2);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    if (exits.some(g => Math.abs(angDiff(a, g)) < 0.25)) continue;
    site.place('palisade', Math.sin(a) * pr, Math.cos(a) * pr, a, { force: true, role: 'none', allowStreet: true });
  }
  for (const a of exits) site.street(radialPts(a, 0.3, s.radius * 1.2, 1), 0.05, false);
}

function layoutDraconic(site, world) {
  const s = site.s, rnd = site.rnd;
  const exits = roadExits(world, s, s.radius * 1.1);
  const main = exits.length ? exits[0] : 0;
  if (s.kind === 'temple') {
    site.place('ziggurat', 0, 0, main, { force: true, tag: 'ziggurat', role: 'temple' });
    // processional avenue with dragon statues and braziers
    for (let i = 0; i < 5; i++) {
      const r = 0.9 + i * 0.35;
      for (const sd of [-1, 1]) {
        const a = main + sd * 0.16 / (r * 0.4);
        site.place(i % 2 ? 'brazier' : 'dragon_statue', Math.sin(a) * r, Math.cos(a) * r, main + Math.PI + sd * 0.3, { role: 'none', allowStreet: true, tag: i % 2 ? 'brazier' : null });
      }
    }
  } else if (s.kind === 'fort') {
    site.place('keep', 0, 0, main, { force: true, scale: 0.8, tag: 'keep', role: 'castle' });
    ringWall(site, 1.0, main, 'tower_flat', 4, true);
  } else {
    site.place('lava_forge', 0, 0, main, { force: true, tag: 'lavaforge', role: 'smithy' });
  }
  for (const a of fillAngles(exits, 4, rnd)) site.street(radialPts(a, s.kind === 'temple' ? 0.7 : 0.35, s.radius * 1.05, 2), 0.06, true);
  for (const st of site.streets) {
    site.lineStreet(st.pts, st.hw, () => (rnd() < 0.3 ? 'pagoda' : 'draco_house'), { step: 0.34, gap: 0.2, role: 'home' });
  }
  for (let i = 0; i < 4; i++) { const a = rnd() * 6.28, r = 0.6 + rnd() * s.radius * 0.7; site.place('brazier', Math.sin(a) * r, Math.cos(a) * r, 0, { role: 'none', tag: 'brazier' }); }
  if (s.kind === 'village') for (let i = 0; i < 2; i++) { const a = rnd() * 6.28; site.place('lava_forge', Math.sin(a) * 0.8, Math.cos(a) * 0.8, a, { role: 'smithy' }); }
}

function layoutUndead(site, world) {
  const s = site.s, rnd = site.rnd;
  if (s.kind === 'barrow') {
    site.place('mausoleum', 0, 0, rnd() * 6, { force: true, tag: 'mausoleum', role: 'temple', scale: 1.4 });
    for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = 0.4 + rnd() * 0.7; site.place(i % 3 ? 'grave' : 'ghost_lantern', Math.sin(a) * r, Math.cos(a) * r, rnd() * 6, { role: 'none' }); }
    site.place('stones', 0, 0, 0, { force: true, noCollide: true, role: 'none', scale: 1.5 });
    return;
  }
  site.place('gothic_ruin', 0, 0, rnd() * 6, { force: true, tag: 'cathedral', role: 'temple' });
  const exits = roadExits(world, s, s.radius * 1.1);
  for (const a of fillAngles(exits, 4, rnd)) site.street(radialPts(a, 0.6, s.radius * 1.05, 3), 0.05, true);
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * s.radius * 0.95;
    const x = Math.sin(a) * r, y = Math.cos(a) * r;
    const p = rnd();
    const model = p < 0.3 ? 'grave' : p < 0.45 ? 'crypt' : p < 0.55 ? 'mausoleum' : p < 0.7 ? 'ghost_lantern' : p < 0.8 ? 'iron_fence' : 'ruin_house';
    site.place(model, x, y, nearestStreetFacing(site, x, y), { role: model === 'ruin_house' || model === 'crypt' ? 'home' : 'none', allowWet: false });
  }
  site.work.push({ x: 0.4, y: 0.3, kind: 'pray' }, { x: -0.3, y: 0.4, kind: 'gather' });
}

function layoutRuin(site, world) {
  const s = site.s, rnd = site.rnd;
  site.place(rnd() < 0.5 ? 'ruin_keep' : 'ruin_tower', 0, 0, rnd() * 6, { force: true, tag: 'ruinkeep', role: 'none', scale: 1.4 });
  const r = s.radius * 0.95, n = Math.round((Math.PI * 2 * r) / 0.5);
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.35) continue;
    const a = ((i + 0.5) / n) * Math.PI * 2;
    site.place(rnd() < 0.2 ? 'ruin_tower' : 'ruin_wall', Math.sin(a) * r, Math.cos(a) * r, a, { force: true, role: 'none' });
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, rr = 0.6 + rnd() * r * 0.85;
    const p = rnd();
    const model = p < 0.4 ? 'ruin_house' : p < 0.6 ? 'column' : p < 0.75 ? 'column_broken' : p < 0.85 ? 'statue_fallen' : 'ruin_arch';
    site.place(model, Math.sin(a) * rr, Math.cos(a) * rr, rnd() * 6, { role: 'none', maxDrop: 0.18 });
  }
}

// ---------------------------------------------------------------------------------------------
export function layoutSettlements(world) {
  const sites = [];
  for (const s of world.settlements) {
    const rnd = mulberry32(hashString(s.id));
    const site = new Site(world, s, rnd);
    site.docks = [];
    const cult = s.culture;
    if (cult === 'human') layoutHuman(site, world);
    else if (cult === 'elf') layoutElf(site, world);
    else if (cult === 'dwarf') layoutDwarf(site, world);
    else if (cult === 'fae') layoutFae(site, world);
    else if (cult === 'beast') layoutBeast(site, world);
    else if (cult === 'draconic') layoutDraconic(site, world);
    else if (cult === 'undead') layoutUndead(site, world);
    else layoutRuin(site, world);
    if (!site.plaza) site.plaza = [0, 0];
    sites.push(site);
  }
  return sites;
}

// Street segments in world space for the terrain feature index.
export function streetSegments(sites, field) {
  const segs = [];
  for (const site of sites) {
    for (const st of site.streets) {
      const pts = st.pts.map(([x, y]) => site.dir(x, y));
      const lv = pts.map(p => field.height(p[0], p[1], p[2]));
      for (let i = 0; i < pts.length - 1; i++) {
        segs.push({ a: pts[i], b: pts[i + 1], wa: st.hw, wb: st.hw, la: lv[i], lb: lv[i + 1], kind: st.paved ? 4 : 1, fid: 0, reach: st.hw + 0.5 });
      }
    }
  }
  return segs;
}
