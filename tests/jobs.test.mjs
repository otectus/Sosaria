// Jobs and needs: missing inputs give a visible reason; interrupted work keeps its progress;
// a replacement worker can take over; work resumes when supply returns; no deadlock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { held, transfer, available } from '../src/sim/inventory.js';
import { interrupt } from '../src/sim/residents.js';
import { abandonStaleJob } from '../src/sim/production.js';
import { world, fresh, advance, until, balanced } from './helpers.mjs';

const { catalog } = world();
const bw = catalog.byId.brightwater;

test('a miller without grain is idle with an explanation, and resumes when grain returns', () => {
  const s = fresh();
  const stash = 'inv:test-stash';
  for (const inv of [...bw.stores.dry, ...bw.stores.reserve]) { const g = held(s, inv, 'grain') - (s.inventories[inv]?.reserved.grain || 0); if (g > 0) transfer(s, inv, stash, { grain: g }); }
  for (const inv of bw.stores.dry) { const f = available(s, inv, 'flour'); if (f > 0) transfer(s, inv, stash, { flour: f }); }
  const millers = Object.values(s.residents).filter(p => p.site === 'brightwater' && p.occupation === 'miller');
  assert.ok(until(s, st => millers.some(p => p.task?.why?.reason === 'no_input' && p.task.why.good === 'grain' || p.task?.why?.reason === 'calm'), 1440));
  transfer(s, stash, bw.stores.dry[0], { grain: held(s, stash, 'grain') });
  assert.ok(until(s, st => Object.values(st.jobs).some(j => j.site === 'brightwater' && j.recipe === 'mill'), 1440 * 2), 'milling resumes');
});

test('interrupted work keeps its progress and the same worker resumes it', () => {
  const s = fresh();
  assert.ok(until(s, st => Object.values(st.jobs).some(j => j.step === 'work' && j.recipe === 'fell' && st.residents[j.worker].task?.k === 'work' && st.tick > st.residents[j.worker].task.arr + 20), 1440));
  const job = Object.values(s.jobs).find(j => j.step === 'work' && j.recipe === 'fell' && s.residents[j.worker].task?.k === 'work' && s.tick > s.residents[j.worker].task.arr + 20);
  const p = s.residents[job.worker];
  interrupt(s, catalog, p);
  assert.ok(s.jobs[job.id].labor > 0, 'labor so far is credited');
  assert.equal(p.job, job.id);
  assert.ok(until(s, st => !st.jobs[job.id] || st.jobs[job.id].labor > job.labor, 1440));
});

test('a job abandoned for a day reopens and a replacement worker takes it over', () => {
  const s = fresh();
  assert.ok(until(s, st => Object.values(st.jobs).some(j => j.step === 'fetch' && j.fi === 0 && j.recipe === 'bake'), 1440));
  const job = Object.values(s.jobs).find(j => j.step === 'fetch' && j.fi === 0 && j.recipe === 'bake');
  const first = s.residents[job.worker];
  // The baker is called away (here: kept on a long errand elsewhere) and does not return.
  first.journey = 'shipment:none'; first.job = job.id; job.paused = s.tick;
  s.shipments['shipment:none'] = { id: 'shipment:none', status: 'travelling', route: [], from: first.site, to: first.site, carrier: first.id, kind: 'courier', travellers: [], news: [] };
  advance(s, 1440 + 60);
  delete s.shipments['shipment:none']; first.journey = null;
  // Recovery runs when the worker next decides; force that check here.
  abandonStaleJob(s, catalog, first);
  assert.equal(s.jobs[job.id]?.status, 'open');
  assert.ok(until(s, st => !st.jobs[job.id] || st.jobs[job.id].worker && st.jobs[job.id].worker !== first.id, 1440), 'another baker takes it');
});

test('no idle-worker deadlock: jobs, reservations and queues stay bounded over two weeks', () => {
  const s = fresh();
  advance(s, 1440 * 14);
  assert.ok(Object.keys(s.jobs).length < 400);
  const reserved = Object.values(s.inventories).reduce((n, inv) => n + Object.values(inv.reserved).reduce((a, b) => a + b, 0), 0);
  assert.ok(reserved < 5000, `reserved ${reserved}`);
  assert.ok(s.queue.length < Object.keys(s.residents).length * 3);
  assert.ok(balanced(s));
});
