// Navigable-water routes for ships (finding F05). Authored lanes become waypoint hints: each leg
// is searched over a water-only cube-sphere grid, simplified by line of sight, smoothed, then
// resampled and validated. Any span that leaves deep enough water falls back to its unsmoothed
// line. Ghost ships keep their authored path as an explicit supernatural rule.
import {
  latLonToDir, dirToLatLon, dirToCell, cellCenterDir, faceUVToDir, arcDist, slerp, smoothPath, resamplePath, pathLength,
} from '../core/sphere.js';

export const DRAFT = { cog: 0.1, warship: 0.12, pirate: 0.1, fishboat: 0.05, canoe: 0.03, ghostship: 0 };
const KIND_VESSEL = { merchant: 'cog', warship: 'warship', pirate: 'pirate', fisher: 'fishboat', canoe: 'canoe', ghost: 'ghostship' };
const G = 256, CLEAR = 0.12, SAMPLE = 0.2, SPACING = 0.5;

class WaterGrid {
  constructor(field) {
    this.field = field;
    this.h = new Float32Array(6 * G * G).fill(NaN);
    this.tmp = { f: 0, u: 0, v: 0 };
    this.sea = new Set(); this.pockets = new Set();
  }
  height(c) {
    let v = this.h[c];
    if (Number.isNaN(v)) { const d = cellCenterDir(c, G); v = this.h[c] = this.field.height(d[0], d[1], d[2]); }
    return v;
  }
  wet(c, clear = CLEAR) { return this.height(c) < -clear; }
  neighbors(c) {
    const f = Math.floor(c / (G * G)), r = c - f * G * G, j = Math.floor(r / G), i = r - j * G, out = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && ni < G && nj >= 0 && nj < G) out.push(f * G * G + nj * G + ni);
      else out.push(dirToCell(faceUVToDir(f, ((ni + 0.5) / G) * 2 - 1, ((nj + 0.5) / G) * 2 - 1), G, this.tmp));
    }
    return out;
  }
  // Does this wet cell reach open sea? Inland pools and river mouths do not count as harbors.
  open(c, clear) {
    if (this.pockets.has(c)) return false;
    if (this.sea.has(c)) return true;
    const seen = new Set([c]), queue = [c];
    for (let head = 0; head < queue.length && head < 5000; head++) {
      const q = queue[head];
      if (this.height(q) < -1 || this.sea.has(q)) { for (const x of seen) this.sea.add(x); return true; }
      for (const nb of this.neighbors(q)) if (!seen.has(nb) && this.wet(nb, clear)) { seen.add(nb); queue.push(nb); }
    }
    for (const x of seen) this.pockets.add(x);
    return false;
  }
  // Nearest navigable cell connected to open sea, searching outward over the grid.
  snap(d, clear = CLEAR, maxSteps = 12000) {
    const start = dirToCell(d, G, this.tmp);
    if (this.wet(start, clear) && this.open(start, clear)) return start;
    const seen = new Set([start]), queue = [start];
    for (let head = 0; head < queue.length && head < maxSteps; head++) {
      for (const nb of this.neighbors(queue[head])) {
        if (seen.has(nb)) continue;
        if (this.wet(nb, clear) && this.open(nb, clear)) return nb;
        seen.add(nb); queue.push(nb);
      }
    }
    return -1;
  }
  route(a, b, clear = CLEAR, draft = 0.1) {
    if (a === b) return [a];
    const goal = cellCenterDir(b, G), g = new Map([[a, 0]]), came = new Map(), closed = new Set();
    const open = [[0, a]];
    const push = (p, c) => { open.push([p, c]); let i = open.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (open[j][0] < p || open[j][0] === p && open[j][1] <= c) break; [open[i], open[j]] = [open[j], open[i]]; i = j; } };
    const popMin = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; const less = (x, y) => open[x][0] < open[y][0] || open[x][0] === open[y][0] && open[x][1] < open[y][1]; if (l < open.length && less(l, m)) m = l; if (r < open.length && less(r, m)) m = r; if (m === i) break; [open[i], open[m]] = [open[m], open[i]]; i = m; } } return top[1]; };
    let iter = 0;
    while (open.length) {
      const c = popMin();
      if (c === b) break;
      if (closed.has(c)) continue;
      closed.add(c);
      if (++iter > 600000) return null;
      const dc = cellCenterDir(c, G);
      for (const nb of this.neighbors(c)) {
        if (closed.has(nb) || !this.wet(nb, clear) && nb !== b) continue;
        const dn = cellCenterDir(nb, G);
        // Prefer open water: shallows cost more, which keeps ships off the coast where possible.
        const depth = -this.height(nb), cost = arcDist(dc, dn) * (1 + Math.max(0, 0.6 - depth) * 3);
        // Near the coast, the join between two wet cells must itself be deep enough.
        if (Math.min(depth, -this.height(c)) < draft + 0.3 && !segmentInWater(this.field, dc, dn, draft)) continue;
        const ng = g.get(c) + cost;
        if (ng < (g.get(nb) ?? Infinity)) { g.set(nb, ng); came.set(nb, c); push(ng + arcDist(dn, goal), nb); }
      }
    }
    if (!came.has(b)) return null;
    const path = [b];
    for (let c = b; c !== a;) { c = came.get(c); path.push(c); }
    return path.reverse();
  }
}

