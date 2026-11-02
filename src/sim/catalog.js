// Immutable simulation inputs derived from the authored world: places, buildings, stores, points
// of interest, walkable graphs and the travel network. Nothing here is saved; it is rebuilt on load.
import { hashString } from '../core/noise.js';
import { arcDist } from '../core/sphere.js';
import { NavGraph } from '../world/navgraph.js';
import { SCENARIO } from '../content/scenario.js';
import { minuteOffset } from './clock.js';
import { signatureV1 } from './legacy.js';

export const CATALOG_VERSION = 2;
// Surface speeds in planet units per tick, matching the original on-screen pacing at 1x.
export const SPEED = { walk: 0.04, run: 0.1, wagon: 0.0204, rider: 0.041, ship: 0.0467, migrant: 0.0146 };

const USE = { home: 'home', farm: 'farmstead', barn: 'barn', mill: 'mill', temple: 'temple', tavern: 'tavern', smithy: 'smithy', castle: 'keep',
  guard: 'guardpost', gate: 'gate', construct: 'construction', mine: 'mine' };
const COMBUSTIBLE = /^(house|cottage|farmhouse|barn|granary|stable|tavern|windmill|watermill|tent|longhouse|ruin_house)/;

function useOf(item) {
  if (item.model === 'granary') return 'granary';
  if (item.model === 'stable') return 'stable';
  if (item.model === 'lighthouse') return 'lighthouse';
  return USE[item.role] || (item.role === 'work' ? 'workshop' : null);
}

function front(item, depth = 0.12) {
  return { x: item.x + Math.sin(item.th) * depth, y: item.y + Math.cos(item.th) * depth };
}

function placeFromSite(site, scenario) {
  const s = site.s;
  const detailed = scenario.detailed.includes(s.id);
  const profile = scenario.profiles[s.id] || null;
  const doorOf = new Map(site.doors.map(d => [d.item.id, d]));
  const buildings = [], pois = [];
  const poi = (key, kind, x, y, extra = {}) => { pois.push({ key, kind, x, y, ...extra }); return pois.length - 1; };
  for (const item of site.items) {
    const use = useOf(item);
    if (!use) continue;
    const door = doorOf.get(item.id);
    const at = door ? { x: door.x, y: door.y } : front(item);
    const b = { id: item.id, model: item.model, tag: item.tag, use, x: item.x, y: item.y, combustible: COMBUSTIBLE.test(item.model), poi: -1 };
    b.poi = poi(`door:${item.id}`, use, at.x, at.y, { building: item.id, box: item.box });
    buildings.push(b);
  }
  site.work.forEach((w, i) => poi(`work:${i}`, w.kind, w.x, w.y));
  const plaza = { x: site.plaza[0], y: site.plaza[1] };
  const plazaPoi = poi('plaza', 'plaza', plaza.x, plaza.y);
  // Woodland edge candidates around the town; the first one reachable on foot is used.
  const ang = (hashString(s.id + ':wood') % 6283) / 1000;
  const woodR = s.radius + 0.9;
  const woods = [0, 1, 2, 3, 4, 5].map(k => poi(`woodland:${k}`, 'woodland', Math.sin(ang + k * 1.047) * woodR, Math.cos(ang + k * 1.047) * woodR));
  const by = use => buildings.filter(b => b.use === use);
  const first = use => by(use)[0] || null;
  const yardB = first('stable') || first('smithy') || first('workshop');
  const yardPoi = yardB ? yardB.poi : plazaPoi;
  const hall = first('keep') || first('temple') || null;
  // Bakeries are the homes nearest the market in detailed towns.
  const bakeries = [];
  if (profile?.bakeries) {
    const homes = by('home').map(b => [b, Math.hypot(b.x - plaza.x, b.y - plaza.y)]).sort((a, b) => a[1] - b[1] || (a[0].id < b[0].id ? -1 : 1));
    for (const [b] of homes.slice(0, profile.bakeries)) { b.use = 'bakery'; bakeries.push(b.id); }
  }
  const nav = NavGraph.fromLayout({ streets: site.streets, plaza: site.plaza, boxes: site.boxes, pois });
  const kinds = k => nav.pois.map((p, i) => p.kind === k ? i : -1).filter(i => i >= 0);
  const place = {
    id: s.id, name: s.name, culture: s.culture, kind: s.kind, realm: s.realm || 'wild', lat: s.lat, lon: s.lon, radius: s.radius,
    coastal: !!s.coastal, offset: minuteOffset(s.lon), economy: detailed ? 'detailed' : 'subsistence', profile,
    plaza, buildings, byBuilding: Object.fromEntries(buildings.map(b => [b.id, b])), nav, pois: nav.pois,
    poi: { plaza: plazaPoi, woodland: woods.find(i => nav.pois[i].reachable) ?? plazaPoi, yard: yardPoi, hall: hall ? hall.poi : plazaPoi, market: plazaPoi },
    fields: kinds('field'), wells: kinds('well').concat(by('granary').length ? [] : []), docks: kinds('dock'),
    gathers: [...kinds('gather'), ...kinds('pray'), ...kinds('dance'), ...kinds('fire')],
    stalls: kinds('stall'), homes: by('home').concat(by('farmstead')).map(b => b.id), bakeries,
    mills: by('mill').map(b => b.id), smithies: by('smithy').map(b => b.id), temples: by('temple').map(b => b.id),
    taverns: by('tavern').map(b => b.id), guardposts: by('guardpost').concat(by('gate')).map(b => b.id),
    granaries: by('granary').map(b => b.id), barns: by('barn').map(b => b.id), keep: first('keep')?.id || null,
    construction: by('construction').map(b => b.id),
  };
  if (!place.wells.length) place.wells = [plazaPoi];
  return place;
}

