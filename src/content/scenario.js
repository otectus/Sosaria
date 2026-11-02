// The default scenario: the authored globe, with the Valdren grain network simulated in detail.
// Other settlements keep persistent people and a documented subsistence economy (see docs).

export const SCENARIO = {
  id: 'sosaria-default',
  name: 'The Valdren grain network',
  contentVersion: '0.2.0',
  generationVersion: 1,
  population: { capital: 150, city: 100, port: 70, town: 64, village: 34, hamlet: 14, castle: 24, fort: 18, hold: 48, mine: 18,
    enclave: 44, glade: 18, circle: 10, camp: 40, temple: 56, necropolis: 40, barrow: 8, monastery: 14, ruin: 0, stilts: 24, lighthouse: 8 },
  rules: { destructiveIncidents: true, ignition: 100, relief: true },
  // Food outlook thresholds in days: below `ration` the steward rations and asks for relief.
  policy: { ration: 8, emergency: 3 },
  detailed: ['millbrook', 'brightwater', 'highmoor', 'saltmere'],
  profiles: {
    millbrook: {
      role: 'Farming village; the breadbasket of the network.',
      fertility: 170, woodland: 900, fish: 0, wellYield: 6, bakeries: 0,
      occupations: { guard: 2, smith: 1, merchant: 2, farmer: 12, woodcutter: 2, priest: 1, innkeeper: 1, steward: 1, child: 5, elder: 3 },
      stores: { dry: 'barn', food: 'market', yard: 'yard' },
      stock: { dry: { grain: 1000, tools: 2 }, food: { provisions: 40 }, yard: { timber: 24, firewood: 40, stone: 8 }, treasury: { coin: 800 } },
      targets: { grain: 1200, firewood: 40, timber: 20 },
    },
    brightwater: {
      role: 'Mill town on wet river meadows; turns Millbrook grain into flour for the capital.',
      fertility: 35, woodland: 700, fish: 300, wellYield: 6, bakeries: 1,
      occupations: { guard: 6, smith: 1, merchant: 3, farmer: 10, miller: 3, baker: 2, storekeeper: 1, woodcutter: 2, builder: 2, priest: 1, innkeeper: 1, steward: 1, child: 8, elder: 5 },
      guests: [{ species: 'dwarf', occupation: 'smith' }],
      stores: { dry: 'granary', food: 'market', yard: 'yard' },
      stock: { dry: { grain: 600, flour: 420, iron: 8, tools: 3 }, food: { bread: 50 }, yard: { timber: 36, firewood: 50, stone: 24 }, treasury: { coin: 1200 } },
      targets: { grain: 600, flour: 500, bread: 90, firewood: 40, timber: 20 },
    },
    highmoor: {
      role: 'Capital; feeds its people from its granary and the flour of Brightwater.',
      fertility: 60, woodland: 500, fish: 0, wellYield: 10, bakeries: 3,
      occupations: { guard: 15, smith: 3, merchant: 4, farmer: 12, miller: 2, baker: 4, storekeeper: 2, woodcutter: 3, builder: 5, priest: 2, innkeeper: 2, steward: 1, noble: 3, bard: 1, child: 18, elder: 12 },
      guests: [{ species: 'dwarf', occupation: 'smith' }, { species: 'dwarf', occupation: 'builder' }, { species: 'elf', occupation: 'merchant' }, { species: 'beast', occupation: 'laborer' }, { species: 'elf', occupation: 'priest' }],
      stores: { dry: 'granary', reserve: 'keep', food: 'market', yard: 'yard' },
      stock: { dry: { grain: 800, flour: 80, iron: 40, tools: 6 }, reserve: { grain: 400, flour: 80 }, food: { bread: 120, fish: 20 }, yard: { timber: 30, firewood: 70, stone: 40 }, treasury: { coin: 2600 } },
      targets: { flour: 500, grain: 600, bread: 220, firewood: 60, timber: 24, stone: 30, fish: 40 },
      project: { tag: 'construct', kind: 'watchtower' },
    },
    saltmere: {
      role: 'Port; fishes, keeps a relief reserve and trades by sea.',
      fertility: 70, woodland: 600, fish: 900, wellYield: 8, bakeries: 1,
      occupations: { guard: 7, smith: 1, merchant: 3, farmer: 6, fisher: 6, baker: 2, storekeeper: 1, woodcutter: 2, builder: 2, priest: 1, innkeeper: 1, steward: 1, child: 8, elder: 6 },
      guests: [{ species: 'beast', occupation: 'fisher' }, { species: 'elf', occupation: 'merchant' }],
      stores: { dry: 'granary', food: 'market', yard: 'yard' },
      stock: { dry: { grain: 900, flour: 260, iron: 10, tools: 4 }, food: { fish: 90, bread: 40 }, yard: { timber: 60, firewood: 50, stone: 90 }, treasury: { coin: 1600 } },
      targets: { flour: 120, grain: 600, fish: 80, bread: 50, firewood: 40, timber: 30, stone: 40 },
    },
  },
  // Civic procurement: when the buyer's reserve falls below `below`, it orders `batch` from the seller.
  procurement: [
    { buyer: 'brightwater', seller: 'millbrook', good: 'grain', below: 900, batch: 360, open: 2 },
    { buyer: 'highmoor', seller: 'brightwater', good: 'flour', below: 700, batch: 300, open: 2 },
    // The capital also buys Millbrook grain for its own mills and for porridge; it travels the
    // real road through Brightwater.
    { buyer: 'highmoor', seller: 'millbrook', good: 'grain', below: 1400, batch: 400, open: 2 },
    { buyer: 'saltmere', seller: 'brightwater', good: 'flour', below: 160, batch: 120 },
    { buyer: 'highmoor', seller: 'saltmere', good: 'fish', below: 30, batch: 60 },
    { buyer: 'highmoor', seller: 'saltmere', good: 'stone', below: 20, batch: 40 },
    { buyer: 'highmoor', seller: 'saltmere', good: 'timber', below: 20, batch: 30 },
    { buyer: 'brightwater', seller: 'saltmere', good: 'timber', below: 12, batch: 20 },
    { buyer: 'saltmere', seller: 'scalegate', good: 'provisions', below: 30, batch: 40, mode: 'sea' },
  ],
  // Trust between neighbours, 0-100. At 65 or more relief is sent as a gift; otherwise it is sold.
  relations: { 'highmoor|saltmere': 72, 'highmoor|brightwater': 60, 'brightwater|millbrook': 75, 'brightwater|southreach': 55, 'saltmere|southreach': 58, 'highmoor|kingsinn': 55, 'highmoor|oakhollow': 52 },
  defaultTrust: 45,
  giftTrust: 65,
  subsistence: { stockDays: 8, treasury: 300, yard: { timber: 10, firewood: 20, stone: 10 } },
  lore: [
    { id: 'drifting-spire', where: 'highmoor', text: 'They say the Drifting Spire sinks a finger-width every winter and rises again by spring.' },
    { id: 'aurum-unlanded', where: 'highmoor', text: 'The monks at Hollowmere say Old Aurum has not landed in living memory.' },
    { id: 'whisper-bread', where: 'millbrook', text: 'Farmers leave bread at the Whispering Stones. It is always gone by morning.' },
  ],
};

