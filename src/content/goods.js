// Goods are conserved integer quantities. `rations` is food value per unit; `perish` is the
// share lost to spoilage per day, in parts per thousand. `price` is the base civic price in pennies.

export const GOODS = {
  grain: { name: 'grain', unit: 'measure', storage: 'dry', rations: 1, perish: 0, price: 1, note: 'Eaten as porridge when bread runs short.' },
  flour: { name: 'flour', unit: 'measure', storage: 'dry', rations: 1, perish: 0, price: 2, note: 'Households bake flatbread at home when the bakery cannot keep up.' },
  bread: { name: 'bread', unit: 'loaf', storage: 'food', rations: 1, perish: 100, price: 3 },
  fish: { name: 'fish', unit: 'basket', storage: 'food', rations: 1, perish: 200, price: 3 },
  provisions: { name: 'provisions', unit: 'ration', storage: 'food', rations: 1, perish: 20, price: 3, note: 'Mixed local food from subsistence work: game, roots, cheese and gardens.' },
  timber: { name: 'timber', unit: 'log', storage: 'yard', rations: 0, perish: 0, price: 8 },
  firewood: { name: 'firewood', unit: 'bundle', storage: 'yard', rations: 0, perish: 0, price: 2 },
  stone: { name: 'stone', unit: 'block', storage: 'yard', rations: 0, perish: 0, price: 6 },
  iron: { name: 'iron', unit: 'bar', storage: 'dry', rations: 0, perish: 0, price: 15 },
  tools: { name: 'tools', unit: 'set', storage: 'dry', rations: 0, perish: 0, price: 60 },
  coin: { name: 'coin', unit: 'penny', storage: 'purse', rations: 0, perish: 0, price: 1, money: true },
};

export const GOOD_IDS = Object.keys(GOODS);
export const FOOD = GOOD_IDS.filter(g => GOODS[g].rations > 0);
// Households eat in this order; porridge from raw grain is the last resort.
export const MEAL_PREFERENCE = ['bread', 'fish', 'provisions', 'flour', 'grain'];
export const FLAMMABLE = ['grain', 'flour', 'bread', 'timber', 'firewood', 'provisions'];

export function validateGoods(goods = GOODS) {
  const errors = [];
  for (const [id, g] of Object.entries(goods)) {
    for (const key of ['rations', 'perish', 'price']) if (!Number.isSafeInteger(g[key]) || g[key] < 0) errors.push(`goods.${id}.${key} must be a non-negative integer`);
    if (!['dry', 'food', 'yard', 'purse'].includes(g.storage)) errors.push(`goods.${id}.storage is not a known storage class`);
    if (g.perish > 1000) errors.push(`goods.${id}.perish exceeds 1000 per mille`);
    if (!g.unit) errors.push(`goods.${id}.unit is missing`);
  }
  for (const id of MEAL_PREFERENCE) if (!goods[id]?.rations) errors.push(`MEAL_PREFERENCE.${id} is not a food`);
  return errors;
}
