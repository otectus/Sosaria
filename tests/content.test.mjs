// Content definitions are validated; errors name the definition and field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAll } from '../src/content/validate.js';
import { validateGoods, GOODS } from '../src/content/goods.js';
import { validateRecipes, RECIPES, PROJECTS } from '../src/content/recipes.js';
import { validateScenario, SCENARIO } from '../src/content/scenario.js';
import { OCCUPATIONS } from '../src/content/occupations.js';
import '../src/models/human.js';
import '../src/models/cultures.js';
import { world } from './helpers.mjs';

test('the shipped content validates against the world and the model registry', () => {
  const { catalog } = world();
  assert.deepEqual(validateAll({ placeIds: new Set(catalog.places.map(p => p.id)) }), []);
});

test('invalid definitions are reported with their path', () => {
  assert.match(validateGoods({ ...GOODS, mud: { name: 'mud', unit: '', storage: 'swamp', rations: -1, perish: 0, price: 1 } }).join('\n'), /goods\.mud\.rations|goods\.mud\.storage|goods\.mud\.unit/);
  assert.match(validateRecipes(GOODS, { ...RECIPES, alchemy: { inputs: { lead: 1 }, outputs: {}, labor: 0 } }, PROJECTS).join('\n'), /recipes\.alchemy\.inputs references unknown good lead/);
  assert.match(validateScenario(GOODS, OCCUPATIONS, { ...SCENARIO, procurement: [{ buyer: 'nowhere', seller: 'highmoor', good: 'grain', below: 1, batch: 1 }] }, new Set(['highmoor'])).join('\n'), /procurement\.0\.buyer nowhere/);
  assert.match(validateAll({ models: new Map([['construct0', {}]]) }).join('\n'), /construct1 is not a registered model/);
});
