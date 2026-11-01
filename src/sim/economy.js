import { GOODS, SLICE, STOCK_LIMIT } from './state.js';
import { fact } from './knowledge.js';

export function produce(state, town, good, amount) {
  const n = Math.max(0, Math.min(amount, STOCK_LIMIT - town.stocks[good]));
  town.stocks[good] += n; state.ledger.produced[good] += n;
  return n;
}
export function consume(state, town, good, amount) {
  const n = Math.min(amount, town.stocks[good]);
  town.stocks[good] -= n; state.ledger.consumed[good] += n;
  return n;
}
function recipe(state, town, input, output, n) {
  n = Math.min(n, town.stocks[input], STOCK_LIMIT - town.stocks[output]);
  consume(state, town, input, n); produce(state, town, output, n);
}

export function economyStep(state, catalog) {
  for (const p of catalog.places) {
    const town = state.settlements[p.id];
    town.water = Math.min(100, town.water + 3);
    // Outside the pilot chain, local subsistence is deliberately balanced.
    if (!SLICE.includes(p.id) || p.culture === 'undead') continue;
    if (p.id === 'millbrook') produce(state, town, 'grain', 12);
    if (p.id === 'brightwater') recipe(state, town, 'grain', 'flour', 8);
    if (p.id === 'highmoor') recipe(state, town, 'flour', 'bread', 6);
    else produce(state, town, 'bread', 3);
    const demand = p.id === 'highmoor' ? 4 : 3;
    // River fish are the bounded recovery path while bread imports are late.
    produce(state, town, 'fish', 4);
    const bread = consume(state, town, 'bread', demand);
    const fish = consume(state, town, 'fish', demand - bread);
    town.unmetMeals += demand - bread - fish;
    const shortage = town.stocks.bread < 8;
    if (shortage !== town.shortage) {
      const f = fact(state, shortage ? 'shortage' : 'supply_recovered', p.id,
        shortage ? `${p.name}'s bread reserve is low; households substitute river fish while the market seeks flour.` : `${p.name}'s bakers have restored the bread reserve.`,
        { causeIds: town.shortageFact ? [town.shortageFact] : [], changes: { bread: town.stocks.bread, flour: town.stocks.flour } });
      town.shortageFact = shortage ? f.id : null;
      town.shortage = shortage;
    }
    if (state.tick % 420 === 0) {
      produce(state, town, 'timber', 4); produce(state, town, 'tools', 1); produce(state, town, 'coin', 12);
    }
  }
}

export function materialBalance(state) {
  return Object.fromEntries(GOODS.map(g => {
    const stored = Object.values(state.settlements).reduce((n, t) => n + t.stocks[g], 0);
    const cargo = state.trips.filter(t => t.status === 'travelling').reduce((n, t) => n + (t.cargo[g] || 0), 0);
    return [g, state.ledger.initial[g] + state.ledger.produced[g] - state.ledger.consumed[g] - state.ledger.lost[g] - stored - cargo];
  }));
}
