// Jobs: reserved inputs, an anchor, travel, work, outputs, completion, interruption and recovery.
// A job runs as steps (fetch -> work -> deliver). Carried goods live in the worker's own inventory,
// so an interrupted delivery is never lost or duplicated.
import { RECIPES } from '../content/recipes.js';
import { OCCUPATIONS } from '../content/occupations.js';
import { GOODS } from '../content/goods.js';
import { allocate } from './ids.js';
import { poiNode } from './catalog.js';
import { worldDay, dateAt, TICKS_PER_DAY } from './clock.js';
import { weatherAt } from './weather.js';
import { available, reserve, release, transfer, consume, produce, held, inventory, total } from './inventory.js';
import { commit } from './history.js';
import { GROWTH_FULL, ensureBuilding } from './world-state.js';
import { workOnProject, projectTask, tryCompleteStage } from './buildings.js';

const CHUNK = 180, LOAD = 10, BASE_YIELD = 300, CARRY = 12;
export const carryOf = p => `inv:carry:${p.id}`;

export function efficiency(p) {
  let e = 70 + Math.round(p.skill * 0.6);
  if (p.traits.includes('diligent')) e += 8;
  if (p.health === 'hungry') e = Math.round(e * 0.8);
  if (p.health === 'weak') e = Math.round(e * 0.6);
  if (p.needs.rest < 2000) e = Math.round(e * 0.85);
  return Math.max(20, e);
}

export function createJob(state, spec) {
  const id = allocate(state, 'job');
  // fetches: [{ inv, poi, goods }] visited in order; each was reserved when the job was created.
  const job = { id, recipe: spec.recipe, site: spec.site, worker: spec.worker, status: 'active', steps: spec.steps, step: spec.steps[0],
    fetches: spec.fetches || [], fi: 0, inputs: spec.inputs || {}, dest: spec.dest || null, destPoi: spec.destPoi ?? null,
    workPoi: spec.workPoi ?? null, outputs: {}, labor: 0, need: spec.need ?? RECIPES[spec.recipe]?.labor ?? 60, field: spec.field || null,
    project: spec.project || null, building: spec.building || null, created: state.tick, paused: null };
  state.jobs[id] = job;
  if (job.field) state.fields[job.field].job = id;
  if (job.worker) state.residents[job.worker].job = id;
  return job;
}

function bindBuilding(state, catalog, job, building) {
  job.building = building;
  ensureBuilding(state, catalog, building).job = job.id;
}

export function closeJob(state, job, status) {
  job.status = status;
  const pr = state.projects[job.project];
  if (pr && job.recipe === 'materials' && pr.inbound) for (const f of job.fetches) for (const [g, n] of Object.entries(f.goods)) { pr.inbound[g] -= n; if (pr.inbound[g] <= 0) delete pr.inbound[g]; }
  if (pr && job.recipe === 'build') { pr.booked = Math.max(0, (pr.booked || 0) - job.need); pr.crew = Math.max(0, (pr.crew || 0) - 1); }
  if (job.field && state.fields[job.field]?.job === job.id) state.fields[job.field].job = null;
  if (job.building && state.buildings[job.building]?.job === job.id) state.buildings[job.building].job = null;
  const p = state.residents[job.worker];
  if (p?.job === job.id) p.job = null;
  const town = state.settlements[job.site];
  if (town.open.includes(job.id)) town.open.splice(town.open.indexOf(job.id), 1);
  delete state.jobs[job.id];
}

// Work credited for an interrupted step; the job stays with the worker to resume.
export function pauseJob(state, p, jobId, worked = 0) {
  const job = state.jobs[jobId];
  if (!job) return;
  if (worked > 0 && job.step === 'work') job.labor += Math.floor(worked * efficiency(p) / 100);
  job.paused = state.tick;
}

// Recovery: after a day away, carried goods go back to a store and the job reopens for others.
export function abandonStaleJob(state, catalog, p) {
  const job = state.jobs[p.job];
  if (!job) { p.job = null; return; }
  if (job.worker === p.id && job.paused !== null && state.tick - job.paused >= TICKS_PER_DAY) releaseJob(state, catalog, job, 'stale');
}