// Stores per place: inventory IDs grouped by role. Subsistence towns share one commons.
export function storesOf(place) {
  const p = place.profile;
  if (place.economy !== 'detailed') return { dry: [`inv:commons:${place.id}`], food: [`inv:commons:${place.id}`], yard: [`inv:commons:${place.id}`], reserve: [], treasury: `inv:treasury:${place.id}` };
  const dry = p.stores.dry === 'barn' ? place.barns : place.granaries;
  return {
    dry: dry.map(id => `inv:${id}`), reserve: p.stores.reserve === 'keep' && place.keep ? [`inv:${place.keep}`] : [],
    food: [`inv:market:${place.id}`], yard: [`inv:yard:${place.id}`], treasury: `inv:treasury:${place.id}`,
  };
}

export function catalogFromWorld(world, sites, scenario = SCENARIO) {
  const places = sites.map(site => placeFromSite(site, scenario));
  for (const p of places) p.stores = storesOf(p);
  const byId = Object.fromEntries(places.map(p => [p.id, p]));
  const edges = [];
  const bridges = (world.bridges || []).map((b, i) => ({ id: `bridge:${i}`, road: b.road || null, river: b.river, at: b.at ?? 0.5 }));
  for (const r of world.roads) {
    let length = 0;
    for (let i = 1; i < r.dirs.length; i++) length += arcDist(r.dirs[i - 1], r.dirs[i]);
    const id = `road:${r.a}:${r.b}`;
    edges.push({ id, mode: 'road', a: r.a, b: r.b, length: Math.round(length * 1000) / 1000,
      ticks: Math.max(30, Math.ceil(length / SPEED.wagon)), bridges: bridges.filter(b => b.road === id).map(b => b.id) });
  }
  for (const lane of world.seaRoutes || []) {
    edges.push({ id: `sea:${lane.a}:${lane.b}`, mode: 'sea', a: lane.a, b: lane.b, length: Math.round(lane.length * 1000) / 1000,
      ticks: Math.max(60, Math.ceil(lane.length / SPEED.ship)), bridges: [], lane: lane.id, dirs: lane.dirs });
  }
  const catalog = makeCatalog(places, edges, bridges, scenario);
  catalog.legacy = { v1: signatureV1(sites, world.roads) };
  return catalog;
}

export function makeCatalog(places, edges, bridges = [], scenario = SCENARIO) {
  const byId = Object.fromEntries(places.map(p => [p.id, p]));
  for (const p of places) {
    p.distanceCache = new Map();
    if (!p.byBuilding) p.byBuilding = Object.fromEntries((p.buildings || []).map(b => [b.id, b]));
    if (!p.stores) p.stores = storesOf(p);
  }
  const nodes = [...new Set(edges.flatMap(e => [e.a, e.b]))].sort();
  const adjacency = Object.fromEntries(nodes.map(n => [n, edges.filter(e => e.a === n || e.b === n).map(e => e.id)]));
  const edgeById = Object.fromEntries(edges.map(e => [e.id, e]));
  const buildingSite = {};
  for (const p of places) for (const b of p.buildings) buildingSite[b.id] = p.id;
  const signature = String(hashString(JSON.stringify({
    v: CATALOG_VERSION, scenario: scenario.id, generation: scenario.generationVersion,
    places: places.map(p => [p.id, p.kind, p.culture, p.buildings.map(b => [b.id, b.use, Math.round(b.x * 1e4), Math.round(b.y * 1e4)]), p.pois.length, p.nav.nodes.length]),
    edges: edges.map(e => [e.id, e.ticks, e.bridges]),
  })));
  return { version: CATALOG_VERSION, scenario, places, byId, edges, edgeById, adjacency, nodes, bridges,
    bridgeById: Object.fromEntries(bridges.map(b => [b.id, b])), buildingSite, signature };
}

// Walking distance between two graph nodes in planet units (Infinity if unreachable). Rows are
// cached per closure set; `blockedKey` names the set so different closures never share a row.
export function walkDistance(place, fromNode, toNode, blockedKey = '', blocked = null) {
  if (fromNode === toNode) return 0;
  const key = `${blockedKey}|${fromNode}`;
  let row = place.distanceCache.get(key);
  if (!row) {
    row = place.nav.distances(fromNode, blocked);
    if (place.distanceCache.size > 3000) place.distanceCache.clear();
    place.distanceCache.set(key, row);
  }
  return row[toNode];
}
export const poiNode = (place, poi) => place.pois[poi].node;
