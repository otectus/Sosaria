// Building lifecycle (finding F06): planning, materials, construction stages, operation, damage
// and repair. A stage only advances when its materials have been carried to the site and its
// labor is done; the render adapter follows `model` and `stage`, never the other way round.
import { PROJECTS } from '../content/recipes.js';
import { allocate } from './ids.js';
import { poiNode } from './catalog.js';
import { available, reserve, consume, held, transfer } from './inventory.js';
import { commit } from './history.js';
import { ensureBuilding, createProject } from './world-state.js';
import { createJob, continueJob, storePoi, closeJob } from './production.js';
import { remember } from './residents.js';

const CARRY = 12, LABOR_CHUNK = 120;
export const FUNCTIONAL = 40, HABITABLE = 50;

export const functional = (state, id) => { const b = state.buildings[id]; return !b || b.cond >= FUNCTIONAL && !b.incident && b.stage !== 'construction' && b.stage !== 'ruined'; };

// Stores that can accept goods now: damaged or burning buildings are skipped.
export function usableStores(state, place, role) {
  const ids = place.stores[role] || [];
  return ids.filter(inv => !inv.startsWith('inv:building:') || functional(state, inv.slice(4)));
}

export const projectInv = pr => `inv:${pr.id}`;

function missing(state, pr) {
  const stage = pr.stages[pr.stage], out = {};
  const inbound = pr.inbound || {};
  for (const [g, n] of Object.entries(stage.materials)) {
    const need = n - (pr.delivered[g] || 0) - (inbound[g] || 0);
    if (need > 0) out[g] = need;
  }
  return out;
}

export function projectsAt(state, place) {
  // Civic repairs first, then homes, then new construction; stable by ID within a group.
  const rank = pr => pr.kind === 'repair' ? (['granary', 'mill', 'bakery', 'keep'].includes(state.buildings[pr.building]?.use) ? 0 : 1) : 2;
  return Object.values(state.projects).filter(pr => pr.site === place.id && pr.status !== 'complete').sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
}

// A builder or laborer takes the next useful piece of project work: carry materials, or build.
export function projectTask(state, catalog, p, place) {
  for (const pr of projectsAt(state, place)) {
    const b = state.buildings[pr.building];
    if (b?.incident) continue;
    const site = place.byBuilding[pr.building];
    const want = missing(state, pr);
    if (Object.keys(want).length) {
      const fetches = [];
      let room = CARRY;
      for (const [g, n] of Object.entries(want)) {
        if (room <= 0) break;
        const sources = [...place.stores.yard, ...place.stores.dry, ...place.stores.reserve].filter((v, i, a) => a.indexOf(v) === i);
        for (const inv of sources) {
          const k = Math.min(n, room, available(state, inv, g));
          if (k > 0) { fetches.push({ inv, poi: storePoi(place, inv), goods: { [g]: k } }); room -= k; break; }
        }
      }
      if (!fetches.length) {
        // Nothing to carry and nothing in stock: the project waits, visibly, with its reason.
        if (pr.status !== 'blocked') commit(state, 'project_blocked', place.id, { project: pr.id, kind: pr.kind, building: pr.building, missing: want }, { importance: 1, causes: [pr.cause, pr.event] });
        pr.status = 'blocked'; pr.blocked = { key: 'materials', missing: want };
        continue;
      }
      for (const f of fetches) if (!reserve(state, f.inv, f.goods)) return null;
      if (pr.status === 'blocked') { pr.status = 'active'; pr.blocked = null; commit(state, 'project_resumed', place.id, { project: pr.id, building: pr.building }, { importance: 0, causes: [pr.cause] }); }
      const job = createJob(state, { recipe: 'materials', site: place.id, worker: p.id, steps: ['fetch', 'deliver'], fetches, inputs: {},
        dest: projectInv(pr), destPoi: site.poi, project: pr.id, need: 1 });
      pr.inbound ||= {};
      for (const f of fetches) for (const [g, n] of Object.entries(f.goods)) pr.inbound[g] = (pr.inbound[g] || 0) + n;
      return continueJob(state, catalog, p, 'next', job);
    }
    const stage = pr.stages[pr.stage];
    // Labor is booked as jobs start, so a crowd cannot pile more work onto a stage than it needs.
    const booked = pr.booked || 0, crew = pr.crew || 0;
    if (pr.labor >= stage.labor) { tryCompleteStage(state, catalog, pr); continue; }
    if (pr.labor + booked >= stage.labor || crew >= 6) continue;
    pr.status = 'active'; pr.blocked = null;
    const need = Math.min(LABOR_CHUNK, stage.labor - pr.labor - booked);
    const job = createJob(state, { recipe: 'build', site: place.id, worker: p.id, steps: ['work'], workPoi: site.poi, project: pr.id, building: pr.building, need });
    pr.booked = booked + need; pr.crew = crew + 1;
    return continueJob(state, catalog, p, 'next', job);
  }
  return null;
}

