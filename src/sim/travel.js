// Journeys over the road and sea network: route planning with closures, carriers, loading,
// legs, waiting and rerouting, atomic arrival, return trips, migration, and the news a traveller
// carries. Cargo is in the shipment's own inventory from departure until the arrival transaction.
import { GOODS } from '../content/goods.js';
import { allocate } from './ids.js';
import { poiNode } from './catalog.js';
import { schedule } from './schedule.js';
import { available, reserve, release, transfer, held } from './inventory.js';
import { commit, learn, resolve } from './history.js';
import { passageClosed } from './weather.js';
import { interrupt, remember } from './residents.js';
import { usableStores } from './buildings.js';
import { rehouse } from './households.js';

export const LOAD_TICKS = 30, UNLOAD_TICKS = 30, DOCKS = 2;
const NEWS = 4;

export function closureOn(state, catalog, edge, tick = state.tick) {
  for (const id of [edge.id, ...edge.bridges]) { const c = state.closures[id]; if (c && c.until > tick) return { id, ...c }; }
  if (edge.mode === 'sea' && edge.dirs) { const s = passageClosed(edge.dirs, tick); if (s) return { id: edge.id, kind: 'storm', until: tick + 60, cause: null, storm: s }; }
  return null;
}

// Cheapest open route by travel time; `mode` keeps wagons on roads and ships at sea.
export function planRoute(state, catalog, from, to, mode = 'road', tick = state.tick) {
  if (from === to) return { edges: [], nodes: [from], ticks: 0 };
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
  const open = [[0, from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    const [d, n] = open.shift();
    if (done.has(n)) continue;
    done.add(n);
    if (n === to) break;
    for (const id of catalog.adjacency[n] || []) {
      const e = catalog.edgeById[id];
      if (e.mode !== mode || closureOn(state, catalog, e, tick)) continue;
      const m = e.a === n ? e.b : e.a, nd = d + e.ticks;
      if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, [n, id]); open.push([nd, m]); }
    }
  }
  if (!dist.has(to)) return null;
  const edges = [], nodes = [to];
  for (let n = to; n !== from;) { const [p, e] = prev.get(n); edges.unshift(e); nodes.unshift(p); n = p; }
  return { edges, nodes, ticks: dist.get(to) };
}

const otherEnd = (edge, n) => edge.a === n ? edge.b : edge.a;

export function createShipment(state, catalog, spec) {
  const id = allocate(state, 'shipment');
  const sh = state.shipments[id] = {
    id, kind: spec.kind, contract: spec.contract || null, carrier: spec.carrier || null, travellers: spec.travellers || [], vehicle: spec.vehicle || 'wagon',
    mode: spec.vehicle === 'ship' ? 'sea' : 'road', from: spec.from, to: spec.to, store: spec.store || null, route: [], nodes: [], leg: 0, legStart: 0, legEnd: 0,
    status: spec.carrier ? 'loading' : 'awaiting', wait: null, departed: null, arrived: null, eta: null, news: [], event: null, cause: spec.cause || null, token: 0, household: spec.household || null,
  };
  return sh;
}

// The carrier walks to the store to load; the journey begins when loading ends.
export function carrierTask(state, catalog, p, place) {
  const sh = Object.values(state.shipments).find(s => s.carrier === p.id && s.status === 'loading');
  if (!sh) return null;
  const store = sh.store || place.stores.food[0];
  const poi = store.startsWith('inv:building:') ? place.byBuilding[store.slice(4)].poi : store.startsWith('inv:yard:') ? place.poi.yard : place.poi.market;
  return { k: 'load', node: poiNode(place, poi), dur: LOAD_TICKS, why: { key: 'load', shipment: sh.id }, pose: ['carry', 'sack'] };
}

// Travellers carry notable news, never routine chatter, never a report of a report, and never a
// town's own news back to it.
function newsFor(state, from, to) {
  const a = state.settlements[from], b = state.settlements[to];
  if (!a || !b) return [];
  return a.known.filter(id => !b.known.includes(id)).map(id => resolve(state, id))
    .filter(e => e && !e.summarized && (e.i >= 1 || e.k === 'legend') && e.k !== 'report_received' && e.w !== to)
    .sort((x, y) => (y.i || 0) - (x.i || 0) || (y.t || 0) - (x.t || 0)).slice(0, NEWS).map(e => e.id);
}

