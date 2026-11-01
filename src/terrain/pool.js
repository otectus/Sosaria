// A small pool of module workers that share one TerrainField, with a main-thread fallback
// (finding F12). Jobs have typed failures, a timeout, one retry, cancellation and a world
// revision: a result built for an obsolete revision is rejected as stale (finding F11).

export class JobError extends Error {
  constructor(code, message = code) { super(message); this.name = 'JobError'; this.code = code; }
}

export class WorkerPool {
  constructor(features, size, { timeout = 20000, createWorker = null } = {}) {
    this.features = features;
    this.workers = [];
    this.jobs = new Map();
    this.nextId = 1;
    this.load = [];
    this.fallback = null;
    this.fallbackPromise = null;
    this.revision = 0;
    this.timeout = timeout;
    this.failures = 0;
    this.disposed = false;
    const make = createWorker || (() => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
    const n = size || Math.max(2, Math.min(6, (globalThis.navigator?.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = make();
        w.onmessage = (ev) => this.onMessage(i, ev.data);
        w.onerror = (e) => { e?.preventDefault?.(); this.workerFailed(i, e?.message || 'worker error'); };
        w.postMessage({ type: 'init', features });
        this.workers.push(w);
        this.load.push(0);
      }
    } catch (e) {
      console.warn('terrain workers unavailable; using the main thread', e);
      this.useFallback();
    }
  }

  // Idempotent: concurrent failures share one fallback start.
  useFallback() {
    if (this.fallbackPromise) return this.fallbackPromise;
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.fallbackPromise = Promise.all([import('../world/field.js'), import('./chunkgen.js'), import('../world/scatter-gen.js')]).then(([{ TerrainField }, { buildChunk }, { buildScatterCell }]) => {
      let field = new TerrainField(this.features), rev = this.revision;
      this.fallback = (m) => {
        if (rev !== this.revision) { field = new TerrainField(this.features); rev = this.revision; }
        return m.type === 'chunk' ? buildChunk(field, m.face, m.level, m.ix, m.iy) : buildScatterCell(field, m.cell, m.G, m.layer);
      };
      // Re-run anything that was waiting on a worker.
      for (const [id, job] of this.jobs) this.runLocal(id, job);
    });
    return this.fallbackPromise;
  }

  workerFailed(i, message) {
    this.failures++;
    console.warn(`terrain worker ${i} failed (${message}); continuing on the main thread`);
    this.useFallback();
  }

  runLocal(id, job) {
    setTimeout(() => {
      if (!this.jobs.has(id) || !this.fallback) return;
      try { this.settle(id, this.fallback(job.msg), job.msg.rev); }
      catch (e) { this.fail(id, new JobError('failed', e.message)); }
    }, 0);
  }

  settle(id, data, rev) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    clearTimeout(job.timer);
    if (rev !== this.revision) job.reject(new JobError('stale', 'result built for an obsolete world revision'));
    else job.resolve(data);
  }

  fail(id, error) {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.delete(id);
    clearTimeout(job.timer);
    job.reject(error);
  }

  onMessage(i, m) {
    if (m.type === 'ready') return;
    const job = this.jobs.get(m.id);
    if (!job) return;
    this.load[i] = Math.max(0, this.load[i] - 1);
    this.settle(m.id, m.data, m.rev);
  }

  run(msg, { signal = null } = {}) {
    return new Promise((resolve, reject) => {
      if (this.disposed) { reject(new JobError('cancelled', 'pool disposed')); return; }
      const id = this.nextId++;
      msg = { ...msg, id, rev: this.revision };
      const job = { resolve, reject, msg, tries: 0, timer: null };
      this.jobs.set(id, job);
      if (signal) {
        if (signal.aborted) { this.fail(id, new JobError('cancelled')); return; }
        signal.addEventListener('abort', () => this.fail(id, new JobError('cancelled')), { once: true });
      }
      // A worker that never answers is retried once on the main thread, then reported.
      const arm = () => {
        job.timer = setTimeout(() => {
          if (!this.jobs.has(id)) return;
          if (job.tries++ < 1) { this.useFallback().then(() => this.runLocal(id, job)); arm(); }
          else this.fail(id, new JobError('timeout', 'terrain job timed out'));
        }, this.timeout);
      };
      arm();
      if (this.fallback) { this.runLocal(id, job); return; }
      if (!this.workers.length) return; // fallback pending; it re-runs queued jobs
      let best = 0;
      for (let k = 1; k < this.load.length; k++) if (this.load[k] < this.load[best]) best = k;
      this.load[best]++;
      this.workers[best].postMessage(msg);
    });
  }

  // The world changed: rebuild worker fields and reject anything built for the old revision.
  invalidate(features = this.features) {
    this.features = features;
    this.revision++;
    for (const w of this.workers) w.postMessage({ type: 'init', features, rev: this.revision });
  }

  dispose() {
    this.disposed = true;
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    for (const id of [...this.jobs.keys()]) this.fail(id, new JobError('cancelled', 'pool disposed'));
  }

  get busy() { return this.jobs.size; }
}
