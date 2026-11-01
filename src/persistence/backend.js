// Storage backends for world saves. IndexedDB in the browser; an in-memory backend with the same
// contract for tests (it can simulate a full disk or an interrupted write). Promotion is atomic:
// the previous snapshot of a slot is kept until the new one has been committed.

export class StorageError extends Error { constructor(message, code) { super(message); this.code = code; } }

const req = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || new Error('Transaction aborted')); });
const mapError = e => e?.name === 'QuotaExceededError' ? new StorageError('Browser storage is full. Export this world to keep it, or delete old saves.', 'quota') :
  e instanceof StorageError ? e : new StorageError(`Browser storage failed: ${e?.message || e}`, 'storage');

export class IndexedDBBackend {
  static async open(name = 'sosaria', idb = globalThis.indexedDB) {
    if (!idb) throw new StorageError('Browser storage (IndexedDB) is unavailable. Export your world to keep it.', 'unavailable');
    const open = idb.open(name, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('slots')) db.createObjectStore('slots', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    try { return new IndexedDBBackend(await req(open)); } catch (e) { throw mapError(e); }
  }
  constructor(db) { this.db = db; }
  async get(key) {
    try { return await req(this.db.transaction('slots').objectStore('slots').get(key)); } catch (e) { throw mapError(e); }
  }
  async meta(key) {
    try { return (await req(this.db.transaction('meta').objectStore('meta').get(key)))?.meta || null; } catch (e) { throw mapError(e); }
  }
  async list() {
    try { return (await req(this.db.transaction('meta').objectStore('meta').getAll())).map(r => r.meta); } catch (e) { throw mapError(e); }
  }
  async promote(key, record) {
    try {
      // One transaction: rotate the current snapshot to ~previous, then write the new one.
      // Callbacks (not awaits) keep every request inside the same live transaction.
      const tx = this.db.transaction(['slots', 'meta'], 'readwrite');
      const slots = tx.objectStore('slots'), metas = tx.objectStore('meta');
      const read = slots.get(key);
      read.onsuccess = () => {
        const current = read.result;
        if (current) {
          slots.put({ ...current, key: `${key}~previous` });
          metas.put({ key: `${key}~previous`, meta: { ...current.meta, slot: `${key}~previous`, previousOf: key } });
        }
        slots.put({ ...record, key });
        metas.put({ key, meta: record.meta });
      };
      await done(tx);
    } catch (e) { throw mapError(e); }
  }
  async remove(key) {
    try {
      const tx = this.db.transaction(['slots', 'meta'], 'readwrite');
      for (const k of [key, `${key}~previous`]) { tx.objectStore('slots').delete(k); tx.objectStore('meta').delete(k); }
      await done(tx);
    } catch (e) { throw mapError(e); }
  }
}

export class MemoryBackend {
  constructor({ quota = Infinity, failAfterBytes = null } = {}) { this.slots = new Map(); this.quota = quota; this.failAfterBytes = failAfterBytes; }
  used() { let n = 0; for (const r of this.slots.values()) n += r.text.length; return n; }
  async get(key) { const r = this.slots.get(key); return r ? structuredClone(r) : undefined; }
  async meta(key) { return this.slots.get(key)?.meta || null; }
  async list() { return [...this.slots.values()].map(r => r.meta); }
  async promote(key, record) {
    const current = this.slots.get(key);
    const extra = record.text.length + (current ? current.text.length : 0) - (this.slots.get(`${key}~previous`)?.text.length || 0);
    if (this.used() + extra > this.quota) throw new StorageError('Browser storage is full. Export this world to keep it, or delete old saves.', 'quota');
    // Simulated crash mid-write: nothing is committed, exactly like an aborted transaction.
    if (this.failAfterBytes !== null && record.text.length > this.failAfterBytes) throw new StorageError('Browser storage failed: write interrupted', 'storage');
    if (current) this.slots.set(`${key}~previous`, { ...current, key: `${key}~previous`, meta: { ...current.meta, slot: `${key}~previous`, previousOf: key } });
    this.slots.set(key, structuredClone({ ...record, key }));
  }
  async remove(key) { this.slots.delete(key); this.slots.delete(`${key}~previous`); }
}
