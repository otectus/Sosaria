// Walkable settlement graph shared by the simulation (travel times, reachability) and the view
// (paths drawn between ticks). Pure JS: streets become weighted edges, points of interest are
// joined to streets only by validated connectors that do not pass through buildings or walls.

const STEP = 0.25, JOIN = 0.2, CONNECT_TRIES = 10, CONNECT_MAX = 12;

// Oriented box test: does segment a-b cross box o (shrunk slightly so touching is allowed)?
export function segmentHitsBox(ax, ay, bx, by, o, shrink = 0.01) {
  const hw = o.hw - shrink, hd = o.hd - shrink;
  if (hw <= 0 || hd <= 0) return false;
  const lx = (x, y) => (x - o.x) * o.rx + (y - o.y) * o.ry, ly = (x, y) => (x - o.x) * o.fx + (y - o.y) * o.fy;
  const x0 = lx(ax, ay), y0 = ly(ax, ay), x1 = lx(bx, by), y1 = ly(bx, by);
  let t0 = 0, t1 = 1;
  for (const [p, d, lim] of [[x0, x1 - x0, hw], [y0, y1 - y0, hd]]) {
    if (Math.abs(d) < 1e-12) { if (p < -lim || p > lim) return false; continue; }
    let ta = (-lim - p) / d, tb = (lim - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function intersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
}
function project(p, a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1], L = ex * ex + ey * ey;
  const t = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L)) : 0;
  const x = a[0] + ex * t, y = a[1] + ey * t;
  return { x, y, d: Math.hypot(p[0] - x, p[1] - y) };
}

class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p; k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] < p[i] || p[j] === p[i] && k[j] <= k[i]) break; [k[i], k[j]] = [k[j], k[i]]; [p[i], p[j]] = [p[j], p[i]]; i = j; }
  }
  pop() {
    const k = this.k, p = this.p, top = k[0], lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        const less = (a, b) => p[a] < p[b] || p[a] === p[b] && k[a] < k[b];
        if (l < k.length && less(l, m)) m = l;
        if (r < k.length && less(r, m)) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]]; [p[i], p[m]] = [p[m], p[i]]; i = m;
      }
    }
    return top;
  }
}