export function depart(state, catalog, sh) {
  const route = planRoute(state, catalog, sh.from, sh.to, sh.mode);
  const p = state.residents[sh.carrier];
  if (!route || !route.edges.length) {
    if (sh.status !== 'waiting') commit(state, 'journey_waiting', sh.from, { shipment: sh.id, to: sh.to, reason: 'no_open_route' }, { importance: 1, causes: [sh.cause], actors: [sh.carrier] });
    sh.status = 'waiting'; sh.wait = { reason: 'no_open_route', since: state.tick };
    return false;
  }
  const c = sh.contract ? state.contracts[sh.contract] : null;
  if (c && !transfer(state, c.sellerInv, `inv:${sh.id}`, c.goods, true)) { failContract(state, catalog, c, 'goods_missing'); return false; }
  if (sh.household) {
    const pantry = `inv:${sh.household}`;
    const goods = { ...state.inventories[pantry]?.goods };
    if (Object.keys(goods).length) transfer(state, pantry, `inv:${sh.id}`, goods);
  }
  sh.route = route.edges; sh.nodes = route.nodes; sh.leg = 0; sh.departed = state.tick; sh.status = 'travelling'; sh.wait = null;
  sh.news = newsFor(state, sh.from, sh.to);
  for (const id of [sh.carrier, ...sh.travellers]) {
    const q = state.residents[id];
    if (!q) continue;
    q.journey = sh.id; q.token++;
    q.task = { k: 'journey', from: q.at.node, to: q.at.node, dep: state.tick, arr: state.tick, end: state.tick, why: { key: 'journey', shipment: sh.id }, pose: null, inside: false };
  }
  startLeg(state, catalog, sh);
  sh.eta = state.tick + route.ticks;
  const e = commit(state, sh.kind === 'contract' ? 'shipment_departed' : sh.kind === 'migration' ? 'household_left' : 'traveller_departed', sh.from,
    { shipment: sh.id, to: sh.to, cargo: { ...state.inventories[`inv:${sh.id}`]?.goods }, route: sh.route, eta: sh.eta, contract: sh.contract, household: sh.household, vehicle: sh.vehicle },
    { actors: [sh.carrier, ...sh.travellers].slice(0, 6), causes: [sh.cause, c?.event], importance: sh.kind === 'return' ? 0 : 1 });
  sh.event = e.id;
  if (p) remember(state, p, e.id, 'carrier');
  if (c) c.status = 'shipping';
  return true;
}

function startLeg(state, catalog, sh, remaining = null) {
  const e = catalog.edgeById[sh.route[sh.leg]];
  sh.legStart = state.tick; sh.legEnd = state.tick + (remaining ?? e.ticks); sh.legTicks = e.ticks;
  sh.token++;
  schedule(state, sh.legEnd, 'arrival', sh.id, { leg: sh.leg }, sh.token);
}

// Fraction of the current leg covered, in the direction of travel.
export function legProgress(sh, tick) {
  if (sh.status === 'waiting' && sh.wait?.progress !== undefined) return sh.wait.progress;
  if (sh.status !== 'travelling') return sh.status === 'unloading' || sh.status === 'queued' || sh.status === 'delivered' ? 1 : 0;
  const total = sh.legTicks || 1, done = total - Math.max(0, sh.legEnd - tick);
  return Math.max(0, Math.min(1, done / total));
}

export function onArrival(state, catalog, sh, data) {
  if (sh.status === 'unloading') return finishUnload(state, catalog, sh);
  if (sh.status !== 'travelling') return;
  const node = sh.nodes[sh.leg + 1];
  shareNews(state, catalog, sh, node);
  if (node === sh.to) {
    const busy = Object.values(state.shipments).filter(s => s.to === sh.to && s.status === 'unloading').length;
    if (busy >= DOCKS && sh.kind === 'contract') { sh.status = 'queued'; sh.wait = { reason: 'unloading_queue', since: state.tick }; return; }
    beginUnload(state, sh);
    return;
  }
  sh.leg++;
  const edge = catalog.edgeById[sh.route[sh.leg]];
  const closed = closureOn(state, catalog, edge);
  if (closed) return blockedAtNode(state, catalog, sh, node, closed);
  startLeg(state, catalog, sh);
}

function beginUnload(state, sh) {
  sh.status = 'unloading'; sh.wait = null; sh.token++;
  schedule(state, state.tick + (sh.kind === 'contract' ? UNLOAD_TICKS : 1), 'arrival', sh.id, { unload: true }, sh.token);
}

