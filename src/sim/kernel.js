// The headless kernel: one tick at a time, due work in stable order, validated commands, and
// bounded catch-up. It never reads the camera, the DOM, Three.js or wall-clock time.
import { SimClock, TICKS_PER_DAY, TICKS_PER_REAL_SECOND, worldDay } from './clock.js';
import { pop, peek, schedule } from './schedule.js';
import { allocate } from './ids.js';
import { commit, resolve } from './history.js';
import { decide } from './residents.js';
import { incidentTick, ignitionCheck, ignite, canIgnite, salvageStep } from './incidents.js';
import { settlementDay, contractStep, worldDayStep, requestRelief, outlook, makeContract, allStores } from './markets.js';
import { onArrival, closeRoute, reopen, depart, createShipment } from './travel.js';
import { createWorld } from './world-state.js';
import { available } from './inventory.js';
import { carrierTask } from './travel.js';

function dispatch(state, catalog, item) {
  switch (item.k) {
    case 'decide': {
      const p = state.residents[item.e];
      if (!p || item.v !== p.token || p.journey) return;
      if (p.task?.k === 'salvage' && !p.task.interrupted) salvageStep(state, catalog, p);
      if (p.task?.k === 'load' && !p.task.interrupted && state.tick >= p.task.end) {
        const sh = state.shipments[p.task.why.shipment];
        if (sh && sh.status === 'loading' && sh.carrier === p.id && depart(state, catalog, sh)) return;
      }
      decide(state, catalog, p);
      return;
    }
    case 'settlement': return settlementDay(state, catalog, catalog.byId[item.e]);
    case 'arrival': {
      const sh = state.shipments[item.e];
      if (sh && item.v === sh.token) onArrival(state, catalog, sh, item.d);
      return;
    }
    case 'contract':
      if (item.e === 'reopen') return reopen(state, catalog, item.d.id);
      contractStep(state, catalog);
      schedule(state, state.tick + 30, 'contract', 'world');
      return;
    case 'weather':
      for (const place of catalog.places) {
        const town = state.settlements[place.id];
        town.water.level = Math.min(town.water.capacity, town.water.level + town.water.yield * 6);
      }
      ignitionCheck(state, catalog);
      schedule(state, state.tick + 60, 'weather', 'world');
      return;
    default: return;
  }
}

export function stepWorld(state, catalog) {
  const day = worldDay(state.tick);
  state.tick++;
  for (let item = peek(state); item && item.t <= state.tick; item = peek(state)) dispatch(state, catalog, pop(state));
  incidentTick(state, catalog);
  if (worldDay(state.tick) !== day) worldDayStep(state, catalog);
}

export function advanceTo(state, catalog, tick) { while (state.tick < tick) stepWorld(state, catalog); return state; }

// ---- Commands: validated before anything is committed; experiments are recorded as such. ----

const EXPERIMENTS = new Set(['ignite', 'drought', 'set_rules', 'close_route']);

