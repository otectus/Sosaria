import { createState, nextId } from './state.js';
import { FixedTime } from './time.js';
import { fact, pruneHistory } from './knowledge.js';
import { economyStep, consume } from './economy.js';
import { travelStep, planTrade, depart } from './travel.js';
import { incidentStep, beginRepair } from './incidents.js';

export function stepWorld(state, catalog) {
  state.tick++;
  travelStep(state, catalog);
  incidentStep(state, catalog);
  if (state.tick % 30 === 0) { economyStep(state, catalog); planTrade(state, catalog); }
  if (state.tick % 420 === 0) {
    state.trips = state.trips.filter(t => t.status === 'travelling' || state.tick - t.completed < 840);
    state.commands = state.commands.slice(-64);
    pruneHistory(state);
  }
}

// Commands validate everything before committing cost or facts; repeated commands are safe.
export function command(state, catalog, input) {
  const town = state.settlements[input.site];
  const p = catalog.byId[input.site];
  if (!town || !p) return { ok: false, message: 'Choose a settlement.' };
  const actor = Object.values(state.residents).find(r => r.site === p.id && r.role === 'guard');
  const reject = message => ({ ok: false, message });
  let action;
  if (input.type === 'repair') {
    const b = state.buildings[input.building];
    if (!b || b.site !== p.id || b.status !== 'damaged') return reject('Only an extinguished, damaged home can be repaired.');
    if (town.stocks.coin < 12 || town.stocks.timber < 6 || town.stocks.tools < 1) return reject('Repair needs 12 coin, 6 timber and 1 tool from the town reserve.');
    action = cause => beginRepair(state, catalog, b, true, [cause]);
  } else if (input.type === 'close_route') {
    const route = catalog.edges.find(e => e.id === input.route && (e.a === p.id || e.b === p.id));
    if (!route) return reject('That road does not connect to this town.');
    if (state.routes[route.id].closedUntil > state.tick) return reject('This road is already closed.');
    if (town.stocks.coin < 2) return reject('The road watch needs 2 coin.');
    action = cause => {
      consume(state, town, 'coin', 2);
      const f = fact(state, 'route_closed', p.id, `${p.name}'s watch closed a road for 90 seconds to inspect its safety.`, { actors: actor ? [actor.id] : [], route: route.id, causeIds: [cause] });
      state.routes[route.id] = { closedUntil: state.tick + 90, cause: f.id };
    };
  } else if (input.type === 'send_report') {
    const source = state.facts.find(f => f.id === input.fact);
    if (!source || !town.known.includes(source.id)) return reject('This town has no account of that event.');
    if (!catalog.edges.some(e => e.a === p.id && e.b === input.to || e.b === p.id && e.a === input.to)) return reject('A courier needs a connecting road.');
    if (state.settlements[input.to].known.includes(source.id)) return reject('That town already knows this account.');
    const trip = depart(state, catalog, p.id, input.to, {}, [source.id]);
    if (!trip) return reject('The merchant is already travelling, or the road is closed.');
    // depart takes a recent bundle; explicitly include the selected account.
    if (!trip.reports.some(id => state.reports.find(r => r.id === id)?.factId === source.id)) {
      const report = { id: nextId(state, 'report'), factId: source.id, from: p.id, to: input.to, carrier: trip.carrier,
        trip: trip.id, route: trip.route, sent: state.tick, received: null, confidence: 1, truthStatus: source.status === 'legend' ? 'legend' : 'reported' };
      state.reports.push(report); trip.reports.push(report.id);
    }
    action = cause => { state.facts.find(f => f.id === trip.fact).causeIds.push(cause); };
  } else return reject('Unknown intervention.');
  const record = { id: nextId(state, 'command'), tick: state.tick, type: input.type, site: p.id, actor: actor?.id || null };
  state.commands.push(record);
  const cause = fact(state, 'intervention', p.id, `An observer requested ${input.type === 'repair' ? 'a funded repair' : input.type === 'close_route' ? 'a road inspection' : 'a courier'} in ${p.name}.`,
    { actors: actor ? [actor.id] : [], command: record.id });
  action(cause.id);
  return { ok: true, message: input.type === 'repair' ? 'Repair funded. The roof will be ready in 90 world seconds.' : input.type === 'close_route' ? 'The road watch will reopen this route in 90 world seconds.' : 'The courier has departed with the account.' };
}

export class Simulation {
  constructor(catalog, state = createState(catalog)) { this.catalog = catalog; this.state = state; this.time = new FixedTime(); }
  advance(elapsed, speed = 1, paused = false) { return this.time.advance(elapsed, speed, paused, () => stepWorld(this.state, this.catalog)); }
  get seconds() { return this.state.tick + this.time.fraction; }
  command(input) { return command(this.state, this.catalog, input); }
  replace(state) { this.state = state; this.time = new FixedTime(); }
}
