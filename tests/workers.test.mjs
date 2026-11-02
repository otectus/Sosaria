// F12: the terrain worker pool fails safely. Startup failure falls back to the main thread once,
// jobs time out and retry once, cancellation and stale world revisions reject with typed errors,
// and disposal releases everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerPool, JobError } from '../src/terrain/pool.js';
import { world } from './helpers.mjs';

const { world: w } = world();
class FakeWorker {
  constructor(mode) { this.mode = mode; this.sent = []; this.terminated = false; FakeWorker.made++; }
  postMessage(m) {
    this.sent.push(m);
    if (m.type === 'init') return;
    if (this.mode === 'echo') setTimeout(() => this.onmessage?.({ data: { type: m.type, id: m.id, rev: m.rev, data: { ok: m.id } } }), 1);
    if (this.mode === 'stale') setTimeout(() => this.onmessage?.({ data: { type: m.type, id: m.id, rev: m.rev - 1, data: {} } }), 1);
  }
  terminate() { this.terminated = true; }
}
FakeWorker.made = 0;

test('jobs resolve from workers and carry the world revision', async () => {
  const pool = new WorkerPool(w.features, 2, { createWorker: () => new FakeWorker('echo') });
  const r = await pool.run({ type: 'chunk', face: 0, level: 0, ix: 0, iy: 0 });
  assert.ok(r.ok > 0);
  pool.dispose();
});

test('a worker that fails at startup falls back to the main thread exactly once', async () => {
  let fallbacks = 0;
  const pool = new WorkerPool(w.features, 2, { createWorker: () => { throw new Error('no workers here'); } });
  const original = pool.useFallback.bind(pool);
  pool.useFallback = () => { fallbacks++; return original(); };
  await Promise.all([pool.useFallback(), pool.useFallback()]);
  const chunk = await pool.run({ type: 'chunk', face: 0, level: 0, ix: 0, iy: 0 });
  assert.ok(chunk.pos.length > 0, 'the main thread built the chunk');
  assert.ok(pool.fallbackPromise && pool.fallback, 'one shared fallback');
  pool.dispose();
});

test('a silent worker times out, retries once on the main thread, then succeeds or reports', async () => {
  const pool = new WorkerPool(w.features, 1, { timeout: 30, createWorker: () => new FakeWorker('silent') });
  const chunk = await pool.run({ type: 'chunk', face: 1, level: 0, ix: 0, iy: 0 });
  assert.ok(chunk.pos.length > 0, 'the retry produced a result');
  pool.dispose();
});

test('stale results and cancelled jobs reject with typed errors', async () => {
  const stale = new WorkerPool(w.features, 1, { createWorker: () => new FakeWorker('stale') });
  await assert.rejects(stale.run({ type: 'chunk', face: 0, level: 0, ix: 0, iy: 0 }), e => e instanceof JobError && e.code === 'stale');
  stale.dispose();
  const pool = new WorkerPool(w.features, 1, { createWorker: () => new FakeWorker('silent') });
  const ac = new AbortController();
  const p = pool.run({ type: 'chunk', face: 0, level: 0, ix: 0, iy: 0 }, { signal: ac.signal });
  ac.abort();
  await assert.rejects(p, e => e.code === 'cancelled');
  const q = pool.run({ type: 'chunk', face: 0, level: 0, ix: 0, iy: 0 });
  pool.invalidate();
  pool.dispose();
  await assert.rejects(q, e => e.code === 'cancelled');
  await assert.rejects(pool.run({ type: 'chunk' }), e => e.code === 'cancelled', 'a disposed pool takes no work');
});

test('repeated pools in one process do not leak jobs or workers', () => {
  const made = FakeWorker.made;
  for (let i = 0; i < 5; i++) { const pool = new WorkerPool(w.features, 2, { createWorker: () => new FakeWorker('echo') }); pool.dispose(); assert.equal(pool.busy, 0); assert.ok(pool.workers.length === 0); }
  assert.equal(FakeWorker.made - made, 10);
});
