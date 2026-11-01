// Layout signatures of earlier save schemas, kept so old saves can prove which world they belong to.
import { hashString } from '../core/noise.js';

// The schema 1 layout signature, computed exactly as that release did, so an old save can prove
// it belongs to this authored world.
export function signatureV1(sites, roads) {
  const places = sites.map(site => ({
    id: site.s.id, name: site.s.name, culture: site.s.culture, kind: site.s.kind, lat: site.s.lat, lon: site.s.lon,
    plaza: { x: site.plaza[0], y: site.plaza[1] },
    buildings: site.doors.map(d => ({ id: d.item.id, model: d.item.model, kind: d.kind, x: d.x, y: d.y, combustible: /^(house|cottage|farmhouse)/.test(d.item.model) })),
    work: site.work.map(w => ({ kind: w.kind, x: w.x, y: w.y })),
  }));
  const edges = roads.filter(r => places.some(s => s.id === r.a) && places.some(s => s.id === r.b)).map(r => {
    let length = 0;
    for (let i = 1; i < r.dirs.length; i++) {
      const a = r.dirs[i - 1], b = r.dirs[i];
      length += Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 100;
    }
    return { id: `road:${r.a}:${r.b}`, a: r.a, b: r.b, duration: Math.max(60, Math.ceil(length / 0.07)) };
  });
  return String(hashString(JSON.stringify({ places, edges })));
}