export function releaseJob(state, catalog, job, why) {
  const carry = `inv:carry:${job.worker}`;
  const goods = { ...state.inventories[carry]?.goods };
  const place = catalog.byId[job.site];
  // Nothing fetched yet: the job reopens, reservations intact, for a replacement worker.
  if (job.step === 'fetch' && job.fi === 0 && !Object.keys(goods).length && why === 'stale') {
    if (state.residents[job.worker]?.job === job.id) state.residents[job.worker].job = null;
    job.worker = null; job.paused = state.tick; job.status = 'open';
    state.settlements[job.site].open.push(job.id);
    return;
  }
  if (Object.keys(goods).length) {
    const back = job.step === 'deliver' && job.dest ? job.dest : job.fetches[0]?.inv || place.stores.dry[0];
    transfer(state, carry, back, goods);
    commit(state, 'goods_returned', job.site, { job: job.id, goods, to: back, why }, { actors: [job.worker], importance: 0 });
  }
  for (const f of job.fetches.slice(job.step === 'fetch' ? job.fi : job.fetches.length)) release(state, f.inv, f.goods);
  closeJob(state, job, 'cancelled');
}

// Open jobs nobody resumed within two days are cancelled, so reservations cannot pin stock forever.
export function expireOpenJobs(state, catalog) {
  for (const town of Object.values(state.settlements)) for (const id of [...town.open]) {
    const job = state.jobs[id];
    if (!job) { town.open.splice(town.open.indexOf(id), 1); continue; }
    if (state.tick - (job.paused ?? job.created) > 2 * TICKS_PER_DAY) releaseJob(state, catalog, job, 'expired');
  }
}

const task = (k, node, dur, job, why, pose, extra = {}) => ({ k, node, dur, job: job.id, why, pose, ...extra });

// The next task for a job's current step; or apply the finished step when mode is 'finish'.
export function continueJob(state, catalog, p, mode, job = state.jobs[p.task?.job]) {
  if (!job || job.worker !== p.id) return null;
  const place = catalog.byId[job.site];
  const r = RECIPES[job.recipe], carry = carryOf(p);
  if (mode === 'finish') {
    const t = p.task;
    if (!t || t.job !== job.id) return null;
    if (job.step === 'fetch' && t.k === 'fetch') {
      const f = job.fetches[job.fi];
      if (!transfer(state, f.inv, carry, f.goods, true)) { releaseJob(state, catalog, job, 'missing'); return null; }
      job.fi++;
      if (job.fi >= job.fetches.length) job.step = job.steps[job.steps.indexOf('fetch') + 1];
    } else if (job.step === 'work' && t.k === 'work') {
      job.labor += Math.floor((t.end - t.arr) * efficiency(p) / 100);
      if (job.project) { workOnProject(state, catalog, p, job); return null; }
      if (job.labor >= job.need) finishWork(state, catalog, p, job, place);
    } else if (job.step === 'deliver' && t.k === 'deliver') {
      const goods = { ...state.inventories[carry]?.goods };
      if (Object.keys(goods).length) transfer(state, carry, job.dest, goods);
      const pr = job.project && state.projects[job.project];
      if (pr) for (const [g, n] of Object.entries(goods)) pr.delivered[g] = (pr.delivered[g] || 0) + n;
      closeJob(state, job, 'done');
      if (pr) tryCompleteStage(state, catalog, pr, p);
    }
    job.paused = null;
    return null;
  }
  job.paused = null;
  if (job.step === 'fetch') { const f = job.fetches[job.fi]; return task('fetch', poiNode(place, f.poi), LOAD, job, { key: 'fetch', recipe: job.recipe, goods: f.goods }, ['walk', 'none']); }
  if (job.step === 'work') {
    const left = Math.max(1, Math.ceil((job.need - job.labor) * 100 / efficiency(p)));
    const occ = OCCUPATIONS[p.occupation];
    return task('work', poiNode(place, job.workPoi), Math.min(CHUNK, left), job, { key: 'work', recipe: job.recipe, field: job.field, project: job.project, done: job.labor, need: job.need },
      r?.pose || occ.pose, { inside: ['mill', 'bakery', 'smithy'].includes(r?.place) });
  }
  if (job.step === 'deliver') return task('deliver', poiNode(place, job.destPoi), LOAD, job, { key: 'deliver', recipe: job.recipe, goods: { ...state.inventories[carry]?.goods } }, ['carry', 'sack']);
  return null;
}

function nextStep(job) { const i = job.steps.indexOf(job.step); return job.steps[i + 1] || null; }

