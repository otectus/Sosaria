// Settlement-level economy: bounded prices from stock against a target reserve, food outlook,
// the steward's daily decisions (rations, relief, repairs) and civic procurement contracts.
// Coin only moves between treasuries through contracts; transfers never create money.
import { GOODS, GOOD_IDS, FOOD } from '../content/goods.js';
import { SPECIES } from '../content/occupations.js';
import { allocate } from './ids.js';
import { TICKS_PER_DAY, worldDay, dateAt } from './clock.js';
import { schedule } from './schedule.js';
import { available, reserve, release, held, total, lose, transfer } from './inventory.js';
import { commit, compactHistory } from './history.js';
import { dailyWeather } from './weather.js';
import { allocate as allocateRations, householdDay } from './households.js';
import { createShipment, assignCarriers, failContract, relationKeyOf, planRoute, startMigration, resumeWaiting, cleanupShipments } from './travel.js';
import { bestStore, freeStock, expireOpenJobs } from './production.js';
import { remember } from './residents.js';
import { GROWTH_FULL } from './world-state.js';
import { CALENDAR } from '../content/calendar.js';

export const allStores = place => [...place.stores.food, ...place.stores.dry, ...place.stores.reserve, ...place.stores.yard].filter((v, i, a) => a.indexOf(v) === i);
export const consumers = (state, siteId) => Object.values(state.residents).filter(p => p.at.site === siteId && !p.journey && SPECIES[p.species].eats).length;

// Usable food in rations, held by the settlement and its households (excluding cargo on the road).
export function foodOnHand(state, place) {
  let n = 0;
  for (const inv of allStores(place)) for (const g of FOOD) n += held(state, inv, g) * GOODS[g].rations;
  for (const h of Object.values(state.households)) if (h.site === place.id) for (const g of FOOD) n += held(state, `inv:${h.id}`, g) * GOODS[g].rations;
  return n;
}
export function incomingFood(state, siteId) {
  let n = 0;
  // Shipments stuck behind a closure are not counted on: nobody knows when they will arrive.
  for (const sh of Object.values(state.shipments)) if (sh.to === siteId && sh.kind === 'contract' && !['delivered', 'lost', 'waiting'].includes(sh.status)) for (const g of FOOD) n += held(state, `inv:${sh.id}`, g) * GOODS[g].rations;
  for (const c of Object.values(state.contracts)) if (c.buyer === siteId && ['negotiating', 'accepted'].includes(c.status)) for (const g of FOOD) n += (c.goods[g] || 0) * GOODS[g].rations;
  return n;
}

// Outlook in tenths of a day, counting every food at its plain ration value (a conservative
// estimate: baking flour into bread would stretch it further).
export function outlook(state, place) {
  const need = Math.max(1, consumers(state, place.id));
  const rations = foodOnHand(state, place);
  return { tenths: Math.floor(rations * 10 / need), rations, need, incoming: incomingFood(state, place.id) };
}

export function priceOf(state, place, g) {
  const target = place.profile?.targets?.[g] ?? 40;
  const stock = Math.max(1, freeStock(state, place, g));
  const ratio = Math.max(0.5, Math.min(4, target / stock));
  return Math.max(1, Math.round(GOODS[g].price * ratio));
}

function updatePrices(state, place, town) {
  for (const g of GOOD_IDS) {
    if (GOODS[g].money) continue;
    const want = priceOf(state, place, g), now = town.prices[g] ?? want;
    // Smoothed: a quarter of the way toward the stock-based price each day.
    town.prices[g] = now + Math.round((want - now) / 4) || want;
  }
}

function spoil(state, place) {
  const holders = [...allStores(place), ...Object.values(state.households).filter(h => h.site === place.id).map(h => `inv:${h.id}`)];
  for (const inv of holders) for (const g of FOOD) {
    const k = Math.floor(held(state, inv, g) * GOODS[g].perish / 1000);
    if (k) lose(state, inv, g, k, 'spoiled');
  }
}

function growFields(state, place, town) {
  const season = dateAt(state.tick).season, day = worldDay(state.tick);
  const water = town.dryness > 85 ? 50 : town.dryness > 70 ? 75 : 100;
  for (let i = 0; i < place.fields.length; i++) {
    const f = state.fields[`field:${place.id}:${i}`];
    if (!f || f.stage !== 'growing') continue;
    const tended = f.tended >= day - 1;
    f.days++; if (tended) f.care++;
    f.growth += Math.floor(season.growth * (tended ? 100 : 50) / 100 * water / 100);
    if (f.growth >= GROWTH_FULL) { f.growth = GROWTH_FULL; f.stage = 'ripe'; }
  }
}

