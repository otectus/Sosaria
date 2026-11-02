// Authoritative weather. The same authored storm tracks drive rendered clouds, rain, wind, fire
// behavior and sea passages. Storm motion keeps the original pacing in "world seconds".
import { latLonToDir, PLANET_RADIUS } from '../core/sphere.js';
import { REAL_SECONDS_PER_DAY, TICKS_PER_DAY, dateAt } from './clock.js';

export const STORMS = [
  { lat: 38, lon: -52, dlon: 0.0035, dlat: 0.0006, period: 2600, phase: 0.1 },
  { lat: 12, lon: -95, dlon: -0.004, dlat: 0.0004, period: 3100, phase: 0.55 },
  { lat: -35, lon: 60, dlon: 0.003, dlat: -0.0005, period: 2300, phase: 0.3 },
  { lat: 50, lon: 140, dlon: 0.0038, dlat: 0.0005, period: 2800, phase: 0.8 },
];
export const weatherSeconds = tick => tick * REAL_SECONDS_PER_DAY / TICKS_PER_DAY;

export function stormAt(k, seconds) {
  const s = STORMS[k], cycle = (seconds / s.period + s.phase) % 1;
  const life = Math.max(0, Math.sin(cycle * Math.PI * 2 - 0.3));
  const intensity = Math.min(1, Math.pow(life, 0.6) * 1.15);
  const lat = s.lat + 8 * Math.sin(seconds * s.dlat * 0.5 + k);
  const lon = s.lon + seconds * s.dlon;
  return { dir: latLonToDir(lat, ((lon + 180) % 360 + 360) % 360 - 180), intensity };
}

const stormInfluence = (d, s) => {
  const distance = Math.hypot(d[0] - s.dir[0], d[1] - s.dir[1], d[2] - s.dir[2]) * PLANET_RADIUS;
  const t = Math.max(0, Math.min(1, (distance - 6) / 16));
  return s.intensity * (1 - t * t * (3 - 2 * t));
};

export function precipitationAt(d, seconds) {
  let best = 0;
  for (let k = 0; k < STORMS.length; k++) best = Math.max(best, stormInfluence(d, stormAt(k, seconds)));
  return best;
}
export const precipitation = (place, seconds) => precipitationAt(latLonToDir(place.lat || 0, place.lon), seconds);

// Integer weather for decisions: rain and wind in percent at a place and tick.
export function weatherAt(place, tick) {
  const seconds = weatherSeconds(tick);
  const rain = Math.round(precipitation(place, seconds) * 100);
  const gust = Math.sin(2 * Math.PI * (tick / TICKS_PER_DAY * 0.7 + (place.lon + 180) / 97)) * 22;
  const wind = Math.max(0, Math.min(100, Math.round(32 + gust + rain * 0.45)));
  return { rain, wind };
}

const DRYING = { spring: 4, summer: 8, autumn: 3, winter: 1 };

// Daily water balance for a settlement: soil dryness and well recharge.
export function dailyWeather(state, place, town) {
  const w = weatherAt(place, state.tick);
  const season = dateAt(state.tick).season.id;
  const drought = (state.drought[place.id] || 0) > state.tick;
  const wet = Math.max(w.rain, weatherAt(place, state.tick - 720).rain);
  town.dryness = Math.max(0, Math.min(100, town.dryness + (wet > 30 ? -25 : DRYING[season] + (drought ? 12 : 0))));
  town.water.capacity = drought ? Math.floor(town.water.max / 2) : town.water.max;
  town.water.level = Math.min(town.water.level, town.water.capacity);
  return w;
}

// A sea passage is closed while a strong storm sits over any part of it.
export function passageClosed(dirs, tick, threshold = 0.75) {
  const seconds = weatherSeconds(tick);
  for (let k = 0; k < STORMS.length; k++) {
    const s = stormAt(k, seconds);
    if (s.intensity < threshold) continue;
    for (let i = 0; i < dirs.length; i += 8) if (stormInfluence(dirs[i], s) > threshold) return { storm: k, intensity: Math.round(s.intensity * 100) };
  }
  return null;
}
