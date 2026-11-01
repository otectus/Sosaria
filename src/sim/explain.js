// Read models for inspectors. Structured facts only (IDs, numbers, reason keys); the UI turns
// them into sentences. Reading never changes the world.
import { GOODS, FOOD, GOOD_IDS } from '../content/goods.js';
import { OCCUPATIONS, SPECIES } from '../content/occupations.js';
import { RECIPES } from '../content/recipes.js';
import { held, available } from './inventory.js';
import { resolve } from './history.js';
import { outlook, allStores, priceOf, incomingFood } from './markets.js';
import { legProgress } from './travel.js';
import { functional, projectInv } from './buildings.js';
import { pantryRations } from './households.js';
import { localMinute, durationText } from './clock.js';

export const goodsOf = (state, inv) => ({ ...(state.inventories[inv]?.goods || {}) });
const sumStores = (state, ids) => {
  const out = {};
  for (const id of ids) for (const [g, n] of Object.entries(state.inventories[id]?.goods || {})) out[g] = (out[g] || 0) + n;
  return out;
};

export function personView(state, catalog, id) {
  const p = state.residents[id];
  if (!p) return null;
  const h = state.households[p.household];
  const job = state.jobs[p.job];
  const sh = p.journey ? state.shipments[p.journey] : null;
  return {
    id, name: p.name, species: p.species, speciesName: SPECIES[p.species].name, culture: p.culture, faction: p.faction, occupation: p.occupation,
    occupationName: OCCUPATIONS[p.occupation]?.name || p.occupation, age: p.age, skill: p.skill, traits: p.traits, health: p.health,
    site: p.site, at: p.at.site, away: p.at.site !== p.site, task: p.task, why: p.task?.why || null, job: job ? { id: job.id, recipe: job.recipe, step: job.step, labor: job.labor, need: job.need, building: job.building, field: job.field, project: job.project } : null,
    carrying: goodsOf(state, `inv:carry:${p.id}`), journey: sh ? shipmentView(state, catalog, sh.id) : null,
    household: h ? { id: h.id, home: h.home, displaced: h.displaced, members: h.members.map(m => ({ id: m, name: state.residents[m]?.name, occupation: state.residents[m]?.occupation, age: state.residents[m]?.age })), pantry: pantryRations(state, h), hungryDays: h.hungry } : null,
    needs: Object.fromEntries(Object.entries(p.needs).map(([k, v]) => [k, Math.round(v / 100)])),
    memories: p.memories.slice().reverse().map(m => ({ ...m, event: resolve(state, m.e) })),
    ties: Object.entries(p.ties).map(([other, t]) => ({ id: other, name: state.residents[other]?.name || 'someone who has left', ...t })),
  };
}

export function buildingView(state, catalog, id) {
  const site = catalog.buildingSite[id];
  if (!site) return null;
  const place = catalog.byId[site], def = place.byBuilding[id], b = state.buildings[id];
  const rec = b || { cond: 100, stage: 'complete', use: def.use, model: def.model };
  const pr = rec.project ? state.projects[rec.project] : null;
  const workers = Object.values(state.jobs).filter(j => j.building === id || j.project && j.project === rec.project).map(j => ({ job: j.id, recipe: j.recipe, step: j.step, worker: j.worker, name: state.residents[j.worker]?.name }));
  const incident = rec.incident ? state.incidents[rec.incident] : null;
  let idle = null;
  if (!workers.length && ['mill', 'bakery', 'smithy'].includes(rec.use)) {
    const asked = Object.values(state.residents).find(p => p.at.site === site && p.task?.why?.key === 'blocked' && p.task.node !== undefined && p.task.to === place.pois[def.poi].node);
    idle = asked ? asked.task.why : { key: 'blocked', reason: 'no_worker' };
  }
  return {
    id, site, use: rec.use, model: rec.model, cond: rec.cond, stage: rec.stage, functional: functional(state, id), combustible: def.combustible,
    stock: goodsOf(state, `inv:${id}`), workers, idle, incident: incident ? incidentView(state, catalog, incident.id) : null,
    project: pr ? projectView(state, catalog, pr) : null, lastIncident: rec.lastIncident ? resolve(state, rec.lastIncident) : null,
    households: Object.values(state.households).filter(h => h.home === id).map(h => ({ id: h.id, members: h.members.length, displaced: h.displaced })),
  };
}

export function projectView(state, catalog, pr) {
  const stage = pr.stages[pr.stage];
  return {
    id: pr.id, kind: pr.kind, status: pr.status, stage: pr.stage, stages: pr.stages.map(s => s.name), stageName: stage.name,
    materials: stage.materials, delivered: { ...pr.delivered }, onSite: goodsOf(state, projectInv(pr)), inbound: { ...(pr.inbound || {}) },
    labor: pr.labor, laborNeed: stage.labor, blocked: pr.blocked, cause: pr.cause ? resolve(state, pr.cause) : null, started: pr.started,
  };
}

