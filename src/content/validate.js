// Content validation: each error names the definition and field at fault.
import { GOODS, validateGoods } from './goods.js';
import { RECIPES, PROJECTS, validateRecipes } from './recipes.js';
import { OCCUPATIONS, validateOccupations } from './occupations.js';
import { SCENARIO, validateScenario } from './scenario.js';
import { CALENDAR, validateCalendar } from './calendar.js';
import { MODELS } from '../models/registry.js';

export function validateAll({ placeIds = null, models = MODELS } = {}) {
  const errors = [
    ...validateCalendar(CALENDAR), ...validateGoods(GOODS), ...validateRecipes(GOODS, RECIPES, PROJECTS),
    ...validateOccupations(RECIPES, OCCUPATIONS), ...validateScenario(GOODS, OCCUPATIONS, SCENARIO, placeIds),
  ];
  // Every model a building can be switched to must exist.
  if (models.size) for (const [id, p] of Object.entries(PROJECTS)) {
    for (const [i, s] of p.stages.entries()) if (s.model && !models.has(s.model)) errors.push(`projects.${id}.stages.${i}.model ${s.model} is not a registered model`);
    if (p.complete && !models.has(p.complete)) errors.push(`projects.${id}.complete ${p.complete} is not a registered model`);
  }
  return errors;
}