export class NavGraph {
  // nodes: [[x, y], ...]; edges: [[a, b], ...] (undirected). Weights are lengths.
  constructor(nodes = [], edges = []) {
    this.nodes = nodes.map(n => [n[0], n[1]]);
    this.adj = this.nodes.map(() => []);
    for (const [a, b] of edges) this.link(a, b);
  }
  add(x, y) { this.nodes.push([x, y]); this.adj.push([]); return this.nodes.length - 1; }
  link(a, b) {
    if (a === b || this.adj[a].some(e => e[0] === b)) return;
    const w = Math.hypot(this.nodes[a][0] - this.nodes[b][0], this.nodes[a][1] - this.nodes[b][1]);
    this.adj[a].push([b, w]); this.adj[b].push([a, w]);
  }
  nearest(x, y, filter = null) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (filter && !filter(i)) continue;
      const d = (this.nodes[i][0] - x) ** 2 + (this.nodes[i][1] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // Weighted A*; `blocked(node)` excludes closed nodes. Returns node indices, or null if unreachable.
  route(start, goal, blocked = null) {
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [start];
    if (blocked && (blocked(start) || blocked(goal))) return null;
    const N = this.nodes, g = new Float64Array(N.length).fill(Infinity), came = new Int32Array(N.length).fill(-1);
    const [gx, gy] = N[goal], open = new Heap();
    g[start] = 0; open.push(start, 0);
    const done = new Uint8Array(N.length);
    while (open.size) {
      const c = open.pop();
      if (c === goal) break;
      if (done[c]) continue;
      done[c] = 1;
      for (const [nb, w] of this.adj[c]) {
        if (done[nb] || blocked && blocked(nb)) continue;
        const ng = g[c] + w;
        if (ng < g[nb]) { g[nb] = ng; came[nb] = c; open.push(nb, ng + Math.hypot(N[nb][0] - gx, N[nb][1] - gy)); }
      }
    }
    if (!Number.isFinite(g[goal])) return null;
    const path = [goal];
    for (let c = goal; c !== start;) { c = came[c]; path.push(c); }
    return path.reverse();
  }
  // Single-source shortest lengths (Dijkstra); Infinity where unreachable.
  distances(start, blocked = null) {
    const N = this.nodes, g = new Float64Array(N.length).fill(Infinity), open = new Heap(), done = new Uint8Array(N.length);
    if (start < 0 || blocked && blocked(start)) return g;
    g[start] = 0; open.push(start, 0);
    while (open.size) {
      const c = open.pop();
      if (done[c]) continue;
      done[c] = 1;
      for (const [nb, w] of this.adj[c]) {
        if (done[nb] || blocked && blocked(nb)) continue;
        const ng = g[c] + w;
        if (ng < g[nb]) { g[nb] = ng; open.push(nb, ng); }
      }
    }
    return g;
  }
  pathLength(path) {
    let L = 0;
    for (let i = 1; i < path.length; i++) L += Math.hypot(this.nodes[path[i]][0] - this.nodes[path[i - 1]][0], this.nodes[path[i]][1] - this.nodes[path[i - 1]][1]);
    return L;
  }
  points(path) { return path.map(i => this.nodes[i]); }

  // Streets, plaza, then points of interest with validated connectors.
  static fromLayout({ streets, plaza, boxes = [], pois = [] }) {
    const g = new NavGraph();
    const streetNodes = [], segs = [];
    streets.forEach((st, si) => {
      let prev = -1;
      const p = st.pts;
      const add = (x, y) => { const id = g.add(x, y); streetNodes.push(id); if (prev >= 0) { g.link(prev, id); segs.push([prev, id, si]); } prev = id; };
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, ay] = p[i], [bx, by] = p[i + 1];
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / STEP));
        for (let k = 0; k < n; k++) add(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
      }
      const last = p[p.length - 1];
      add(last[0], last[1]);
    });
    const N = g.nodes;
    // Crossings: streets that intersect mid-segment meet at a new junction node.
    const crossings = [];
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const [a, b, sa] = segs[i], [c, d, sb] = segs[j];
      if (sa === sb && (a === c || a === d || b === c || b === d)) continue;
      const hit = intersect(N[a], N[b], N[c], N[d]);
      if (hit) crossings.push([hit, a, b, c, d]);
    }
    for (const [[x, y], a, b, c, d] of crossings) { const id = g.add(x, y); streetNodes.push(id); for (const n of [a, b, c, d]) g.link(id, n); }
    // T-junctions: a street end close to another street joins it.
    const ends = new Set(streets.flatMap((st, si) => { const own = segs.filter(s2 => s2[2] === si); return own.length ? [own[0][0], own[own.length - 1][1]] : []; }));
    for (const e of ends) {
      let best = null;
      for (const [a, b] of segs) {
        if (a === e || b === e) continue;
        const q = project(N[e], N[a], N[b]);
        if (q.d < JOIN * 1.75 && (!best || q.d < best.d)) best = { ...q, a, b };
      }
      if (best) { const id = g.add(best.x, best.y); streetNodes.push(id); g.link(id, best.a); g.link(id, best.b); g.link(id, e); }
    }
    // Nearby nodes of different streets.
    for (let i = 0; i < streetNodes.length; i++) for (let j = i + 1; j < streetNodes.length; j++) {
      const a = streetNodes[i], b = streetNodes[j];
      if (Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]) < JOIN) g.link(a, b);
    }
    // A connector may leave a box it starts inside (a door, the plaza fountain); otherwise it must
    // not pass through buildings or walls. Tight lanes are allowed a little more clearance.
    const inside = (x, y, o) => Math.abs((x - o.x) * o.rx + (y - o.y) * o.ry) < o.hw && Math.abs((x - o.x) * o.fx + (y - o.y) * o.fy) < o.hd;
    const clear = (ax, ay, bx, by, own, shrink) => !boxes.some(o => o !== own && !inside(ax, ay, o) && segmentHitsBox(ax, ay, bx, by, o, shrink));
    const connect = (id, own, maxReach, shrink = 0.01, targets = streetNodes) => {
      const [x, y] = N[id];
      const near = targets.map(n => [n, Math.hypot(N[n][0] - x, N[n][1] - y)]).filter(([n]) => n !== id).sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, CONNECT_TRIES);
      let linked = 0;
      for (const [n, d] of near) {
        if (d > maxReach) break;
        if (clear(x, y, N[n][0], N[n][1], own, shrink)) { g.link(id, n); if (++linked >= 2) break; }
      }
      return linked > 0;
    };
    g.plaza = g.add(plaza[0], plaza[1]);
    if (!connect(g.plaza, null, 2) && !connect(g.plaza, null, 2, 0.05) && streetNodes.length) g.link(g.plaza, g.nearest(plaza[0], plaza[1], i => i !== g.plaza));
    g.streetCount = streetNodes.length;
    // Points of interest: doors, work places and stores. Unconnected ones are marked unreachable.
    g.pois = pois.map(p => {
      const id = g.add(p.x, p.y);
      const reach = p.reach ?? CONNECT_MAX;
      const ok = !streetNodes.length ? (g.link(id, g.plaza), true) : connect(id, p.box || null, reach) || connect(id, p.box || null, reach, 0.05);
      return { ...p, node: id, reachable: ok };
    });
    // Landlocked doors reach a lane through a neighbouring door when the gap between them is clear.
    const linkedPois = () => g.pois.filter(q => q.reachable).map(q => q.node);
    for (const q of g.pois) if (!q.reachable) q.reachable = connect(q.node, q.box || null, 0.8, 0.05, linkedPois());
    // Join street fragments to the plaza's network across open ground, shortest clear gap first.
    for (let round = 0; round < 40; round++) {
      const comp = g.components(), main = comp[g.plaza];
      let best = null;
      for (let a = 0; a < N.length; a++) {
        if (comp[a] === main || !g.adj[a].length && !g.pois.some(q => q.node === a)) continue;
        for (let b = 0; b < N.length; b++) {
          if (comp[b] !== main) continue;
          const d = Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]);
          if (d < 2.5 && (!best || d < best.d) && clear(N[a][0], N[a][1], N[b][0], N[b][1], null, 0.05)) best = { a, b, d };
        }
      }
      if (!best) break;
      g.link(best.a, best.b);
    }
    const comp = g.components();
    for (const q of g.pois) q.reachable = comp[q.node] === comp[g.plaza];
    return g;
  }
  components() {
    const out = new Int32Array(this.nodes.length).fill(-1);
    let c = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      if (out[i] >= 0) continue;
      const stack = [i]; out[i] = c;
      while (stack.length) { const n = stack.pop(); for (const [m] of this.adj[n]) if (out[m] < 0) { out[m] = c; stack.push(m); } }
      c++;
    }
    return out;
  }
}
