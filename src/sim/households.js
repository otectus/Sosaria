// Households share shelter and a pantry. The M1 economy is civic allocation: each dawn the
// settlement's stores issue rations to households under the current ration policy. Hunger is
// remembered, and a household that stays hungry without help may migrate.
import { MEAL_PREFERENCE } from '../content/goods.js';
import { SPECIES } from '../content/occupations.js';
import { worldDay } from './clock.js';
import { held, available, transfer } from './inventory.js';
import { commit } from './history.js';
import { remember } from './residents.js';

export const TARGET_DAYS = { normal: 2, rationing: 1, emergency: 1 };

export const eaters = (state, h) => h.members.filter(id => { const p = state.residents[id]; return p && SPECIES[p.species].eats && !p.journey && p.at.site === h.site; }).length;
export const pantryRations = (state, h) => MEAL_PREFERENCE.reduce((n, g) => n + held(state, `inv:${h.id}`, g), 0);

// Dawn allocation. Rotating start order spreads any shortfall fairly across households.
export function allocate(state, catalog, place) {
  const town = state.settlements[place.id];
  const list = Object.values(state.households).filter(h => h.site === place.id && !h.migrating).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!list.length) return { issued: 0, short: 0 };
  const sources = [...place.stores.food, ...place.stores.dry, ...place.stores.reserve].filter((v, i, a) => a.indexOf(v) === i);
  const days = TARGET_DAYS[town.policy] || 2;
  const start = worldDay(state.tick) % list.length;
  let issued = 0, short = 0;
  for (let k = 0; k < list.length; k++) {
    const h = list[(start + k) % list.length];
    const n = eaters(state, h);
    if (!n) continue;
    let need = n * days - pantryRations(state, h);
    if (town.policy === 'emergency') need = Math.min(need, n - pantryRations(state, h));
    for (const g of MEAL_PREFERENCE) {
      for (const inv of sources) {
        if (need <= 0) break;
        const k2 = Math.min(need, available(state, inv, g));
        if (k2 > 0 && transfer(state, inv, `inv:${h.id}`, { [g]: k2 })) { need -= k2; issued += k2; }
      }
    }
    if (need > 0) short += need;
  }
  town.unmet += short;
  return { issued, short };
}

// Daily hunger accounting; prolonged hunger without relief leads to migration.
export function householdDay(state, catalog, place, relief) {
  const town = state.settlements[place.id];
  for (const h of Object.values(state.households)) {
    if (h.site !== place.id || h.migrating) continue;
    const hungry = h.members.some(id => state.residents[id]?.hungry >= 1);
    h.hungry = hungry ? h.hungry + 1 : 0;
    if (h.hungry === 2) {
      const e = commit(state, 'household_hungry', place.id, { household: h.id, members: h.members.length, policy: town.policy }, { importance: 1, causes: [town.shortage] });
      for (const id of h.members) remember(state, state.residents[id], e.id, 'hungry');
    }
    if (h.hungry >= 4 && !relief && town.policy === 'emergency') {
      const to = migrationTarget(state, catalog, place);
      if (to) h.migrating = { to, since: state.tick };
    }
    // Migration is reversible: once home is secure again, the household goes back.
    if (h.origin && h.origin !== place.id && !h.migrating && state.tick - (h.arrived ?? 0) >= 20 * 1440 && state.settlements[h.origin].outlook >= 150 && state.settlements[h.origin].policy === 'normal') {
      h.migrating = { to: h.origin, since: state.tick, returning: true };
    }
  }
}

function migrationTarget(state, catalog, place) {
  const options = catalog.adjacency[place.id]?.map(id => catalog.edgeById[id]).filter(e => e.mode === 'road').map(e => e.a === place.id ? e.b : e.a)
    .filter(id => state.settlements[id] && state.settlements[id].outlook >= 60 && catalog.byId[id].homes.length) || [];
  options.sort((a, b) => state.settlements[b].outlook - state.settlements[a].outlook || (a < b ? -1 : 1));
  return options[0] || null;
}

// A migrant household's new home: the first vacant one at the destination, or shared if none.
export function rehouse(state, catalog, h, site) {
  const place = catalog.byId[site];
  const used = new Set(Object.values(state.households).filter(x => x.site === site && x.id !== h.id).map(x => x.home));
  const home = place.homes.find(id => !used.has(id)) || place.homes[0] || null;
  state.settlements[h.site].people -= h.members.length;
  state.settlements[site].people += h.members.length;
  h.origin = h.origin || h.site;
  if (site === h.origin) h.origin = null;
  h.arrived = state.tick;
  h.site = site; h.home = home; h.displaced = false; h.migrating = null; h.hungry = 0;
  for (const id of h.members) {
    const p = state.residents[id];
    p.site = site; p.faction = place.realm; p.hungry = 0;
    if (home) p.at = { site, node: place.pois[place.byBuilding[home].poi].node };
  }
  return home;
}
