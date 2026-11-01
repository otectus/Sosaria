import { randomAt } from './rng.js';
import { fact } from './knowledge.js';
import { consume } from './economy.js';
import { precipitation } from './weather.js';

export function weatherAt(state, site, catalog) {
  return precipitation(catalog.byId[site], state.tick) > 0.3 ? 'rain' : 'dry';
}

export function startFire(state, catalog, siteId, buildingId) {
  const p = catalog.byId[siteId], town = state.settlements[siteId];
  const b = p?.buildings.find(b => b.id === buildingId);
  if (!b?.combustible || weatherAt(state, siteId, catalog) !== 'dry' || town.lastFire + 4200 > state.tick ||
    Object.values(state.buildings).some(b => b.site === siteId && b.status !== 'repaired')) return null;
  const f = fact(state, 'fire_started', siteId, `A dry roof caught fire in ${p.name}. The watch called a bucket line from the well.`,
    { status: 'happening', building: b.id, evidence: 'Watch bell and dry timber roof' });
  state.buildings[b.id] = { id: b.id, site: siteId, condition: 100, status: 'burning', started: state.tick,
    endTick: state.tick + 75, repairAt: state.tick + 75 + 420, fact: f.id, repairFact: null, funded: false };
  town.lastFire = state.tick;
  return f;
}

export function beginRepair(state, catalog, b, funded = false, causeIds = []) {
  const town = state.settlements[b.site];
  if (b.status !== 'damaged' || town.stocks.timber < 6 || town.stocks.tools < 1 || funded && town.stocks.coin < 12) return false;
  consume(state, town, 'timber', 6); consume(state, town, 'tools', 1);
  if (funded) consume(state, town, 'coin', 12);
  b.status = 'repairing'; b.funded = funded; b.repairAt = state.tick + (funded ? 90 : 210);
  const f = fact(state, 'repair_started', b.site, `${catalog.byId[b.site].name}'s carpenters began ${funded ? 'a funded' : 'a town'} repair with six timber and one tool.`,
    { status: 'happening', causeIds: [b.fact, ...causeIds], building: b.id });
  b.repairFact = f.id;
  return true;
}

export function incidentStep(state, catalog) {
  for (const b of Object.values(state.buildings)) {
    const town = state.settlements[b.site];
    if (b.status === 'burning') {
      if (state.tick % 5 === 0) {
        const buckets = town.water > 0;
        if (buckets) town.water = Math.max(0, town.water - 2);
        b.condition = Math.max(25, b.condition - (buckets ? 3 : 5));
      }
      if (state.tick >= b.endTick) {
        b.status = 'damaged';
        const cause = state.facts.find(f => f.id === b.fact);
        if (cause) cause.status = 'resolved';
        fact(state, 'fire_extinguished', b.site, `The bucket line extinguished the fire in ${catalog.byId[b.site].name}. A scorched home awaits repair (${b.condition}% condition).`,
          { causeIds: [b.fact], building: b.id, changes: { condition: b.condition } });
      }
    } else if (b.status === 'damaged' && state.tick >= b.repairAt) beginRepair(state, catalog, b);
    else if (b.status === 'repairing' && state.tick >= b.repairAt) {
      b.condition = 100; b.status = 'repaired';
      const repair = state.facts.find(f => f.id === b.repairFact);
      if (repair) repair.status = 'resolved';
      fact(state, 'repair_completed', b.site, `The scorched home in ${catalog.byId[b.site].name} has a sound roof again.`,
        { causeIds: [b.repairFact], building: b.id, changes: { condition: 100 } });
    }
  }
  if (state.tick === 90 || state.tick % 4200 === 90) {
    const eligible = catalog.places.filter(p => p.culture === 'human' && p.buildings.some(b => b.combustible));
    const p = state.tick === 90 ? catalog.byId.highmoor : eligible[Math.floor(randomAt(state.seed, 'fire', 'place', state.tick) * eligible.length)];
    const homes = p?.buildings.filter(b => b.combustible) || [];
    if (homes.length) {
      const b = homes[Math.floor(randomAt(state.seed, 'fire', p.id, state.tick) * homes.length)];
      startFire(state, catalog, p.id, b.id);
    }
  }
}