// At a junction with the way ahead closed: reroute if another open way exists, otherwise wait.
function blockedAtNode(state, catalog, sh, node, closed) {
  const alt = planRoute(state, catalog, node, sh.to, sh.mode);
  const waitTicks = closed.until - state.tick;
  const rest = sh.route.slice(sh.leg).reduce((n, id) => n + catalog.edgeById[id].ticks, 0);
  if (alt && alt.edges.length && (alt.ticks < waitTicks + rest || waitTicks > 1440)) {
    sh.route = [...sh.route.slice(0, sh.leg), ...alt.edges];
    sh.nodes = [...sh.nodes.slice(0, sh.leg + 1), ...alt.nodes.slice(1)];
    sh.eta = state.tick + alt.ticks;
    commit(state, 'journey_rerouted', node, { shipment: sh.id, closed: closed.id, via: alt.nodes, eta: sh.eta }, { causes: [sh.event, closed.cause], importance: 1, actors: [sh.carrier] });
    startLeg(state, catalog, sh);
    return;
  }
  sh.status = 'waiting'; sh.wait = { reason: 'route_closed', since: state.tick, edge: closed.id, until: closed.until, node };
  commit(state, 'journey_waiting', node, { shipment: sh.id, closed: closed.id, until: closed.until, reason: closed.kind === 'storm' ? 'storm' : 'route_closed' }, { causes: [sh.event, closed.cause], importance: 1, actors: [sh.carrier], local: !!state.settlements[node] });
}

function finishUnload(state, catalog, sh) {
  const c = sh.contract ? state.contracts[sh.contract] : null;
  const place = catalog.byId[sh.to], cargo = { ...state.inventories[`inv:${sh.id}`]?.goods };
  const stops = [];
  if (sh.kind === 'migration') {
    const h = state.households[sh.household];
    if (h) {
      const returning = !!h.origin && h.origin === sh.to;
      rehouse(state, catalog, h, sh.to);
      if (Object.keys(cargo).length) transfer(state, `inv:${sh.id}`, `inv:${h.id}`, cargo);
      stops.push(commit(state, returning ? 'household_returned' : 'household_arrived', sh.to, { household: h.id, from: sh.from, members: h.members.length }, { causes: [sh.event], importance: 2, actors: h.members.slice(0, 4) }).id);
    }
  } else if (Object.keys(cargo).length) {
    // One atomic arrival: goods go to a usable store by storage class, payment is released once.
    for (const [g, n] of Object.entries(cargo)) {
      const role = GOODS[g].storage === 'dry' ? 'dry' : GOODS[g].storage === 'yard' ? 'yard' : 'food';
      const dest = usableStores(state, place, role)[0] || usableStores(state, place, 'food')[0] || place.stores.food[0];
      transfer(state, `inv:${sh.id}`, dest, { [g]: n });
    }
  }
  sh.status = 'delivered'; sh.arrived = state.tick;
  if (c) {
    if (c.escrow) transfer(state, catalog.byId[c.buyer].stores.treasury, catalog.byId[c.seller].stores.treasury, { coin: c.escrow }, true);
    c.status = 'fulfilled'; c.fulfilled = state.tick;
    const key = relationKeyOf(c.buyer, c.seller);
    state.relations[key] = Math.min(100, (state.relations[key] ?? catalog.scenario.defaultTrust) + (c.kind === 'relief' ? 6 : 1));
  }
  const e = commit(state, sh.kind === 'contract' ? 'shipment_delivered' : sh.kind === 'migration' ? 'migration_completed' : 'traveller_arrived', sh.to,
    { shipment: sh.id, from: sh.from, cargo, contract: sh.contract, kind: c?.kind || sh.kind, terms: c?.terms, price: c?.escrow || 0, days: Math.round((state.tick - sh.departed) / 144) / 10 },
    { causes: [sh.event, c?.cause, ...stops], actors: [sh.carrier, ...sh.travellers].slice(0, 4), importance: c?.kind === 'relief' ? 2 : sh.kind === 'return' ? 0 : 1 });
  if (c) c.event = e.id;
  for (const id of [sh.carrier, ...sh.travellers]) {
    const p = state.residents[id];
    if (!p || p.journey !== sh.id) continue;
    p.journey = null;
    const store = place.stores.food[0];
    p.at = { site: sh.to, node: poiNode(place, store.startsWith('inv:market:') ? place.poi.market : place.poi.plaza) };
    p.task = null; p.token++;
    if (c?.kind === 'relief') remember(state, p, e.id, 'relief');
    schedule(state, state.tick + 1, 'decide', p.id, null, p.token);
  }
  if (c?.kind === 'relief') {
    const steward = Object.values(state.residents).find(r => r.site === c.buyer && r.occupation === 'steward');
    if (steward) remember(state, steward, e.id, 'received_relief');
  }
  delete state.inventories[`inv:${sh.id}`];
  // Let the next queued wagon unload.
  const next = Object.values(state.shipments).find(s => s.to === sh.to && s.status === 'queued');
  if (next) beginUnload(state, next);
}