// Called when a build step's work finishes: labor goes to the project, stages may complete.
export function workOnProject(state, catalog, p, job) {
  const pr = state.projects[job.project];
  const done = Math.min(job.labor, job.need);
  if (job.labor < job.need) return;
  closeJob(state, job, 'done');
  if (!pr) return;
  pr.labor += done;
  tryCompleteStage(state, catalog, pr, p);
}

export function tryCompleteStage(state, catalog, pr, worker = null) {
  const stage = pr.stages[pr.stage];
  if (pr.labor < stage.labor) return false;
  for (const [g, n] of Object.entries(stage.materials)) if ((pr.delivered[g] || 0) < n) return false;
  if (!consume(state, projectInv(pr), stage.materials, 'used')) return false;
  for (const g of Object.keys(stage.materials)) pr.delivered[g] -= stage.materials[g];
  const b = ensureBuilding(state, catalog, pr.building);
  const done = pr.stage === pr.stages.length - 1;
  const e = commit(state, done ? 'project_completed' : 'project_stage', pr.site, { project: pr.id, kind: pr.kind, building: pr.building, stage: stage.name, index: pr.stage, materials: stage.materials },
    { actors: worker ? [worker.id] : [], causes: [pr.cause, pr.event], importance: done ? 2 : 1 });
  pr.event = e.id;
  if (worker) remember(state, worker, e.id, 'builder');
  pr.labor = 0;
  if (done) {
    const def = PROJECTS[pr.kind];
    pr.status = 'complete'; pr.completed = state.tick;
    b.stage = 'complete'; b.project = null; b.cond = 100; b.event = e.id;
    if (def.complete) b.model = def.complete;
    if (def.use) b.use = def.use;
    // Leftover delivered materials return to the yard rather than vanishing.
    const left = Object.fromEntries(Object.entries(pr.delivered).filter(([, n]) => n > 0));
    if (Object.keys(left).length) transfer(state, projectInv(pr), catalog.byId[pr.site].stores.yard[0], left);
    delete state.projects[pr.id];
    delete state.inventories[projectInv(pr)];
    if (pr.kind === 'repair') for (const h of Object.values(state.households)) if (h.home === pr.building && h.displaced) { h.displaced = false; commit(state, 'household_rehoused', pr.site, { household: h.id, building: pr.building }, { causes: [e.id], importance: 1 }); }
  } else {
    pr.stage++;
    if (pr.stages[pr.stage].model) b.model = pr.stages[pr.stage].model;
    else if (pr.kind === 'repair') b.cond = Math.min(99, b.cond + Math.round((100 - b.cond) / (pr.stages.length - pr.stage + 1)));
  }
  return true;
}

export function damage(state, catalog, buildingId, points, cause) {
  const b = ensureBuilding(state, catalog, buildingId);
  b.cond = Math.max(0, b.cond - points);
  return b;
}

// After an incident, plan the repair; homes below habitable condition displace their household.
export function afterDamage(state, catalog, buildingId, cause) {
  const b = ensureBuilding(state, catalog, buildingId);
  if (b.cond >= 100 || b.project) return null;
  b.stage = b.cond <= 0 ? 'ruined' : 'damaged';
  if (b.cond < HABITABLE) for (const h of Object.values(state.households)) if (h.home === buildingId && !h.displaced) {
    h.displaced = true;
    commit(state, 'household_displaced', b.site, { household: h.id, building: buildingId, members: h.members.length }, { causes: [cause], importance: 2, actors: h.members.slice(0, 3) });
    for (const m of h.members) remember(state, state.residents[m], cause, 'displaced');
  }
  const pr = createProject(state, catalog, b.site, buildingId, 'repair', cause, 100 - b.cond);
  b.stage = 'damaged';
  const e = commit(state, 'repair_planned', b.site, { project: pr.id, building: buildingId, cond: b.cond, stages: pr.stages.map(s => ({ name: s.name, materials: s.materials, labor: s.labor })) }, { causes: [cause], importance: 1 });
  pr.event = e.id;
  return pr;
}

export { held, allocate };
