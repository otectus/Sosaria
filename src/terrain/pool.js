// A small pool of module workers that share one TerrainField. Falls back to the main thread.

export class WorkerPool {
  constructor(features, size) {
    this.features = features;
    this.workers = [];
    this.jobs = new Map();
    this.nextId = 1;
    this.load = [];
    this.fallback = null;
    const n = size || Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (ev) => this.onMessage(i, ev.data);
        w.onerror = (e) => { console.warn('terrain worker failed, using main thread', e.message); this.useFallback(); };
        w.postMessage({ type: 'init', features });
        this.workers.push(w);
        this.load.push(0);
      }
    } catch (e) {
      console.warn('workers unavailable', e);
      this.useFallback();
    }
  }

  async useFallback() {
    if (this.fallback) return;
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    const [{ TerrainField }, { buildChunk }, { buildScatterCell }] = await Promise.all([
      import('../world/field.js'), import('./chunkgen.js'), import('../world/scatter-gen.js'),
    ]);
    const field = new TerrainField(this.features);
    this.fallback = (m) => m.type === 'chunk' ? buildChunk(field, m.face, m.level, m.ix, m.iy) : buildScatterCell(field, m.cell, m.G, m.layer);
    // Re-run anything that was waiting on a worker.
    for (const [id, job] of this.jobs) this.runLocal(id, job.msg);
  }

  runLocal(id, msg) {
    setTimeout(() => {
      const job = this.jobs.get(id);
      if (!job) return;
      this.jobs.delete(id);
      job.resolve(this.fallback(msg));
    }, 0);
  }

  onMessage(i, m) {
    if (m.type === 'ready') return;
    const job = this.jobs.get(m.id);
    if (!job) return;
    this.jobs.delete(m.id);
    this.load[i]--;
    job.resolve(m.data);
  }

  run(msg) {
    return new Promise((resolve) => {
      const id = this.nextId++;
      msg = { ...msg, id };
      this.jobs.set(id, { resolve, msg });
      if (this.fallback) { this.runLocal(id, msg); return; }
      if (!this.workers.length) return; // fallback pending; useFallback re-runs queued jobs
      let best = 0;
      for (let k = 1; k < this.load.length; k++) if (this.load[k] < this.load[best]) best = k;
      this.load[best]++;
      this.workers[best].postMessage(msg);
    });
  }

  get busy() { return this.jobs.size; }
}
