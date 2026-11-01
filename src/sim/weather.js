// The same authored storm tracks drive rendered rain and incident eligibility.
import { latLonToDir, PLANET_RADIUS } from '../core/sphere.js';

export const STORMS = [
  { lat: 38, lon: -52, dlon: 0.0035, dlat: 0.0006, period: 2600, phase: 0.1 },
  { lat: 12, lon: -95, dlon: -0.004, dlat: 0.0004, period: 3100, phase: 0.55 },
  { lat: -35, lon: 60, dlon: 0.003, dlat: -0.0005, period: 2300, phase: 0.3 },
  { lat: 50, lon: 140, dlon: 0.0038, dlat: 0.0005, period: 2800, phase: 0.8 },
];
export function stormAt(k, seconds) {
  const s = STORMS[k], cycle = (seconds / s.period + s.phase) % 1;
  const life = Math.max(0, Math.sin(cycle * Math.PI * 2 - 0.3));
  const intensity = Math.min(1, Math.pow(life, 0.6) * 1.15);
  const lat = s.lat + 8 * Math.sin(seconds * s.dlat * 0.5 + k);
  const lon = s.lon + seconds * s.dlon;
  return { dir: latLonToDir(lat, ((lon + 180) % 360 + 360) % 360 - 180), intensity };
}
export function precipitation(place, seconds) {
  const d = latLonToDir(place.lat || 0, place.lon);
  return Math.max(...STORMS.map((_, k) => {
    const s = stormAt(k, seconds);
    const distance = Math.hypot(...d.map((v, i) => v - s.dir[i])) * PLANET_RADIUS;
    const t = Math.max(0, Math.min(1, (distance - 6) / 16));
    return s.intensity * (1 - t * t * (3 - 2 * t));
  }));
}
