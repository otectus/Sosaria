// Work that changes the world. Labor is in worker-minutes (ticks); a skilled worker is faster.
// Yields and byproducts are documented balance values: conservation means every unit is traced
// from a source through transformations to a sink, not that inputs equal outputs one-for-one.

export const RECIPES = {
  sow: { name: 'Sow a field', place: 'field', inputs: { grain: 8 }, outputs: {}, labor: 90, effect: 'sow', note: 'Eight measures of seed grain per plot.' },
  tend: { name: 'Tend a field', place: 'field', inputs: {}, outputs: {}, labor: 60, effect: 'tend', note: 'Weeding and watering; untended plots grow at half speed.' },
  harvest: { name: 'Harvest a field', place: 'field', inputs: {}, outputs: {}, labor: 240, effect: 'harvest', note: 'Yield follows fertility, season and care.' },
  mill: { name: 'Mill grain', place: 'mill', inputs: { grain: 40 }, outputs: { flour: 40 }, labor: 120, note: 'Bran is returned to the fields and not tracked.' },
  bake: { name: 'Bake bread', place: 'bakery', inputs: { flour: 40, firewood: 2 }, outputs: { bread: 60 }, labor: 150, note: 'Water and leaven add weight: 40 measures make 60 loaves.' },
  fell: { name: 'Fell and split wood', place: 'woodland', inputs: {}, outputs: { timber: 2, firewood: 4 }, labor: 180, resource: 'woodland', draw: 3 },
  fish: { name: 'Fish', place: 'dock', inputs: {}, outputs: { fish: 8 }, labor: 120, resource: 'fish', draw: 8 },
  forge: { name: 'Forge tools', place: 'smithy', inputs: { iron: 2, firewood: 2 }, outputs: { tools: 1 }, labor: 240 },
  subsist: { name: 'Subsistence work', place: 'work', inputs: {}, outputs: { provisions: 5 }, labor: 120, note: 'Hunting, foraging, herding and gardens outside the grain network.' },
  forage: { name: 'Forage', place: 'woodland', inputs: {}, outputs: { provisions: 2 }, labor: 120, resource: 'woodland', draw: 1, note: 'An emergency fallback that strains the woodland.' },
};

// Construction and repair stages. Materials are reserved, carried to the site, then consumed.
export const PROJECTS = {
  watchtower: {
    name: 'Watchtower', use: 'watchtower', complete: 'tower',
    stages: [
      { name: 'Foundations', model: 'construct0', materials: { stone: 16 }, labor: 600 },
      { name: 'Lower walls', model: 'construct1', materials: { stone: 20, timber: 6 }, labor: 900 },
      { name: 'Upper walls', model: 'construct2', materials: { stone: 20, timber: 8 }, labor: 900 },
      { name: 'Roof and lookout', model: 'construct3', materials: { timber: 14, tools: 1 }, labor: 720 },
    ],
    note: 'A finished tower improves fire detection and the safety of nearby roads.',
  },
  repair: {
    name: 'Repair', complete: null,
    // Scaled by damage at the time the project is planned.
    stages: [
      { name: 'Clear debris', materials: {}, labor: 240 },
      { name: 'Rebuild walls and floor', materials: { timber: 10, stone: 8 }, labor: 600 },
      { name: 'New roof', materials: { timber: 10, tools: 1 }, labor: 480 },
    ],
  },
};

export function validateRecipes(goods, recipes = RECIPES, projects = PROJECTS) {
  const errors = [];
  const qty = (where, list) => {
    for (const [g, n] of Object.entries(list || {})) {
      if (!goods[g]) errors.push(`${where} references unknown good ${g}`);
      if (!Number.isSafeInteger(n) || n <= 0) errors.push(`${where}.${g} must be a positive integer`);
    }
  };
  for (const [id, r] of Object.entries(recipes)) {
    qty(`recipes.${id}.inputs`, r.inputs); qty(`recipes.${id}.outputs`, r.outputs);
    if (!Number.isSafeInteger(r.labor) || r.labor <= 0) errors.push(`recipes.${id}.labor must be a positive integer`);
    if (!r.effect && !Object.keys(r.outputs).length) errors.push(`recipes.${id} produces nothing and has no effect`);
  }
  for (const [id, p] of Object.entries(projects)) {
    if (!p.stages?.length) errors.push(`projects.${id} has no stages`);
    p.stages.forEach((s, i) => {
      qty(`projects.${id}.stages.${i}.materials`, s.materials);
      if (!Number.isSafeInteger(s.labor) || s.labor <= 0) errors.push(`projects.${id}.stages.${i}.labor must be a positive integer`);
    });
  }
  return errors;
}