export function command(state, catalog, input = {}) {
  const reject = message => ({ ok: false, message });
  const type = input.type;
  let apply, summary;
  if (type === 'ignite') {
    const site = catalog.buildingSite[input.building];
    const why = site ? canIgnite(state, catalog, site, input.building) : 'Choose a building.';
    if (why) return reject(why);
    apply = cause => { const x = ignite(state, catalog, site, input.building, { cause, origin: 'command' }); return x ? `A test fire was started (${x.id}).` : 'The fire did not catch.'; };
    summary = { building: input.building, site };
  } else if (type === 'close_route') {
    const id = input.route;
    const edge = catalog.edgeById[id], bridge = catalog.bridgeById[id];
    if (!edge && !bridge) return reject('Choose a road or bridge.');
    if (state.closures[id]?.until > state.tick) return reject('That way is already closed.');
    const hours = Math.max(1, Math.min(240, Math.round(input.hours ?? 12)));
    apply = cause => { closeRoute(state, catalog, id, state.tick + hours * 60, cause, input.kind || 'closed'); return `${bridge ? 'The bridge' : 'The road'} is closed for ${hours} hours.`; };
    summary = { route: id, hours };
  } else if (type === 'set_rules') {
    const next = { ...state.rules };
    if ('destructiveIncidents' in input) next.destructiveIncidents = !!input.destructiveIncidents;
    if ('ignition' in input) { const v = Math.round(+input.ignition); if (!(v >= 0 && v <= 300)) return reject('Ignition frequency must be 0-300%.'); next.ignition = v; }
    if ('relief' in input) next.relief = !!input.relief;
    apply = () => { state.rules = next; return 'World rules updated.'; };
    summary = { rules: next };
  } else if (type === 'drought') {
    if (!state.settlements[input.site]) return reject('Choose a settlement.');
    const days = Math.max(1, Math.min(60, Math.round(input.days ?? 10)));
    apply = () => { state.drought[input.site] = state.tick + days * TICKS_PER_DAY; const t = state.settlements[input.site]; t.dryness = Math.max(t.dryness, 80); t.water.capacity = Math.floor(t.water.max / 2); t.water.level = Math.min(t.water.level, t.water.capacity); return `Drought set for ${days} days.`; };
    summary = { site: input.site, days };
  } else if (type === 'request_relief') {
    const place = catalog.byId[input.site], town = state.settlements[input.site];
    if (!place || !town) return reject('Choose a settlement.');
    if (town.relief) return reject('Relief is already arranged.');
    apply = () => { const c = requestRelief(state, catalog, place, town, outlook(state, place)); return c ? `Relief agreed with ${catalog.byId[c.seller].name} (${c.terms}).` : 'No neighbour can send relief now.'; };
    summary = { site: input.site };
  } else if (type === 'fund_repair') {
    const pr = Object.values(state.projects).find(x => x.building === input.building);
    if (!pr) return reject('That building has no repair or construction project.');
    if (pr.status !== 'blocked') return reject('The project is not waiting for materials.');
    const place = catalog.byId[pr.site];
    const seller = catalog.adjacency[pr.site].map(id => catalog.edgeById[id]).filter(e => e.mode === 'road').map(e => e.a === pr.site ? e.b : e.a)
      .find(id => Object.entries(pr.blocked.missing).every(([g, n]) => allStores(catalog.byId[id]).some(inv => available(state, inv, g) >= n)));
    if (!seller) return reject('No neighbour has those materials to sell.');
    apply = cause => { const c = makeContract(state, catalog, { kind: 'materials', buyer: pr.site, seller, goods: { ...pr.blocked.missing }, price: 0, terms: 'gift', cause }); return c ? `Materials ordered from ${catalog.byId[seller].name}.` : 'The order could not be placed.'; };
    summary = { building: input.building, seller, goods: pr.blocked.missing, place: place.id };
  } else if (type === 'send_report') {
    const from = catalog.byId[input.site], town = state.settlements[input.site];
    if (!from || !town?.known.includes(input.event)) return reject('This town has no account of that event.');
    if (!catalog.adjacency[from.id].some(id => { const e = catalog.edgeById[id]; return e.mode === 'road' && (e.a === input.to || e.b === input.to); })) return reject('A courier needs a connecting road.');
    if (state.settlements[input.to]?.known.includes(input.event)) return reject('That town already knows this account.');
    const carrier = Object.values(state.residents).find(p => p.site === from.id && p.at.site === from.id && p.occupation === 'merchant' && !p.journey);
    if (!carrier) return reject('No courier is free in this town.');
    apply = cause => {
      const sh = createShipment(state, catalog, { kind: 'courier', carrier: carrier.id, vehicle: 'wagon', from: from.id, to: input.to, cause });
      sh.status = 'loading';
      if (!depart(state, catalog, sh)) { delete state.shipments[sh.id]; return 'The road is closed; the courier waits.'; }
      if (!sh.news.includes(input.event)) sh.news = [input.event, ...sh.news].slice(0, 4);
      return 'A courier has left with the account.';
    };
    summary = { event: input.event, from: from.id, to: input.to };
  } else return reject('Unknown command.');
  const id = allocate(state, 'command');
  const experiment = EXPERIMENTS.has(type) && input.kind !== 'watch';
  const e = commit(state, 'intervention', summary.site || summary.place || catalog.buildingSite[summary.building] || input.site || 'highmoor', { command: id, type, ...summary, experiment },
    { importance: 2, local: false });
  const record = { id, tick: state.tick, type, input: { ...input }, event: e.id, experiment };
  state.commands.push(record);
  if (state.commands.length > 128) state.commands.splice(0, state.commands.length - 128);
  if (experiment || type === 'set_rules') state.interventions.push({ id, tick: state.tick, type, summary });
  const message = apply(e.id);
  return { ok: true, message, id, event: e.id };
}

export class Simulation {
  constructor(catalog, state = createWorld(catalog)) {
    this.catalog = catalog; this.state = state; this.clock = new SimClock(); this.faulted = null; this.lastTicks = 0;
  }
  // Real time in, whole ticks out. Debt beyond two real seconds of the requested speed is dropped:
  // the whole world slows together and the achieved speed is reported.
  advance(elapsed, speed = 1, paused = false, { budgetMs = 8, maxTicks = 2000, now = () => performance.now() } = {}) {
    // Pause stops authoritative change at once, including ticks still owed from fast play.
    if (this.faulted || paused) { this.lastTicks = 0; return 0; }
    this.clock.accrue(elapsed, speed, paused);
    this.clock.clampDebt(Math.ceil(speed * TICKS_PER_REAL_SECOND * 2) + 1);
    const start = now();
    let n = 0;
    try {
      while (this.clock.debt > 0 && n < maxTicks) {
        if ((n & 15) === 15 && now() - start > budgetMs) break;
        this.clock.debt--;
        stepWorld(this.state, this.catalog);
        n++;
      }
    } catch (error) {
      // A partially applied tick is never saved: the kernel stops and the last valid save stands.
      this.faulted = { error, tick: this.state.tick };
      throw error;
    }
    this.clock.record(now() / 1000, n);
    this.lastTicks = n;
    return n;
  }
  run(ticks) { for (let i = 0; i < ticks; i++) stepWorld(this.state, this.catalog); return this.state; }
  get ticks() { return this.state.tick + this.clock.fraction; }
  command(input) { return command(this.state, this.catalog, input); }
  replace(state) { this.state = state; this.clock.reset(); this.faulted = null; }
  event(id) { return resolve(this.state, id); }
}

export { carrierTask };