function finishWork(state, catalog, p, job, place) {
  const carry = carryOf(p), r = RECIPES[job.recipe], town = state.settlements[job.site];
  if (job.recipe === 'sow') {
    consume(state, carry, job.inputs, 'used');
    Object.assign(state.fields[job.field], { stage: 'growing', growth: 0, care: 0, days: 0, sown: state.tick });
  } else if (job.recipe === 'tend') {
    const f = state.fields[job.field]; f.tended = worldDay(state.tick);
  } else if (job.recipe === 'harvest') {
    const f = state.fields[job.field];
    const care = f.days ? Math.min(1, f.care / f.days) : 0.5;
    const fertility = place.profile?.fertility ?? 100;
    const grain = Math.max(10, Math.floor(BASE_YIELD * fertility / 100 * (60 + 40 * care) / 100));
    produce(state, carry, { grain });
    job.outputs = { grain };
    Object.assign(f, { stage: 'fallow', growth: 0, care: 0, days: 0, sown: null });
    commit(state, 'harvest', job.site, { field: f.id, grain, care: Math.round(care * 100) }, { actors: [p.id], importance: 0 });
  } else {
    if (Object.keys(job.inputs).length && !consume(state, carry, job.inputs, 'used')) { releaseJob(state, catalog, job, 'missing'); return; }
    let out = { ...r.outputs };
    if (r.resource === 'woodland') town.woodland = Math.max(0, town.woodland - r.draw);
    if (r.resource === 'fish') {
      const k = town.fishMax ? Math.max(0.25, town.fish / town.fishMax) : 0;
      out = { fish: Math.max(1, Math.floor(r.outputs.fish * k)) };
      town.fish = Math.max(0, town.fish - r.draw);
    }
    if (job.recipe === 'subsist' && dateAt(state.tick).season.id === 'winter') out = { provisions: Math.max(1, Math.floor(out.provisions * 0.6)) };
    produce(state, carry, out);
    job.outputs = out;
  }
  job.step = nextStep(job);
  if (!job.step) closeJob(state, job, 'done');
}

// ---- Work rules: which job (if any) this person takes now, and why not otherwise. ----

const blockedTask = (place, p, node, reason, extra = {}) => ({ k: 'idle', node, dur: 45, why: { key: 'blocked', reason, ...extra }, pose: ['idle', 'none'] });
const poiOfBuilding = (place, id) => place.byBuilding[id]?.poi;
const storePoi = (place, inv) => {
  if (inv.startsWith('inv:building:')) return poiOfBuilding(place, inv.slice(4));
  if (inv.startsWith('inv:yard:')) return place.poi.yard;
  return place.poi.market;
};
// Pick the store holding the most free stock of a good, in a stable order.
function bestStore(state, ids, goods) {
  let best = null, bn = -1;
  for (const id of ids) {
    const ok = Object.entries(goods).every(([g, n]) => available(state, id, g) >= n);
    const n = Object.keys(goods).reduce((s, g) => s + available(state, id, g), 0);
    if (ok && n > bn) { best = id; bn = n; }
  }
  return best;
}
const freeStock = (state, place, g) => [...place.stores.dry, ...place.stores.reserve, ...place.stores.food, ...place.stores.yard]
  .filter((v, i, a) => a.indexOf(v) === i).reduce((n, id) => n + available(state, id, g), 0);
export { freeStock, bestStore, storePoi };

// Reserve every input (possibly from several stores) and create the job, or return null.
function startRecipe(state, catalog, p, place, recipe, { workPoi, sources = [], dest, field = null, inputs = RECIPES[recipe].inputs, need, fetches = null }) {
  // Work is only planned where people can actually walk.
  if (workPoi === null || workPoi === undefined || !place.pois[workPoi]?.reachable) return null;
  if (!fetches) {
    fetches = [];
    if (Object.keys(inputs).length) {
      const at = bestStore(state, sources, inputs);
      if (!at) return null;
      fetches.push({ inv: at, poi: storePoi(place, at), goods: { ...inputs } });
    }
  }
  const done = [];
  for (const f of fetches) {
    if (!reserve(state, f.inv, f.goods)) { for (const d of done) release(state, d.inv, d.goods); return null; }
    done.push(f);
  }
  const r = RECIPES[recipe];
  const steps = [...(fetches.length ? ['fetch'] : []), 'work', ...(Object.keys(r.outputs).length || recipe === 'harvest' ? ['deliver'] : [])];
  const job = createJob(state, { recipe, site: place.id, worker: p.id, steps, fetches, inputs,
    dest, destPoi: dest ? storePoi(place, dest) : null, workPoi, field, need });
  return continueJob(state, catalog, p, 'next', job);
}

