import { GOODS, STOCK_LIMIT, nextId, remember } from './state.js';
import { fact, reportsForTrip, receiveReports } from './knowledge.js';

export function depart(state, catalog, from, to, cargo = {}, causeIds = [], carrierId = null) {
  const edge = catalog.edges.find(r => r.a === from && r.b === to || r.a === to && r.b === from);
  if (!edge || state.routes[edge.id].closedUntil > state.tick) return null;
  const town = state.settlements[from];
  const entries = Object.entries(cargo);
  if (entries.some(([g, n]) => !GOODS.includes(g) || !Number.isSafeInteger(n) || n <= 0 || town.stocks[g] < n)) return null;
  const carrier = Object.values(state.residents).find(r => (carrierId ? r.id === carrierId : r.site === from) && r.location === from && r.returnAfter <= state.tick && r.role === 'merchant' && !state.trips.some(t => t.carrier === r.id && t.status === 'travelling'));
  if (!carrier) return null;
  const trip = { id: nextId(state, 'trip'), from, to, route: edge.id, carrier: carrier.id, cargo: { ...cargo },
    status: 'travelling', departed: state.tick, duration: edge.duration, progress: 0, etaTick: state.tick + edge.duration,
    completed: null, reports: [], fact: null, delayFact: null };
  for (const [g, n] of entries) town.stocks[g] -= n;
  state.trips.push(trip);
  const manifest = entries.map(([g, n]) => `${n} ${g}`).join(', ') || 'a sealed report';
  const f = fact(state, 'shipment_departed', from, `${carrier.name} left ${catalog.byId[from].name} for ${catalog.byId[to].name} with ${manifest}.`,
    { status: 'happening', actors: [carrier.id, trip.id], causeIds, manifest: { ...cargo }, trip: trip.id });
  trip.fact = f.id;
  remember(carrier, f.id);
  trip.reports = reportsForTrip(state, trip);
  return trip;
}

export function travelStep(state, catalog) {
  for (const trip of state.trips) {
    if (trip.status !== 'travelling') continue;
    const road = state.routes[trip.route];
    if (road.closedUntil > state.tick) {
      trip.etaTick = road.closedUntil + trip.duration - trip.progress;
      if (trip.delayFact !== road.cause) {
        fact(state, 'shipment_delayed', trip.from, `${state.residents[trip.carrier].name}'s journey is waiting for the road to reopen.`,
          { causeIds: [trip.fact, road.cause].filter(Boolean), trip: trip.id });
        trip.delayFact = road.cause;
      }
      continue;
    }
    trip.progress = Math.min(trip.duration, trip.progress + 1);
    trip.etaTick = state.tick + trip.duration - trip.progress;
    if (trip.progress < trip.duration) continue;
    const town = state.settlements[trip.to];
    if (Object.entries(trip.cargo).some(([g, n]) => town.stocks[g] + n > STOCK_LIMIT)) { trip.etaTick = state.tick + 30; continue; }
    for (const [g, n] of Object.entries(trip.cargo)) town.stocks[g] += n;
    trip.status = 'delivered'; trip.completed = state.tick;
    state.residents[trip.carrier].location = trip.to;
    state.residents[trip.carrier].returnAfter = state.tick + 30;
    const departure = state.facts.find(f => f.id === trip.fact);
    if (departure) departure.status = 'resolved';
    const goods = Object.entries(trip.cargo).map(([g, n]) => `${n} ${g}`).join(', ') || 'the sealed report';
    const f = fact(state, 'shipment_delivered', trip.to, `${state.residents[trip.carrier].name} delivered ${goods} to ${catalog.byId[trip.to].name}.`,
      { causeIds: [trip.fact], trip: trip.id, manifest: { ...trip.cargo }, actors: [trip.carrier] });
    remember(state.residents[trip.carrier], f.id);
    receiveReports(state, trip);
  }
}

export function loseTrip(state, id, reason = 'Cargo was lost on the road.') {
  const trip = state.trips.find(t => t.id === id);
  if (!trip || trip.status !== 'travelling') return false;
  trip.status = 'lost'; trip.completed = state.tick;
  for (const [g, n] of Object.entries(trip.cargo)) state.ledger.lost[g] += n;
  const departure = state.facts.find(f => f.id === trip.fact);
  if (departure) departure.status = 'resolved';
  fact(state, 'shipment_lost', trip.from, reason, { causeIds: [trip.fact], trip: trip.id });
  return true;
}

export function planTrade(state, catalog) {
  // Deliveries and visits end at the destination. Carriers rest, then physically return.
  for (const r of Object.values(state.residents)) if (r.location !== r.site && r.returnAfter <= state.tick && !state.trips.some(t => t.carrier === r.id && t.status === 'travelling')) {
    depart(state, catalog, r.location, r.site, {}, [], r.id);
  }
  for (const [from, to, good] of [['millbrook', 'brightwater', 'grain'], ['brightwater', 'highmoor', 'flour']]) {
    const a = state.settlements[from], b = state.settlements[to];
    if (!a || !b || b.stocks[good] >= 60 || a.stocks[good] < 32 || state.trips.some(t => t.from === from && t.to === to && t.status === 'travelling')) continue;
    depart(state, catalog, from, to, { [good]: Math.min(64, a.stocks[good] - 8) }, b.shortageFact ? [b.shortageFact] : []);
  }
  // Important local news gets a courier on a real road, including a return path for fire reports.
  for (const town of Object.values(state.settlements)) {
    const news = town.known.map(id => state.facts.find(f => f.id === id)).find(f => f && ['fire_started', 'fire_extinguished', 'repair_completed'].includes(f.type));
    if (!news) continue;
    const edge = catalog.edges.find(e => (e.a === town.id || e.b === town.id) && !state.settlements[e.a === town.id ? e.b : e.a].known.includes(news.id));
    if (!edge) continue;
    const to = edge.a === town.id ? edge.b : edge.a;
    const trip = depart(state, catalog, town.id, to, {}, [news.id]);
    if (trip && !trip.reports.some(id => state.reports.find(r => r.id === id)?.factId === news.id)) {
      // Ensure the triggering report is among the bounded bundle.
      const known = town.known; town.known = [news.id];
      trip.reports.push(...reportsForTrip(state, trip)); town.known = known;
    }
  }
}