// The steward's daily review. Every choice is recorded with its reason and inputs.
function stewardDay(state, catalog, place, town, view) {
  if (!consumers(state, place.id)) return;
  const limits = catalog.scenario.policy || { ration: 8, emergency: 3 };
  if (place.economy === 'detailed' || town.policy !== 'normal' || view.tenths < limits.ration * 10) {
    // Hysteresis: rationing ends only once the outlook is comfortably above the threshold again.
    const relaxed = town.policy !== 'normal' ? limits.ration * 12 : limits.ration * 10;
    const policy = view.tenths < limits.emergency * 10 ? 'emergency' : view.tenths < relaxed ? 'rationing' : 'normal';
    if (policy !== town.policy) {
      const e = commit(state, 'ration_policy', place.id, { from: town.policy, to: policy, days: view.tenths / 10, rations: view.rations, need: view.need, incoming: view.incoming },
        { importance: policy === 'normal' ? 1 : 2, causes: [town.shortage] });
      town.policy = policy;
      if (policy !== 'normal' && !town.shortage) town.shortage = e.id;
      if (policy === 'normal') town.shortage = null;
      town.lastDecision = { key: 'ration_policy', event: e.id, tick: state.tick };
    }
  }
  // Relief has a cooldown, so a town does not ask every morning while help is on its way.
  if (state.rules.relief && town.policy !== 'normal' && !town.relief && view.incoming < view.need * 2 && state.tick - (town.reliefAt ?? -1e9) > 2 * TICKS_PER_DAY) { town.reliefAt = state.tick; requestRelief(state, catalog, place, town, view); }
  if (town.relief && !['negotiating', 'accepted', 'shipping'].includes(state.contracts[town.relief]?.status)) town.relief = null;
}

export function requestRelief(state, catalog, place, town, view) {
  const days = 6, want = Math.max(20, view.need * days - Math.floor(view.rations / 2));
  // Neighbours reachable by an open road, best trust first.
  const candidates = [];
  for (const other of catalog.places) {
    if (other.id === place.id || !state.settlements[other.id]) continue;
    const route = planRoute(state, catalog, other.id, place.id, 'road');
    if (!route || route.edges.length > 3) continue;
    // Only a town that is itself secure offers food: no relief passes back and forth between
    // two towns that are both rationing.
    if (state.settlements[other.id].policy !== 'normal') continue;
    const o = outlook(state, other);
    if (o.tenths < 120) continue;
    const spare = Math.floor((o.rations - o.need * 10) * 0.6);
    if (spare < 20) continue;
    if (!Object.values(state.residents).some(p => p.site === other.id && p.occupation === 'merchant' && !p.journey)) continue;
    candidates.push({ other, route, spare, trust: state.relations[relationKeyOf(place.id, other.id)] ?? catalog.scenario.defaultTrust });
  }
  candidates.sort((a, b) => b.trust - a.trust || a.route.ticks - b.route.ticks || (a.other.id < b.other.id ? -1 : 1));
  const ask = commit(state, 'relief_requested', place.id, { need: want, days: view.tenths / 10, candidates: candidates.map(c => c.other.id) }, { importance: 2, causes: [town.shortage] });
  for (const c of candidates) {
    const goods = {};
    let left = Math.min(want, c.spare, 400);
    for (const g of ['grain', 'flour', 'fish', 'provisions', 'bread']) {
      if (left <= 0) break;
      const store = allStores(c.other).map(inv => [inv, available(state, inv, g)]).sort((a, b) => b[1] - a[1])[0];
      if (!store) continue;
      const n = Math.min(left, Math.floor(store[1] * 0.5));
      if (n >= 10) { goods[g] = n; left -= n * GOODS[g].rations; }
    }
    if (!Object.keys(goods).length) continue;
    const gift = c.trust >= catalog.scenario.giftTrust;
    const price = gift ? 0 : Object.entries(goods).reduce((n, [g, k]) => n + k * priceOf(state, c.other, g), 0);
    const canPay = !gift && available(state, place.stores.treasury, 'coin') >= price;
    if (!gift && !canPay && c.trust < 40) { commit(state, 'relief_refused', c.other.id, { buyer: place.id, reason: 'cannot_pay', price }, { causes: [ask.id], importance: 1 }); continue; }
    const terms = gift ? 'gift' : canPay ? 'sale' : 'credit';
    const delay = { gift: 20, sale: 90, credit: 180 }[terms];
    const contract = makeContract(state, catalog, { kind: 'relief', buyer: place.id, seller: c.other.id, goods, terms, price: terms === 'sale' ? price : 0, cause: ask.id, accept: state.tick + delay });
    if (!contract) continue;
    town.relief = contract.id;
    commit(state, 'relief_agreed', c.other.id, { contract: contract.id, buyer: place.id, goods, terms, price: contract.escrow, trust: c.trust, respondsIn: delay }, { causes: [ask.id], importance: 2 });
    return contract;
  }
  commit(state, 'relief_unavailable', place.id, { need: want }, { causes: [ask.id], importance: 2 });
  town.relief = null;
  return null;
}

