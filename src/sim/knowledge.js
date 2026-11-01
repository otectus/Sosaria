import { nextId, remember } from './state.js';

export function fact(state, type, where, text, options = {}) {
  const f = { id: nextId(state, 'event'), tick: state.tick, type, where, text, status: 'resolved',
    causeIds: [], actors: [], ...options };
  state.facts.push(f);
  const town = state.settlements[where];
  if (town) {
    town.known.push(f.id); town.known = town.known.slice(-32);
    town.history.push(f.id); town.history = town.history.slice(-24); town.outcomes++;
    const witness = Object.values(state.residents).find(r => r.site === where && r.role === 'guard');
    if (witness) { f.witness = witness.id; remember(witness, f.id); }
  }
  return f;
}

export function reportsForTrip(state, trip) {
  const origin = state.settlements[trip.from], target = state.settlements[trip.to];
  return origin.known.filter(id => !target.known.includes(id)).slice(-4).map(id => {
    const f = state.facts.find(f => f.id === id);
    const report = { id: nextId(state, 'report'), factId: id, from: trip.from, to: trip.to,
      carrier: trip.carrier, trip: trip.id, route: trip.route, sent: state.tick, received: null,
      confidence: 1, truthStatus: f?.status === 'legend' ? 'legend' : 'reported' };
    state.reports.push(report);
    return report.id;
  });
}

export function receiveReports(state, trip) {
  const town = state.settlements[trip.to];
  for (const id of trip.reports) {
    const report = state.reports.find(r => r.id === id);
    if (!report || report.received !== null) continue;
    report.received = state.tick;
    if (!town.known.includes(report.factId)) town.known.push(report.factId);
    town.known = town.known.slice(-32);
    const source = state.facts.find(f => f.id === report.factId);
    if (source) fact(state, 'report_received', trip.to, `${state.residents[trip.carrier]?.name || 'A courier'} brought word: ${source.text}`,
      { causeIds: [source.id], actors: [trip.carrier], status: report.truthStatus, report: report.id });
  }
}

// Keep references for live situations and a bounded causal archive. Old chains become explicit summaries.
export function pruneHistory(state) {
  const keep = new Set(state.facts.slice(-160).map(f => f.id));
  for (const t of Object.values(state.settlements)) { t.history.forEach(id => keep.add(id)); t.known.forEach(id => keep.add(id)); if (t.shortageFact) keep.add(t.shortageFact); }
  for (const r of Object.values(state.residents)) r.memories.forEach(id => keep.add(id));
  for (const b of Object.values(state.buildings)) { keep.add(b.fact); if (b.repairFact) keep.add(b.repairFact); }
  for (const t of state.trips) if (t.status === 'travelling') keep.add(t.fact);
  state.reports = state.reports.filter(r => r.received === null && state.trips.some(t => t.id === r.trip && t.status === 'travelling') || state.tick - (r.received ?? r.sent) < 840);
  state.reports.forEach(r => keep.add(r.factId));
  const recent = state.facts.filter(f => keep.has(f.id));
  const ancestors = new Set(recent.flatMap(f => f.causeIds));
  state.facts = state.facts.filter(f => keep.has(f.id) || ancestors.has(f.id));
  const available = new Set(state.facts.map(f => f.id));
  for (const f of state.facts) {
    if (f.causeIds.some(id => !available.has(id))) f.archivedCauses = true;
    f.causeIds = f.causeIds.filter(id => available.has(id));
  }
}
