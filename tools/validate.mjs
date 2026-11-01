// Content and world validation: `npm run validate`. Exits non-zero with every error listed.
import { validateAll } from '../src/content/validate.js';
import { buildWorldDefinition } from '../src/world/definition.js';
import { catalogFromWorld } from '../src/sim/catalog.js';

const { world, sites } = buildWorldDefinition();
const catalog = catalogFromWorld(world, sites);
const errors = validateAll({ placeIds: new Set(catalog.places.map(p => p.id)) });
for (const r of world.seaReport) if (!r.valid && !r.supernatural) errors.push(`sea route ${r.id}: ${r.note || 'not navigable'}`);
for (const id of catalog.scenario.detailed) {
  const place = catalog.byId[id], d = place.nav.distances(place.pois[place.poi.plaza].node);
  for (const p of place.pois) if (!Number.isFinite(d[p.node])) errors.push(`${id}: ${p.key} is unreachable on foot`);
}
const required = [['highmoor', 'brightwater'], ['brightwater', 'millbrook'], ['highmoor', 'saltmere']];
for (const [a, b] of required) if (!catalog.edges.some(e => e.mode === 'road' && [e.a, e.b].includes(a) && [e.a, e.b].includes(b))) errors.push(`required road ${a}-${b} is missing`);
console.log(JSON.stringify({ places: catalog.places.length, roads: catalog.edges.filter(e => e.mode === 'road').length, seaRoutes: world.seaReport, errors }, null, 1));
if (errors.length) process.exit(1);