// Reports travel only with real journeys. Second-hand accounts lose confidence and become rumours.
function shareNews(state, catalog, sh, node) {
  const town = state.settlements[node];
  if (!town) return;
  for (const id of sh.news) {
    if (town.known.includes(id)) continue;
    const e = resolve(state, id);
    if (!e || e.w === node) continue;
    const prior = state.reports.find(r => r.e === id && r.to === sh.from);
    const hops = prior ? prior.hops + 1 : 1;
    const confidence = e.k === 'legend' ? 0 : Math.max(25, 100 - 25 * (hops - 1));
    const report = { id: allocate(state, 'report'), e: id, from: sh.from, to: node, carrier: sh.carrier, shipment: sh.id, sent: sh.departed, arrived: state.tick, hops, confidence };
    state.reports.push(report);
    if (state.reports.length > 600) state.reports.splice(0, state.reports.length - 600);
    learn(town, id);
    commit(state, 'report_received', node, { report: report.id, about: id, from: sh.from, hops, confidence, kind: e.k === 'legend' ? 'legend' : confidence < 75 ? 'rumor' : 'report' },
      { causes: [id], actors: [sh.carrier], importance: 0 });
  }
}

// Closing a road or bridge stops wagons that have not yet reached the closure point.
export function closeRoute(state, catalog, id, until, cause, kind = 'closed') {
  state.closures[id] = { until, cause, kind };
  schedule(state, until, 'contract', 'reopen', { id });
  const bridge = catalog.bridgeById[id];
  const edgeId = bridge ? bridge.road : id;
  for (const sh of Object.values(state.shipments)) {
    if (sh.status !== 'travelling' || sh.route[sh.leg] !== edgeId) continue;
    const e = catalog.edgeById[edgeId];
    const forward = sh.nodes[sh.leg] === e.a;
    const progress = legProgress(sh, state.tick);
    const at = bridge ? (forward ? bridge.at : 1 - bridge.at) : progress;
    if (bridge && progress >= at) continue;
    sh.status = 'waiting';
    sh.wait = { reason: bridge ? 'bridge_closed' : 'route_closed', since: state.tick, edge: id, until, progress: bridge ? Math.min(progress, at - 0.02) : progress, remaining: Math.max(0, sh.legEnd - state.tick) };
    sh.token++;
    commit(state, 'journey_waiting', sh.from, { shipment: sh.id, closed: id, until, reason: sh.wait.reason }, { causes: [sh.event, cause], importance: 1, actors: [sh.carrier] });
  }
}

export function reopen(state, catalog, id) {
  const c = state.closures[id];
  if (!c || c.until > state.tick) return;
  delete state.closures[id];
  resumeWaiting(state, catalog);
}

export function resumeWaiting(state, catalog) {
  for (const sh of Object.values(state.shipments)) {
    if (sh.status !== 'waiting') continue;
    if (sh.wait.reason === 'no_open_route') {
      if (sh.carrier && state.residents[sh.carrier]?.at.site === sh.from) depart(state, catalog, sh);
      continue;
    }
    if (sh.wait.progress !== undefined) {
      const edge = catalog.edgeById[sh.route[sh.leg]];
      if (closureOn(state, catalog, edge)) continue;
      const done = sh.wait.progress;
      sh.status = 'travelling';
      const remaining = Math.max(1, Math.round(edge.ticks * (1 - done)));
      sh.wait = null;
      sh.token++;
      sh.legStart = state.tick - Math.round(edge.ticks * done); sh.legEnd = state.tick + remaining; sh.legTicks = edge.ticks;
      schedule(state, sh.legEnd, 'arrival', sh.id, { leg: sh.leg }, sh.token);
      sh.eta = sh.legEnd + sh.route.slice(sh.leg + 1).reduce((n, i) => n + catalog.edgeById[i].ticks, 0);
      continue;
    }
    if (sh.wait.reason === 'route_closed' || sh.wait.reason === 'storm') {
      const node = sh.wait.node;
      const edge = catalog.edgeById[sh.route[sh.leg]];
      const closed = closureOn(state, catalog, edge);
      if (closed) { const alt = planRoute(state, catalog, node, sh.to, sh.mode); if (alt?.edges.length) blockedAtNode(state, catalog, sh, node, closed); continue; }
      sh.status = 'travelling'; sh.wait = null;
      startLeg(state, catalog, sh);
    }
  }
}