// Is every sample of the great-circle segment deep enough for this draft?
export function segmentInWater(field, a, b, draft) {
  const n = Math.max(1, Math.ceil(arcDist(a, b) / SAMPLE));
  for (let k = 0; k <= n; k++) {
    const p = slerp(a, b, k / n);
    if (field.height(p[0], p[1], p[2]) >= -draft) return false;
  }
  return true;
}

function simplify(field, pts, draft) {
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentInWater(field, pts[i], pts[j], draft + 0.03)) j--;
    // Adjacent cells are kept even if their join is shallow; validation reports it.
    out.push(pts[j]); i = j;
  }
  return out;
}

// Smooth a validated polyline span by span; keep any span whose smoothing touches the shallows.
function constrainedSmooth(field, pts, draft) {
  if (pts.length < 3) return { dirs: resamplePath(pts, SPACING), repaired: 0 };
  const smooth = smoothPath(pts, 6);
  const out = [];
  let repaired = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const span = smooth.slice(i * 6, i * 6 + 7);
    const ok = span.every((p, k) => k === 0 || segmentInWater(field, span[k - 1], p, draft));
    const use = ok ? span : (repaired++, [pts[i], pts[i + 1]]);
    for (const p of use) if (!out.length || arcDist(out[out.length - 1], p) > 1e-6) out.push(p);
  }
  return { dirs: resamplePath(out, SPACING), repaired };
}

export function validateRoute(field, dirs, draft) {
  let worst = -Infinity, bad = 0;
  for (let i = 0; i < dirs.length; i++) {
    const h = field.height(dirs[i][0], dirs[i][1], dirs[i][2]);
    worst = Math.max(worst, h);
    if (h >= -draft) bad++;
    if (i && !segmentInWater(field, dirs[i - 1], dirs[i], draft)) bad++;
  }
  return { ok: bad === 0, bad, shallowest: worst };
}

function harborFor(field, grid, site, draft) {
  // Ships berth at a dock if one stands in water; otherwise they anchor at the nearest deep water.
  const dock = site.work.find(w => w.kind === 'dock');
  const center = dock ? site.dir(dock.x, dock.y) : site.d;
  const cell = grid.snap(center, CLEAR, 2500);
  if (cell < 0) return null;
  const anchor = cellCenterDir(cell, G);
  const berth = dock && segmentInWater(field, anchor, center, Math.min(draft, 0.05)) ? center : null;
  return { site: site.s.id, anchor, berth, cell };
}

