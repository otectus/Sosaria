// Reproducible randomness for the simulation. Every stream keeps its state in the saved world,
// so a reloaded world continues the same sequence. Presentation code must never call these.
import { hashString } from '../core/noise.js';

export const DEFAULT_SEED = 'sosaria-living-1';
export const STREAMS = ['weather', 'economy', 'households', 'incidents', 'travel', 'people'];

// mulberry32 with its single 32-bit state exposed.
export function step32(a) {
  a = (a + 0x6D2B79F5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [a, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

export const streamSeed = (seed, stream) => hashString(`${seed}|stream|${stream}`);

export function initStreams(seed) {
  return Object.fromEntries(STREAMS.map(s => [s, streamSeed(seed, s)]));
}

// Draw from a named stream, creating it lazily (e.g. a stream per notable actor).
export function random(state, stream) {
  const current = state.rng[stream] ?? streamSeed(state.seed, stream);
  const [next, value] = step32(current);
  state.rng[stream] = next;
  return value;
}
export const randomInt = (state, stream, n) => Math.floor(random(state, stream) * n);

// Stateless draws for authored initial conditions (names, appearance). The same seed and key
// always produce the same value, so regenerating appearance cannot disturb accumulated history.
export function hashRandom(seed, ...keys) {
  return step32(hashString(`${seed}|${keys.join('|')}`))[1];
}
export const pickHashed = (list, seed, ...keys) => list[Math.floor(hashRandom(seed, ...keys) * list.length)];