// Reserve the goods and the payment now; the carrier is found when negotiation ends.
export function makeContract(state, catalog, { kind, buyer, seller, goods, terms = 'sale', price = 0, cause = null, accept = state.tick, mode = 'road' }) {
  const sp = catalog.byId[seller], bp = catalog.byId[buyer];
  const store = bestStore(state, allStores(sp), goods);
  if (!store) return null;
  if (price && !reserve(state, bp.stores.treasury, { coin: price })) return null;
  if (!reserve(state, store, goods)) { if (price) release(state, bp.stores.treasury, { coin: price }); return null; }
  const id = allocate(state, 'contract');
  const c = state.contracts[id] = { id, kind, buyer, seller, goods, terms, escrow: price, sellerInv: store, shipment: null, status: accept > state.tick ? 'negotiating' : 'accepted', mode,
    created: state.tick, accept, cause, event: null, fulfilled: null, reason: null };
  if (terms === 'credit') state.obligations = [...(state.obligations || []), { contract: id, debtor: buyer, creditor: seller, goods, tick: state.tick }].slice(-64);
  if (c.status === 'accepted') ship(state, catalog, c);
  return c;
}

function ship(state, catalog, c) {
  const vehicle = c.mode === 'sea' ? 'ship' : 'wagon';
  const sh = createShipment(state, catalog, { kind: 'contract', contract: c.id, vehicle, from: c.seller, to: c.buyer, store: c.sellerInv, cause: c.cause });
  c.shipment = sh.id; c.status = 'accepted';
  const e = commit(state, 'contract_agreed', c.seller, { contract: c.id, kind: c.kind, buyer: c.buyer, goods: c.goods, price: c.escrow, terms: c.terms, vehicle },
    { causes: [c.cause], importance: c.kind === 'relief' ? 2 : 0 });
  c.event = e.id;
}

// Every half hour: regular procurement, negotiations that conclude, carriers, waiting journeys.
export function contractStep(state, catalog) {
  for (const rule of catalog.scenario.procurement) {
    const buyer = catalog.byId[rule.buyer], seller = catalog.byId[rule.seller];
    if (!buyer || !seller) continue;
    if (freeStock(state, buyer, rule.good) + incomingOf(state, rule.buyer, rule.good) >= rule.below) continue;
    // A second order may run alongside the first when the shortfall is deep.
    const open = Object.values(state.contracts).filter(c => c.buyer === rule.buyer && c.seller === rule.seller && c.goods[rule.good] && !['fulfilled', 'failed', 'cancelled'].includes(c.status)).length;
    if (open >= (freeStock(state, buyer, rule.good) < rule.below / 2 ? rule.open || 1 : 1)) continue;
    const keep = seller.profile?.targets?.[rule.good] ?? 0;
    const spare = freeStock(state, seller, rule.good) - keep;
    const n = Math.min(rule.batch, spare);
    if (n < Math.min(20, rule.batch)) continue;
    const price = n * priceOf(state, seller, rule.good);
    if (available(state, buyer.stores.treasury, 'coin') < price) {
      if (!state.settlements[rule.buyer].unpaid?.[rule.good]) commit(state, 'cannot_afford', rule.buyer, { good: rule.good, price, seller: rule.seller }, { importance: 1 });
      (state.settlements[rule.buyer].unpaid ||= {})[rule.good] = state.tick;
      continue;
    }
    if (state.settlements[rule.buyer].unpaid) delete state.settlements[rule.buyer].unpaid[rule.good];
    makeContract(state, catalog, { kind: 'supply', buyer: rule.buyer, seller: rule.seller, goods: { [rule.good]: n }, price, mode: rule.mode || 'road' });
  }
  for (const c of Object.values(state.contracts)) if (c.status === 'negotiating' && state.tick >= c.accept) ship(state, catalog, c);
  for (const c of Object.values(state.contracts)) if (c.status === 'accepted' && state.tick - c.created > 3 * TICKS_PER_DAY && state.shipments[c.shipment]?.status === 'awaiting') {
    delete state.shipments[c.shipment]; failContract(state, catalog, c, 'no_carrier');
  }
  assignCarriers(state, catalog);
  resumeWaiting(state, catalog);
}