// Travellers away from home head back on the next open route.
export function returnHome(state, catalog, p) {
  if (p.journey || p.at.site === p.site) return false;
  const vehicle = p.vehicle || 'foot';
  const sh = createShipment(state, catalog, { kind: 'return', carrier: p.id, vehicle: vehicle === 'ship' ? 'ship' : 'wagon', from: p.at.site, to: p.site });
  sh.status = 'loading';
  if (!depart(state, catalog, sh)) { delete state.shipments[sh.id]; return false; }
  return true;
}

export function startMigration(state, catalog, h) {
  const members = h.members.filter(id => state.residents[id] && !state.residents[id].journey);
  if (!members.length) return null;
  const sh = createShipment(state, catalog, { kind: 'migration', carrier: members[0], travellers: members.slice(1), vehicle: 'wagon', from: h.site, to: h.migrating.to, household: h.id });
  sh.status = 'loading';
  for (const id of members) interrupt(state, catalog, state.residents[id]);
  if (!depart(state, catalog, sh)) { delete state.shipments[sh.id]; return null; }
  return sh;
}

export function failContract(state, catalog, c, reason) {
  if (['fulfilled', 'failed', 'cancelled'].includes(c.status)) return;
  if (c.escrow) release(state, catalog.byId[c.buyer].stores.treasury, { coin: c.escrow });
  if (c.sellerInv && c.status !== 'shipping') release(state, c.sellerInv, c.goods);
  c.status = 'failed'; c.reason = reason;
  commit(state, 'contract_failed', c.buyer, { contract: c.id, seller: c.seller, goods: c.goods, reason }, { causes: [c.cause, c.event], importance: 1 });
}

export const relationKeyOf = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

// Find an idle carrier of the right kind at the seller and send them to load. Relief goes first,
// and when every merchant is on the road an able labourer drives the relief wagon.
export function assignCarriers(state, catalog) {
  const waiting = Object.values(state.shipments).filter(sh => sh.status === 'awaiting')
    .sort((a, b) => (state.contracts[b.contract]?.kind === 'relief') - (state.contracts[a.contract]?.kind === 'relief') || (a.id < b.id ? -1 : 1));
  if (!waiting.length) return;
  const busy = new Set(Object.values(state.shipments).filter(s => s.carrier && !['delivered', 'lost'].includes(s.status)).map(s => s.carrier));
  for (const sh of waiting) {
    const relief = state.contracts[sh.contract]?.kind === 'relief';
    const free = p => p.site === sh.from && p.at.site === sh.from && !p.journey && p.age === 'adult' && !busy.has(p.id);
    const carrier = Object.values(state.residents).find(p => free(p) && p.occupation === 'merchant' && (p.vehicle || 'wagon') === sh.vehicle) ||
      (relief && sh.vehicle === 'wagon' ? Object.values(state.residents).find(p => free(p) && p.occupation === 'laborer') : null);
    if (!carrier) continue;
    sh.carrier = carrier.id; sh.status = 'loading';
    busy.add(carrier.id);
    interrupt(state, catalog, carrier);
  }
}

export function cleanupShipments(state) {
  for (const sh of Object.values(state.shipments)) if ((sh.status === 'delivered' || sh.status === 'lost') && state.tick - sh.arrived > 2880) delete state.shipments[sh.id];
  for (const c of Object.values(state.contracts)) if (['fulfilled', 'failed', 'cancelled'].includes(c.status) && state.tick - (c.fulfilled ?? c.created) > 2880) delete state.contracts[c.id];
}

export { held, available, reserve };
