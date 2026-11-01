// Persistent people: needs, a hierarchical decision order and explainable tasks. Priority runs
// immediate survival > urgent duties > ordinary needs > work > social obligations > discretion.
// A task has a destination, travel along the walkable graph, an activity and a reason.
import { OCCUPATIONS, SPECIES } from '../content/occupations.js';
import { localMinute, TICKS_PER_DAY, dateAt, worldDay } from './clock.js';
import { walkDistance, poiNode, SPEED } from './catalog.js';
import { schedule } from './schedule.js';
import { available, consume } from './inventory.js';
import { MEAL_PREFERENCE } from '../content/goods.js';
import { continueJob, planWork, pauseJob, abandonStaleJob } from './production.js';
import { fireRole, closureFor } from './incidents.js';
import { carrierTask, returnHome } from './travel.js';

export const NEED_MAX = 10000;
// Per-tick change in hundredths of a need point.
const RATE = { food: 4, rest: -6, sleep: 20, social: -3, socialize: 25, safety: 5, cold: -8, warm: 30 };
const H = h => Math.round(h * 60);

export function refreshNeeds(state, p, t = state.tick) {
  const dt = t - p.needsAt;
  if (dt <= 0) return p.needs;
  const n = p.needs, k = p.task?.k;
  const asleep = k === 'sleep' || k === 'shelter';
  if (SPECIES[p.species].eats) n.food = Math.max(0, n.food - dt * RATE.food);
  n.rest = Math.max(0, Math.min(NEED_MAX, n.rest + dt * (asleep ? RATE.sleep : RATE.rest)));
  n.social = Math.max(0, Math.min(NEED_MAX, n.social + dt * (k === 'social' || k === 'eat' ? RATE.socialize : RATE.social)));
  n.safety = Math.min(NEED_MAX, n.safety + dt * RATE.safety);
  const winter = dateAt(t).season.id === 'winter';
  const sheltered = p.task?.inside || asleep;
  n.warmth = Math.max(0, Math.min(NEED_MAX, n.warmth + dt * (winter && !sheltered ? RATE.cold : RATE.warm)));
  p.needsAt = t;
  return n;
}

const homeNode = (place, state, p) => {
  const h = state.households[p.household];
  const b = h?.home && !h.displaced ? place.byBuilding[h.home] : null;
  return b ? poiNode(place, b.poi) : null;
};

export function localTime(place, p, t) {
  const m = localMinute(t, place.offset);
  return SPECIES[p.species].nocturnal ? (m + 720) % TICKS_PER_DAY : m;
}
const inWindow = (m, [a, b]) => a <= b ? m >= a && m < b : m >= a || m < b;
const untilMinute = (m, target) => ((target - m) + TICKS_PER_DAY) % TICKS_PER_DAY || TICKS_PER_DAY;

// Where is this person now? Mid-walk positions resolve to the last graph node passed.
export function currentNode(catalog, p, t) {
  const task = p.task;
  if (!task || t >= task.arr || task.from === task.to) return task ? (t >= task.arr ? task.to : task.from) : p.at.node;
  const place = catalog.byId[p.at.site];
  const path = place.nav.route(task.from, task.to);
  if (!path) return task.from;
  const goal = place.nav.pathLength(path) * (t - task.dep) / Math.max(1, task.arr - task.dep);
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = place.nav.nodes[path[i - 1]], [bx, by] = place.nav.nodes[path[i]];
    walked += Math.hypot(bx - ax, by - ay);
    if (walked > goal) return path[i - 1];
  }
  return task.to;
}

