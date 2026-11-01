// World saves: manual slots, rotating autosaves, export/import, and safe recovery. A save is
// serialized, re-parsed and fully validated before promotion; the slot's previous snapshot stays
// until the new one commits. Future-schema saves are never overwritten. A tab that does not hold
// the world lock, or whose slot revision moved underneath it, refuses to write.
import { serialize, validateState, hashText, exportText, SaveError } from '../sim/snapshot.js';
import { loadText } from '../sim/migrate.js';
import { SCHEMA_VERSION } from '../sim/world-state.js';
import { stamp } from '../sim/clock.js';
import { StorageError } from './backend.js';

export const AUTOSAVES = ['auto-1', 'auto-2', 'auto-3'];
export const LEGACY_KEYS = ['sosaria-world-v1', 'sosaria-world-v1-previous'];

export class SaveService {
  constructor(backend, { tabId = 'tab', readOnly = false } = {}) {
    this.backend = backend; this.tabId = tabId; this.readOnly = readOnly; this.revisions = new Map();
  }

  async save(slot, state, catalog, { name = null, kind = 'manual' } = {}) {
    if (this.readOnly) throw new SaveError('This world is open in another tab, so this tab will not save. Export it to keep a copy.', 'locked');
    if (!/^[a-z0-9-]{1,40}$/.test(slot)) throw new SaveError('Save slot names use letters, digits and dashes.', 'invalid');
    const text = serialize(state);
    validateState(JSON.parse(text), catalog);
    const current = await this.backend.meta(slot);
    if (current?.schemaVersion > SCHEMA_VERSION) throw new SaveError('That slot holds a world from a newer version of Sosaria; it has been left untouched.', 'future');
    const known = this.revisions.get(slot);
    if (current && known !== undefined && current.revision !== known) throw new SaveError('Another tab saved this slot since it was loaded here. Save to a new slot to keep both.', 'conflict');
    const meta = {
      slot, name: String(name || current?.name || (kind === 'auto' ? 'Autosave' : 'Saved world')).slice(0, 60), kind, savedAt: Date.now(),
      tick: state.tick, date: stamp(state.tick), schemaVersion: state.schemaVersion, contentVersion: state.contentVersion, catalog: state.catalog,
      seed: state.seed, hash: hashText(text), bytes: text.length, revision: (current?.revision || 0) + 1, writer: this.tabId,
      altered: state.interventions.length > 0, branch: state.branch, migratedFrom: state.migratedFrom || null,
    };
    await this.backend.promote(slot, { key: slot, meta, text });
    this.revisions.set(slot, meta.revision);
    return meta;
  }

  // The oldest of three rotating autosave slots is replaced each time.
  async autosave(state, catalog) {
    const metas = await Promise.all(AUTOSAVES.map(s => this.backend.meta(s)));
    let slot = AUTOSAVES[metas.findIndex(m => !m)];
    if (!slot) slot = AUTOSAVES[metas.reduce((best, m, i) => m.savedAt < metas[best].savedAt ? i : best, 0)];
    this.revisions.delete(slot);
    return this.save(slot, state, catalog, { kind: 'auto', name: 'Autosave' });
  }

  async load(slot, catalog) {
    let firstError = null;
    for (const key of [slot, `${slot}~previous`]) {
      const record = await this.backend.get(key);
      if (!record) continue;
      try {
        const { state, migrated } = loadText(record.text, catalog);
        if (key === slot) this.revisions.set(slot, record.meta.revision);
        return { state, meta: record.meta, recovered: key !== slot, migrated, warning: key !== slot ? `The latest snapshot of this slot was unreadable (${firstError?.message}); the previous one was restored.` : '' };
      } catch (e) { firstError ||= e; if (e.code === 'future' || e.code === 'layout') break; }
    }
    if (firstError) throw firstError;
    throw new SaveError('That save slot is empty.', 'missing');
  }

  async list() {
    const metas = (await this.backend.list()).filter(Boolean);
    return metas.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0) || (a.slot < b.slot ? -1 : 1));
  }

  async remove(slot) {
    if (this.readOnly) throw new SaveError('This tab is read-only.', 'locked');
    await this.backend.remove(slot);
    this.revisions.delete(slot);
  }

  // Newest valid save: manual or automatic, whichever is latest; unreadable ones are skipped.
  async latest(catalog) {
    const warnings = [];
    for (const meta of await this.list()) {
      if (meta.previousOf) continue;
      try { const r = await this.load(meta.slot, catalog); return { ...r, warnings }; } catch (e) { warnings.push(`${meta.name}: ${e.message}`); }
    }
    return { state: null, warnings };
  }

  exportWorld(state, meta = {}) { return exportText(state, { exportedAt: Date.now(), ...meta }); }
  importWorld(text, catalog) { return loadText(text, catalog); }

  // A schema 1 world from localStorage is migrated once into its own slot; the original is kept.
  async migrateLegacy(storage, catalog) {
    if (!storage || await this.backend.meta('migrated-v1')) return null;
    for (const key of LEGACY_KEYS) {
      let text = null;
      try { text = storage.getItem(key); } catch { return null; }
      if (!text) continue;
      try {
        const { state } = loadText(text, catalog);
        const meta = await this.save('migrated-v1', state, catalog, { name: 'World from Sosaria 0.1 (migrated)' });
        return { state, meta, source: key };
      } catch (e) { if (e instanceof StorageError) throw e; }
    }
    return null;
  }
}

// One writer per world: the Web Locks API where available, otherwise a BroadcastChannel probe.
export async function acquireWorldLock(name = 'sosaria-world') {
  if (globalThis.navigator?.locks?.request) {
    return new Promise(resolve => {
      navigator.locks.request(name, { ifAvailable: true }, lock => {
        if (!lock) { resolve({ held: false }); return null; }
        return new Promise(release => resolve({ held: true, release }));
      }).catch(() => resolve({ held: true, release: () => {} }));
    });
  }
  if (globalThis.BroadcastChannel) {
    const channel = new BroadcastChannel(name);
    let other = false;
    channel.onmessage = e => { if (e.data === 'probe') channel.postMessage('here'); if (e.data === 'here') other = true; };
    channel.postMessage('probe');
    await new Promise(r => setTimeout(r, 150));
    return { held: !other, release: () => channel.close() };
  }
  return { held: true, release: () => {} };
}