export function settlementView(state, catalog, id) {
  const place = catalog.byId[id], town = state.settlements[id];
  if (!place || !town) return null;
  const view = outlook(state, place);
  const present = Object.values(state.residents).filter(p => p.at.site === id && !p.journey);
  const homed = Object.values(state.residents).filter(p => p.site === id);
  const stores = sumStores(state, allStores(place));
  const households = Object.values(state.households).filter(h => h.site === id);
  const jobs = {};
  for (const j of Object.values(state.jobs)) if (j.site === id) jobs[j.recipe] = (jobs[j.recipe] || 0) + 1;
  const contracts = Object.values(state.contracts).filter(c => c.buyer === id || c.seller === id).map(c => ({ ...c, partner: c.buyer === id ? c.seller : c.buyer, role: c.buyer === id ? 'buying' : 'selling' }));
  const blocked = {};
  for (const p of present) if (p.task?.why?.key === 'blocked') { const k = `${p.task.why.reason}${p.task.why.good ? ':' + p.task.why.good : ''}`; blocked[k] = (blocked[k] || 0) + 1; }
  return {
    id, name: place.name, culture: place.culture, kind: place.kind, realm: place.realm, economy: place.economy, role: place.profile?.role || null,
    population: homed.length, present: present.length, visitors: present.filter(p => p.site !== id).length, away: homed.filter(p => p.at.site !== id).length,
    food: { days: view.tenths / 10, rations: view.rations, need: view.need, incoming: view.incoming, policy: town.policy, issued: town.issued || null, unmet: town.unmet },
    stores, prices: Object.fromEntries(GOOD_IDS.filter(g => !GOODS[g].money).map(g => [g, town.prices[g] ?? priceOf(state, place, g)])),
    treasury: held(state, place.stores.treasury, 'coin'), escrow: state.inventories[place.stores.treasury]?.reserved.coin || 0,
    water: { ...town.water }, dryness: town.dryness, woodland: town.woodland, woodlandMax: town.woodlandMax, fish: town.fish,
    households: households.length, displaced: households.filter(h => h.displaced).length, hungry: households.filter(h => h.hungry > 0).length,
    jobs, blocked, contracts, relief: town.relief ? state.contracts[town.relief] : null,
    steward: homed.find(p => p.occupation === 'steward') || null, recent: town.recent.slice().reverse().map(e => resolve(state, e)).filter(Boolean),
    known: town.known.length, fires: town.fires.map(x => state.incidents[x]).filter(Boolean),
    projects: Object.values(state.projects).filter(pr => pr.site === id).map(pr => projectView(state, catalog, pr)),
    fields: place.fields.map((_, i) => state.fields[`field:${id}:${i}`]).filter(Boolean).reduce((m, f) => (m[f.stage] = (m[f.stage] || 0) + 1, m), {}),
    localMinute: localMinute(state.tick, place.offset),
  };
}

export function shipmentView(state, catalog, id) {
  const sh = state.shipments[id];
  if (!sh) return null;
  const c = sh.contract ? state.contracts[sh.contract] : null;
  return {
    id, kind: sh.kind, status: sh.status, from: sh.from, to: sh.to, carrier: sh.carrier, carrierName: state.residents[sh.carrier]?.name || null, vehicle: sh.vehicle,
    cargo: goodsOf(state, `inv:${id}`), contract: c ? { id: c.id, kind: c.kind, terms: c.terms, price: c.escrow, goods: c.goods } : null,
    route: sh.route.map(e => catalog.edgeById[e]), nodes: sh.nodes, leg: sh.leg, progress: legProgress(sh, state.tick), wait: sh.wait,
    departed: sh.departed, eta: sh.eta, remaining: sh.eta !== null ? Math.max(0, sh.eta - state.tick) : null, news: sh.news.length,
    departure: sh.event ? resolve(state, sh.event) : null,
  };
}

export function incidentView(state, catalog, id) {
  const x = state.incidents[id];
  if (!x) return null;
  const roles = {};
  for (const r of Object.values(x.responders)) roles[r] = (roles[r] || 0) + 1;
  return {
    id, kind: x.kind, site: x.site, building: x.building, use: x.use, status: x.status, origin: x.origin, intensity: x.intensity, peak: x.peak,
    fuel: x.fuel, fuel0: x.fuel0, ignited: x.ignited, detected: x.detected, alarm: x.alarm, ended: x.ended, outcome: x.outcome, roles,
    water: x.water, buckets: x.buckets, lost: { ...x.lost }, saved: { ...(x.saved || {}) }, damage: x.damage,
    cause: resolve(state, x.cause), events: Object.fromEntries(Object.entries(x.events).map(([k, e]) => [k, resolve(state, e)])),
    spreadTo: x.spreadTo, wellLevel: state.settlements[x.site].water.level,
  };
}

// The supply chain behind a good in a settlement: recent deliveries and production that fed it.
export function supplyChain(state, catalog, siteId, good) {
  const steps = [];
  for (const e of state.events) {
    if (e.k === 'shipment_delivered' && e.w === siteId && e.d.cargo?.[good]) steps.push({ kind: 'delivery', event: e, from: e.d.from });
    if (e.k === 'harvest' && e.w === siteId && good === 'grain') steps.push({ kind: 'harvest', event: e });
  }
  return steps.slice(-8);
}

export { FOOD, RECIPES, available, incomingFood, durationText };