function incomingOf(state, siteId, g) {
  let n = 0;
  for (const c of Object.values(state.contracts)) if (c.buyer === siteId && ['negotiating', 'accepted', 'shipping'].includes(c.status)) n += c.goods[g] || 0;
  return n;
}

// The settlement's dawn: weather, spoilage, renewal, growth, allocation, prices, decisions.
export function settlementDay(state, catalog, place) {
  const town = state.settlements[place.id];
  dailyWeather(state, place, town);
  spoil(state, place);
  // Renewal: woodland regrows steadily; fish recover logistically, with a trickle from open water.
  town.woodland = Math.min(town.woodlandMax, town.woodland + Math.max(2, Math.round(town.woodlandMax * 0.012)));
  if (town.fishMax) town.fish = Math.min(town.fishMax, town.fish + Math.max(Math.round(town.fishMax * 0.02), Math.round(town.fish * 0.1 * (1 - town.fish / town.fishMax))));
  if (place.economy === 'detailed') growFields(state, place, town);
  const issued = allocateRations(state, catalog, place);
  const view = outlook(state, place);
  town.outlook = view.tenths; town.foodNeed = view.need;
  town.issued = issued;
  updatePrices(state, place, town);
  stewardDay(state, catalog, place, town, view);
  householdDay(state, catalog, place, town.relief);
  for (const h of Object.values(state.households)) if (h.site === place.id && h.migrating && !Object.values(state.shipments).some(s => s.household === h.id && !['delivered', 'lost'].includes(s.status))) startMigration(state, catalog, h);
  schedule(state, state.tick + TICKS_PER_DAY, 'settlement', place.id);
}

// Weekly realm dues: towns pass a quarter of their coin above a working reserve to their realm's
// capital, which spends it on the food it cannot grow. A recorded transfer; no coin is created.
export function collectDues(state, catalog) {
  for (const capital of catalog.places.filter(p => p.kind === 'capital' && p.economy === 'detailed')) {
    for (const town of catalog.places) {
      if (town.id === capital.id || town.realm !== capital.realm || town.economy !== 'detailed') continue;
      const due = Math.floor(Math.max(0, available(state, town.stores.treasury, 'coin') - DUES_RESERVE) / 4);
      if (due <= 0) continue;
      transfer(state, town.stores.treasury, capital.stores.treasury, { coin: due });
      commit(state, 'dues_paid', town.id, { to: capital.id, coin: due }, { importance: 0 });
    }
  }
}
const DUES_RESERVE = 500, GRANT_FLOOR = 250, GRANT = 300, CAPITAL_RESERVE = 1200;

// The capital's grants: a town too poor to buy what it needs receives coin from the realm treasury.
export function payGrants(state, catalog) {
  for (const capital of catalog.places.filter(p => p.kind === 'capital' && p.economy === 'detailed')) {
    for (const town of catalog.places) {
      if (town.id === capital.id || town.realm !== capital.realm || town.economy !== 'detailed') continue;
      if (available(state, town.stores.treasury, 'coin') >= GRANT_FLOOR) continue;
      if (available(state, capital.stores.treasury, 'coin') - GRANT < CAPITAL_RESERVE) break;
      transfer(state, capital.stores.treasury, town.stores.treasury, { coin: GRANT });
      commit(state, 'grant_paid', capital.id, { to: town.id, coin: GRANT }, { importance: 1 });
    }
  }
}

// Once a day on the calendar meridian: archives, stale jobs and finished journeys.
export function worldDayStep(state, catalog) {
  if (worldDay(state.tick) % 7 === 0) { collectDues(state, catalog); payGrants(state, catalog); }
  compactHistory(state);
  // Resolved incidents leave the live store after three days; their history remains.
  for (const x of Object.values(state.incidents)) if (x.ended !== null && state.tick - x.ended > 3 * TICKS_PER_DAY) delete state.incidents[x.id];
  expireOpenJobs(state, catalog);
  cleanupShipments(state);
  for (const id of Object.keys(state.inventories)) {
    const inv = state.inventories[id];
    if (!Object.keys(inv.goods).length && !Object.keys(inv.reserved).length && (id.startsWith('inv:carry:') || id.startsWith('inv:shipment:'))) delete state.inventories[id];
  }
}

export { CALENDAR, total, remember };