export function buildSeaNetwork(world, sites, lanes) {
  const field = world.field, grid = new WaterGrid(field);
  const deg = 100 * Math.PI / 180;
  // A lane end belongs to the nearest coastal settlement; a far or inland town gets no harbor.
  const nearestPort = d => {
    const near = (filter, limit) => {
      let best = null, bd = limit * deg;
      for (const s of sites) { if (!filter(s)) continue; const dd = arcDist(d, s.d); if (dd < bd) { bd = dd; best = s; } }
      return best;
    };
    return near(s => s.s.coastal || s.work.some(w => w.kind === 'dock'), 6) || near(() => true, 3.2);
  };
  const harbors = new Map();
  const harbor = (site, draft) => {
    if (!harbors.has(site.s.id)) harbors.set(site.s.id, harborFor(field, grid, site, draft));
    return harbors.get(site.s.id);
  };
  const routes = [], seaRoutes = [];
  for (const lane of lanes) {
    const vessel = KIND_VESSEL[lane.kind] || 'cog', draft = DRAFT[vessel];
    const pts = lane.pts.map(p => latLonToDir(p[0], p[1]));
    if (lane.loop) pts.push(pts[0].slice());
    if (lane.kind === 'ghost') {
      const dirs = resamplePath(smoothPath(pts, 12), SPACING);
      routes.push({ ...lane, vessel, draft, dirs, length: pathLength(dirs), supernatural: true, valid: true, repaired: 0, harbors: [] });
      continue;
    }
    const endA = lane.loop ? null : nearestPort(pts[0]), endB = lane.loop ? null : nearestPort(pts[pts.length - 1]);
    const ha = endA ? harbor(endA, draft) : null, hb = endB && endB !== endA ? harbor(endB, draft) : null;
    // Route over cells comfortably deeper than the draft; narrow passages retry at the bare minimum.
    const clear = draft + 0.06, tight = Math.max(draft + 0.02, 0.05);
    const cells = pts.map((d, i) => i === 0 && ha ? ha.cell : i === pts.length - 1 && hb ? hb.cell : grid.snap(d, clear));
    // Each leg between waypoints is searched and simplified on its own, so the authored shape survives.
    // A waypoint that cannot be reached by water is skipped; an unreachable final end becomes an anchorage.
    const line = [];
    let i = cells.findIndex(c => c >= 0), endsShort = false;
    while (i >= 0 && i < cells.length - 1) {
      let j = i + 1, leg = null;
      for (; j < cells.length && !leg; j++) if (cells[j] >= 0) leg = grid.route(cells[i], cells[j], clear, draft) || grid.route(cells[i], cells[j], tight, draft);
      if (!leg) { endsShort = true; break; }
      j--;
      const legPts = leg.map(c => cellCenterDir(c, G));
      if (!line.length && i === 0 && ha?.berth) legPts.unshift(ha.berth);
      if (j === cells.length - 1 && hb?.berth) legPts.push(hb.berth);
      const simple = legPts.length > 1 ? simplify(field, legPts, draft) : legPts;
      line.push(...(line.length ? simple.slice(1) : simple));
      i = j;
    }
    if (line.length < 2) { routes.push({ ...lane, vessel, draft, dirs: [], length: 0, valid: false, harbors: [], reason: 'No navigable passage between the authored waypoints.' }); continue; }
    let { dirs, repaired } = constrainedSmooth(field, line, draft);
    let check = validateRoute(field, dirs, draft);
    // The simplified line is checked by line of sight with extra margin; use it if smoothing failed.
    if (!check.ok) { dirs = resamplePath(line, SPACING); repaired = line.length - 1; check = validateRoute(field, dirs, draft); }
    const from = ha ? endA.s.id : null, to = hb && !endsShort ? endB.s.id : null;
    const route = { ...lane, vessel, draft, dirs, length: pathLength(dirs), valid: check.ok, shallowest: check.shallowest, repaired, from, to,
      anchorage: !lane.loop && (!from || !to), harbors: [ha, hb].filter(Boolean).map(h => ({ site: h.site, berth: !!h.berth, anchor: dirToLatLon(h.anchor) })),
      note: !lane.loop && endB && !to ? `${endB.s.name} has no navigable approach; ships anchor at the nearest reachable water.` : null };
    routes.push(route);
    if (from && to && from !== to && check.ok) seaRoutes.push({ id: lane.id, a: from, b: to, dirs, length: route.length, vessel });
  }
  return { routes, seaRoutes, harbors: [...harbors.values()].filter(Boolean) };
}