function openJobFor(state, p, place, recipes) {
  const town = state.settlements[place.id];
  const id = town.open.find(j => state.jobs[j] && recipes.includes(state.jobs[j].recipe));
  return id ? state.jobs[id] : null;
}

export function planWork(state, catalog, p, place) {
  const occ = OCCUPATIONS[p.occupation], town = state.settlements[place.id];
  if (place.economy !== 'detailed') return subsistenceWork(state, catalog, p, place, occ);
  // Reopened jobs are taken over by a replacement worker before anything new is started.
  const open = openJobFor(state, p, place, occ.recipes);
  if (open) {
    const town = state.settlements[place.id];
    town.open.splice(town.open.indexOf(open.id), 1);
    open.worker = p.id; open.status = 'active'; p.job = open.id;
    return continueJob(state, catalog, p, 'next', open);
  }
  const target = g => place.profile?.targets?.[g] ?? 0;
  switch (p.occupation) {
    case 'farmer': return fieldWork(state, catalog, p, place) || laborWork(state, catalog, p, place);
    case 'miller': {
      const mill = place.mills.find(id => { const b = ensureBuilding(state, catalog, id); return !state.jobs[b.job] && b.cond >= 40 && !b.incident; });
      if (!mill) return blockedTask(place, p, poiNode(place, poiOfBuilding(place, place.mills[0] ?? place.granaries[0]) ?? place.poi.plaza), place.mills.length ? 'mill_busy' : 'no_mill');
      const w = weatherAt(place, state.tick);
      if (w.wind < 15) return blockedTask(place, p, poiNode(place, poiOfBuilding(place, mill)), 'calm', { wind: w.wind });
      if (freeStock(state, place, 'flour') >= target('flour')) return blockedTask(place, p, poiNode(place, poiOfBuilding(place, mill)), 'enough', { good: 'flour' });
      const spec = startRecipe(state, catalog, p, place, 'mill', { workPoi: poiOfBuilding(place, mill), sources: [...place.stores.dry, ...place.stores.reserve], dest: place.stores.dry[0] });
      if (spec) { bindBuilding(state, catalog, state.jobs[spec.job], mill); return spec; }
      return blockedTask(place, p, poiNode(place, poiOfBuilding(place, mill)), 'no_input', { good: 'grain' });
    }
    case 'baker': {
      const bakery = place.bakeries.find(id => { const b = ensureBuilding(state, catalog, id); return !state.jobs[b.job] && b.cond >= 40 && !b.incident; });
      if (!bakery) return blockedTask(place, p, poiNode(place, place.poi.market), place.bakeries.length ? 'oven_busy' : 'no_bakery');
      if (total(state, place.stores.food, 'bread') >= target('bread')) return blockedTask(place, p, poiNode(place, poiOfBuilding(place, bakery)), 'enough', { good: 'bread' });
      const need = RECIPES.bake.inputs;
      const flourAt = bestStore(state, [...place.stores.dry, ...place.stores.reserve], { flour: need.flour });
      const yard = place.stores.yard[0];
      if (!flourAt || available(state, yard, 'firewood') < need.firewood) return blockedTask(place, p, poiNode(place, poiOfBuilding(place, bakery)), 'no_input', { good: !flourAt ? 'flour' : 'firewood' });
      const spec = startRecipe(state, catalog, p, place, 'bake', { workPoi: poiOfBuilding(place, bakery), dest: place.stores.food[0],
        fetches: [{ inv: flourAt, poi: storePoi(place, flourAt), goods: { flour: need.flour } }, { inv: yard, poi: storePoi(place, yard), goods: { firewood: need.firewood } }] });
      if (spec) { bindBuilding(state, catalog, state.jobs[spec.job], bakery); return spec; }
      return blockedTask(place, p, poiNode(place, poiOfBuilding(place, bakery)), 'no_input', { good: 'flour' });
    }
    case 'woodcutter': return woodWork(state, catalog, p, place) || laborWork(state, catalog, p, place);
    case 'fisher': {
      if (!place.docks.length || town.fish < town.fishMax / 5) return laborWork(state, catalog, p, place) || blockedTask(place, p, poiNode(place, place.poi.market), 'no_fish');
      if (total(state, place.stores.food, 'fish') >= target('fish') * 2) return laborWork(state, catalog, p, place);
      return startRecipe(state, catalog, p, place, 'fish', { workPoi: place.docks[p.appearance % place.docks.length], sources: [], dest: place.stores.food[0] });
    }
    case 'smith': {
      const forge = place.smithies[p.appearance % Math.max(1, place.smithies.length)];
      if (!forge) return null;
      if (total(state, place.stores.dry, 'tools') >= (target('tools') || 6)) return duty(place, p, poiOfBuilding(place, forge), 'repairs', ['hammer', 'hammer'], true);
      const ironAt = bestStore(state, place.stores.dry, { iron: 2 }), yard = place.stores.yard[0];
      const spec = ironAt && available(state, yard, 'firewood') >= 2 ? startRecipe(state, catalog, p, place, 'forge', { workPoi: poiOfBuilding(place, forge), dest: place.stores.dry[0],
        fetches: [{ inv: ironAt, poi: storePoi(place, ironAt), goods: { iron: 2 } }, { inv: yard, poi: storePoi(place, yard), goods: { firewood: 2 } }] }) : null;
      return spec || blockedTask(place, p, poiNode(place, poiOfBuilding(place, forge)), 'no_input', { good: !ironAt ? 'iron' : 'firewood' });
    }
    case 'builder': return projectTask(state, catalog, p, place) || laborWork(state, catalog, p, place);
    case 'storekeeper': return haulWork(state, catalog, p, place) || duty(place, p, poiOfBuilding(place, place.granaries[0] ?? place.barns[0]), 'keeping_stores', ['carry', 'sack']);
    case 'laborer': return laborWork(state, catalog, p, place);
    default: return dutyFor(state, catalog, p, place, occ);
  }
}

