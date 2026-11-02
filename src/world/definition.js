// One path from authored data to the final world definition, shared by the app, tests and tools:
// terrain and roads, settlement layouts, street flattening, then sea routes validated against the
// final terrain (finding F05).
import { buildWorld } from './build.js';
import { layoutSettlements, streetSegments } from './settlements.js';
import { buildSeaNetwork } from './sealanes.js';
import { SEA_LANES } from './atlas.js';
import '../models/human.js';
import '../models/cultures.js';

export function buildWorldDefinition(onProgress = () => {}) {
  const world = buildWorld(onProgress);
  onProgress(0.82, 'Founding the towns');
  const t0 = performance.now();
  const sites = layoutSettlements(world);
  world.addSegments(streetSegments(sites, world.field));
  world.layoutMs = performance.now() - t0;
  onProgress(0.84, 'Charting safe waters');
  const t1 = performance.now();
  const sea = buildSeaNetwork(world, sites, SEA_LANES);
  world.lanes = sea.routes.filter(r => r.valid && r.dirs.length > 1);
  world.seaRoutes = sea.seaRoutes;
  world.harbors = sea.harbors;
  world.seaReport = sea.routes.map(r => ({ id: r.id, kind: r.kind, valid: r.valid, samples: r.dirs.length, shallowest: r.shallowest ?? null,
    repaired: r.repaired ?? 0, from: r.from ?? null, to: r.to ?? null, supernatural: !!r.supernatural, note: r.note || r.reason || null }));
  world.seaMs = performance.now() - t1;
  return { world, sites };
}