export function validateScenario(goods, occupations, scenario = SCENARIO, placeIds = null) {
  const errors = [];
  for (const id of scenario.detailed) if (!scenario.profiles[id]) errors.push(`scenario.detailed.${id} has no profile`);
  for (const [id, p] of Object.entries(scenario.profiles)) {
    if (placeIds && !placeIds.has(id)) errors.push(`scenario.profiles.${id} is not a settlement in the world`);
    for (const o of Object.keys(p.occupations)) if (!occupations[o]) errors.push(`scenario.profiles.${id}.occupations.${o} is unknown`);
    for (const g of p.guests || []) if (!occupations[g.occupation]) errors.push(`scenario.profiles.${id}.guests has unknown occupation ${g.occupation}`);
    for (const [store, list] of Object.entries(p.stock)) for (const [g, n] of Object.entries(list)) {
      if (!goods[g]) errors.push(`scenario.profiles.${id}.stock.${store}.${g} is not a good`);
      if (!Number.isSafeInteger(n) || n < 0) errors.push(`scenario.profiles.${id}.stock.${store}.${g} must be a non-negative integer`);
    }
  }
  for (const [i, r] of scenario.procurement.entries()) {
    if (!goods[r.good]) errors.push(`scenario.procurement.${i}.good ${r.good} is unknown`);
    if (!scenario.profiles[r.buyer]) errors.push(`scenario.procurement.${i}.buyer ${r.buyer} has no profile`);
    if (placeIds && !placeIds.has(r.seller)) errors.push(`scenario.procurement.${i}.seller ${r.seller} is not a settlement`);
    if (r.mode && !['road', 'sea'].includes(r.mode)) errors.push(`scenario.procurement.${i}.mode must be road or sea`);
  }
  for (const k of Object.keys(scenario.relations)) if (k.split('|').length !== 2) errors.push(`scenario.relations.${k} must name two settlements`);
  const lore = new Set();
  for (const l of scenario.lore) { if (lore.has(l.id)) errors.push(`scenario.lore duplicates ${l.id}`); lore.add(l.id); }
  return errors;
}