// Begin a task: walk from where they are to the target node, then act for `dur` ticks.
export function startTask(state, catalog, p, spec) {
  const t = state.tick, place = catalog.byId[p.at.site];
  const from = p.at.node, to = spec.node ?? from;
  const closure = spec.ignoreClosures ? null : closureFor(state, catalog, place.id);
  const dist = walkDistance(place, from, to, closure?.key || '', closure?.blocked || null);
  if (!Number.isFinite(dist)) {
    // A failed route is a waiting state with a reason, never movement through walls.
    p.task = { k: 'wait', from, to: from, dep: t, arr: t, end: t + 30, job: spec.job || null, why: { key: 'unreachable', goal: spec.why }, pose: ['idle', 'none'], inside: false };
    if (spec.job) pauseJob(state, p, spec.job);
  } else {
    const travel = Math.ceil(dist / (spec.run ? SPEED.run : SPEED.walk));
    p.task = { k: spec.k, from, to, dep: t, arr: t + travel, end: t + travel + Math.max(1, spec.dur | 0), job: spec.job || null, why: spec.why, pose: spec.pose || null, inside: !!spec.inside };
  }
  p.at = { site: place.id, node: p.task.to };
  schedule(state, p.task.end, 'decide', p.id, null, p.token);
  return p.task;
}

// Stop what they are doing now (alarm, closure, journey) and decide again immediately.
export function interrupt(state, catalog, p, delay = 0) {
  if (p.journey) return;
  const t = state.tick, task = p.task;
  if (task) {
    refreshNeeds(state, p, t);
    p.at = { site: p.at.site, node: currentNode(catalog, p, t) };
    if (task.job && t > task.arr && task.k === 'work') pauseJob(state, p, task.job, t - task.arr);
    else if (task.job) pauseJob(state, p, task.job);
    p.task = { ...task, end: t, arr: Math.min(task.arr, t), to: p.at.node, interrupted: true };
  }
  p.token++;
  schedule(state, t + delay, 'decide', p.id, null, p.token);
}

export function remember(state, p, eventId, role) {
  if (!eventId || p.memories.some(m => m.e === eventId && m.r === role)) return;
  p.memories.push({ e: eventId, r: role, t: state.tick });
  if (p.memories.length > 8) p.memories.splice(0, p.memories.length - 8);
}
export function tie(p, other, kind, delta = 10) {
  if (!other || other === p.id) return;
  const t = p.ties[other] || (p.ties[other] = { kind, trust: 50 });
  t.kind = t.kind === 'household' ? t.kind : kind;
  t.trust = Math.max(0, Math.min(100, t.trust + delta));
  const keys = Object.keys(p.ties);
  if (keys.length > 6) {
    const weakest = keys.filter(k => p.ties[k].kind !== 'household').sort((a, b) => p.ties[a].trust - p.ties[b].trust || (a < b ? -1 : 1))[0];
    if (weakest) delete p.ties[weakest];
  }
}

function eatFromPantry(state, p) {
  const inv = `inv:${p.household}`;
  for (const g of MEAL_PREFERENCE) if (available(state, inv, g) > 0 && consume(state, inv, { [g]: 1 }, 'eaten')) return g;
  return null;
}

// The decision itself. Called from the queue when a task ends or an interruption fires.
export function decide(state, catalog, p) {
  if (p.journey) return;
  const t = state.tick, place = catalog.byId[p.at.site];
  refreshNeeds(state, p, t);
  if (p.task && !p.task.interrupted && t >= p.task.end && p.task.job) continueJob(state, catalog, p, 'finish');
  // Away from home with no errand left: take the next open route back.
  if (p.at.site !== p.site && !Object.values(state.shipments).some(s => s.carrier === p.id && s.status === 'loading') && returnHome(state, catalog, p)) return;
  const spec = choose(state, catalog, p, place) || { k: 'idle', node: p.at.node, dur: 30, why: { key: 'idle' }, pose: ['idle', 'none'] };
  startTask(state, catalog, p, spec);
}