const duty = (place, p, poi, key, pose, inside = false) => poi === undefined || poi === null ? null :
  ({ k: 'duty', node: poiNode(place, poi), dur: 60 + (p.appearance % 40), why: { key: 'duty', duty: key }, pose, inside });

export function dutyFor(state, catalog, p, place, occ) {
  const pick = list => list.length ? poiOfBuilding(place, list[p.appearance % list.length]) : null;
  switch (p.occupation) {
    case 'guard': {
      // Guards alternate between posts and the market; on duty they shorten fire detection.
      const posts = place.guardposts.length ? place.guardposts : [];
      const at = (Math.floor(state.tick / 60) + p.appearance) % 2 && posts.length ? pick(posts) : place.poi.plaza;
      return duty(place, p, at, 'watch', occ.pose);
    }
    case 'merchant': return duty(place, p, place.stalls.length ? place.stalls[p.appearance % place.stalls.length] : place.poi.market, 'stall', occ.pose);
    case 'priest': return duty(place, p, pick(place.temples) ?? place.poi.plaza, 'service', occ.pose);
    case 'innkeeper': return duty(place, p, pick(place.taverns) ?? place.poi.plaza, 'tavern', occ.pose, true);
    case 'bard': return duty(place, p, pick(place.taverns) ?? place.poi.plaza, 'music', occ.pose);
    case 'steward': case 'noble': return duty(place, p, place.poi.hall, 'court', occ.pose);
    case 'elder': return duty(place, p, place.gathers.length ? place.gathers[p.appearance % place.gathers.length] : place.poi.plaza, 'counsel', occ.pose);
    default: return null;
  }
}

function subsistenceWork(state, catalog, p, place, occ) {
  if (!occ.subsists || p.species === 'undead') return dutyFor(state, catalog, p, place, occ) || (p.species === 'undead' ? duty(place, p, place.poi.plaza, 'vigil', ['pray', 'none']) : null);
  const commons = place.stores.dry[0];
  // Bounded: a commons holding a fortnight of food is full, and people turn to other tasks.
  if (held(state, commons, 'provisions') >= state.settlements[place.id].people * 14) return dutyFor(state, catalog, p, place, occ) || duty(place, p, place.poi.plaza, 'rest_day', ['talk', 'none']);
  const at = occ.place === 'field' && place.fields.length ? place.fields[p.appearance % place.fields.length] :
    occ.place === 'dock' && place.docks.length ? place.docks[p.appearance % place.docks.length] :
    occ.place === 'woodland' ? place.poi.woodland : occ.place === 'gather' && place.gathers.length ? place.gathers[p.appearance % place.gathers.length] :
    place.smithies.length && p.occupation === 'miner' ? poiOfBuilding(place, place.smithies[0]) : place.poi.woodland;
  return startRecipe(state, catalog, p, place, 'subsist', { workPoi: at, sources: [], dest: commons });
}

