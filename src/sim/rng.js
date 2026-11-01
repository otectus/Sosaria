import { hashString, mulberry32 } from '../core/noise.js';

export const DEFAULT_SEED = 'sosaria-living-1';
export function randomAt(seed, system, entity, tick = 0) {
  return mulberry32(hashString(`${seed}|${system}|${entity}|${tick}`))();
}