function choose(state, catalog, p, place) {
  const t = state.tick, occ = OCCUPATIONS[p.occupation], m = localTime(place, p, t), n = p.needs;
  const home = homeNode(place, state, p);
  // 1-2. Immediate survival and urgent duties: emergencies in this settlement.
  const fire = fireRole(state, catalog, p, place);
  if (fire) return fire;
  const load = carrierTask(state, catalog, p, place);
  if (load) return load;
  abandonStaleJob(state, catalog, p);
  // Unfinished work comes first while the shift lasts (or when carrying goods).
  const job = state.jobs[p.job]?.worker === p.id && state.jobs[p.job].status === 'active' ? state.jobs[p.job] : null;
  const shift = inWindow(m, occ.hours) || p.traits.includes('diligent') && inWindow(m, [occ.hours[0], occ.hours[1] + 60]);
  if (job && (shift || job.step !== 'work')) { const next = continueJob(state, catalog, p, 'next', job); if (next) return next; }
  // 3. Ordinary needs.
  const child = p.age === 'child', bed = child ? [H(20.5), H(7)] : [H(22), H(6)];
  if (inWindow(m, bed) || n.rest < 1500) {
    const wake = child ? H(7) : H(6), dur = untilMinute(m, wake);
    if (home !== null) return { k: 'sleep', node: home, dur, inside: true, why: { key: 'sleep', displaced: false }, pose: ['sleep', 'none'] };
    const shelter = place.temples[0] || place.taverns[0];
    const node = shelter ? poiNode(place, place.byBuilding[shelter].poi) : poiNode(place, place.poi.plaza);
    return { k: 'shelter', node, dur, inside: !!shelter, why: { key: 'sleep', displaced: true }, pose: ['sleep', 'none'] };
  }
  const day = worldDay(t);
  const eats = SPECIES[p.species].eats;
  if (eats && p.ate !== day && (inWindow(m, [H(18), H(20.5)]) || n.food < 3500)) {
    p.ate = day;
    const g = eatFromPantry(state, p);
    if (g) {
      n.food = NEED_MAX; p.hungry = 0; if (p.health === 'hungry') p.health = 'well';
      return { k: 'eat', node: home ?? poiNode(place, place.poi.market), dur: 30, inside: home !== null, why: { key: 'meal', food: g }, pose: ['sit', 'none'] };
    }
    p.hungry++;
    if (p.hungry >= 2) p.health = p.hungry >= 4 ? 'weak' : 'hungry';
    return { k: 'idle', node: poiNode(place, place.poi.market), dur: 40, why: { key: 'no_food', policy: state.settlements[place.id].policy }, pose: ['idle', 'none'] };
  }
  if (dateAt(t).season.id === 'winter' && n.warmth < 3000 && home === null) {
    const shelter = place.temples[0] || place.taverns[0];
    if (shelter) return { k: 'shelter', node: poiNode(place, place.byBuilding[shelter].poi), dur: 90, inside: true, why: { key: 'cold' }, pose: ['sit', 'none'] };
  }
  // 4. Scheduled work.
  if (shift && p.age !== 'child') {
    const work = planWork(state, catalog, p, place);
    if (work) return work;
  }
  if (child && inWindow(m, occ.hours)) return { k: 'play', node: nearbyGather(place, p, t), dur: 45, why: { key: 'play' }, pose: ['play', 'none'] };
  // 5. Social obligations and company in the evening.
  if (inWindow(m, [H(17), H(22)]) && (n.social < 6000 || p.traits.includes('sociable'))) {
    const venue = place.taverns.length && p.age !== 'child' ? poiNode(place, place.byBuilding[place.taverns[0]].poi) : place.temples.length ? poiNode(place, place.byBuilding[place.temples[0]].poi) : nearbyGather(place, p, t);
    return { k: 'social', node: venue, dur: 60 + (p.appearance % 60), why: { key: 'social', need: Math.round(n.social / 100) }, pose: ['talk', 'none'] };
  }
  // 6. Discretion: an errand to the market or time at home.
  if (home !== null && (p.appearance + worldDay(t)) % 3 === 0) return { k: 'idle', node: home, dur: 60, inside: true, why: { key: 'home' }, pose: ['idle', 'none'] };
  return { k: 'errand', node: nearbyGather(place, p, t), dur: 30 + (p.appearance % 30), why: { key: 'errand' }, pose: ['talk', 'none'] };
}

function nearbyGather(place, p, t) {
  const spots = place.gathers.length ? place.gathers : [place.poi.plaza];
  return poiNode(place, spots[(p.appearance + Math.floor(t / 97)) % spots.length]);
}