function fieldWork(state, catalog, p, place) {
  const day = worldDay(state.tick), season = dateAt(state.tick).season;
  const fields = place.fields.map((_, i) => state.fields[`field:${place.id}:${i}`]).filter(f => f && !f.job);
  // Each farmer prefers plots near the household farmstead; the order is stable.
  fields.sort((a, b) => (a.poi + p.appearance) % 7 - (b.poi + p.appearance) % 7 || (a.id < b.id ? -1 : 1));
  const ripe = fields.find(f => f.stage === 'ripe');
  if (ripe) return startRecipe(state, catalog, p, place, 'harvest', { workPoi: ripe.poi, sources: [], dest: place.stores.dry[0], field: ripe.id });
  // Sowing stops once the stores hold years of grain: a full granary does not need more fields.
  const plenty = freeStock(state, place, 'grain') >= (place.profile?.targets?.grain ?? 300) * 8;
  const fallow = season.sowing && !plenty ? fields.find(f => f.stage === 'fallow') : null;
  if (fallow) {
    const spec = startRecipe(state, catalog, p, place, 'sow', { workPoi: fallow.poi, sources: [...place.stores.dry, ...place.stores.reserve], dest: null, field: fallow.id });
    if (spec) return spec;
  }
  const weedy = fields.find(f => f.stage === 'growing' && f.tended !== day);
  if (weedy) return startRecipe(state, catalog, p, place, 'tend', { workPoi: weedy.poi, sources: [], dest: null, field: weedy.id });
  return null;
}

function woodWork(state, catalog, p, place) {
  const town = state.settlements[place.id], yard = place.stores.yard[0];
  const want = g => place.profile?.targets?.[g] ?? 20;
  if (town.woodland < Math.max(RECIPES.fell.draw, town.woodlandMax * 0.15)) return null;
  if (held(state, yard, 'firewood') >= want('firewood') * 2 && held(state, yard, 'timber') >= want('timber') * 2) return null;
  // A few axes at a time: output already on its way counts toward the yard's needs.
  if (Object.values(state.jobs).filter(j => j.site === place.id && j.recipe === 'fell').length >= 4) return null;
  return startRecipe(state, catalog, p, place, 'fell', { workPoi: place.poi.woodland, sources: [], dest: yard });
}

function haulWork(state, catalog, p, place) {
  const s = place.stores;
  if (!s.reserve.length || !s.dry.length) return null;
  for (const g of ['flour', 'grain']) {
    if (available(state, s.dry[0], g) >= (place.profile?.targets?.[g] ?? 0) / 2) continue;
    const n = Math.min(CARRY * 4, available(state, s.reserve[0], g));
    if (n < 10 || !reserve(state, s.reserve[0], { [g]: n })) continue;
    const job = createJob(state, { recipe: 'haul', site: place.id, worker: p.id, steps: ['fetch', 'deliver'], fetches: [{ inv: s.reserve[0], poi: storePoi(place, s.reserve[0]), goods: { [g]: n } }],
      inputs: { [g]: n }, dest: s.dry[0], destPoi: storePoi(place, s.dry[0]), need: 1 });
    return continueJob(state, catalog, p, 'next', job);
  }
  return null;
}

export function laborWork(state, catalog, p, place) {
  const project = projectTask(state, catalog, p, place);
  if (project) return project;
  if (place.fields.some((_, i) => state.fields[`field:${place.id}:${i}`]?.stage === 'ripe')) {
    const ripe = place.fields.map((_, i) => state.fields[`field:${place.id}:${i}`]).find(f => f.stage === 'ripe' && !f.job);
    if (ripe) return startRecipe(state, catalog, p, place, 'harvest', { workPoi: ripe.poi, sources: [], dest: place.stores.dry[0], field: ripe.id });
  }
  const wood = woodWork(state, catalog, p, place);
  if (wood) return wood;
  // In a food emergency, able hands forage at the woodland edge.
  if (state.settlements[place.id].policy !== 'normal' && state.settlements[place.id].woodland > 20) {
    return startRecipe(state, catalog, p, place, 'forage', { workPoi: place.poi.woodland, sources: [], dest: place.stores.food[0] });
  }
  return null;
}

export const recipeTitle = r => RECIPES[r]?.name || (r === 'haul' ? 'Haul stores' : r === 'build' ? 'Build' : r);
export const goodsText = goods => Object.entries(goods || {}).filter(([, n]) => n).map(([g, n]) => `${n} ${GOODS[g]?.name || g}`).join(', ');
export { inventory };
