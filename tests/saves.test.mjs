// Saves: staged, validated and atomically promoted snapshots; rotating autosaves; export/import;
// refusal of corrupt, truncated and future-schema files; full storage; interrupted writes; two tabs;
// and migration of the schema 1 format from the first living-world release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryBackend } from '../src/persistence/backend.js';
import { SaveService, AUTOSAVES } from '../src/persistence/saves.js';
import { serialize, validateState, exportText } from '../src/sim/snapshot.js';
import { loadText } from '../src/sim/migrate.js';
import { resolve } from '../src/sim/history.js';
import { world, fresh, advance, sha, cmd, granary, balanced, until } from './helpers.mjs';

const { catalog } = world();
const V1 = readFileSync(new URL('./fixtures/save-v1-default.json', import.meta.url), 'utf8');

test('save, load and the previous snapshot: promotion is atomic and keeps the last good copy', async () => {
  const svc = new SaveService(new MemoryBackend(), { tabId: 'a' });
  const s = fresh(); advance(s, 120);
  const m1 = await svc.save('manual-1', s, catalog, { name: 'First' });
  advance(s, 60);
  const m2 = await svc.save('manual-1', s, catalog);
  assert.equal(m2.revision, m1.revision + 1);
  const back = await svc.load('manual-1', catalog);
  assert.equal(sha(back.state), sha(s));
  const prev = await svc.backend.get('manual-1~previous');
  assert.equal(JSON.parse(prev.text).tick, 120, 'the previous snapshot is kept');
});

test('a corrupt latest snapshot falls back to the previous one without losing the world', async () => {
  const svc = new SaveService(new MemoryBackend());
  const s = fresh(); advance(s, 30);
  await svc.save('slot', s, catalog);
  advance(s, 30);
  await svc.save('slot', s, catalog);
  svc.backend.slots.get('slot').text = '{"schemaVersion":2,"truncated';
  const r = await svc.load('slot', catalog);
  assert.ok(r.recovered); assert.equal(r.state.tick, 30); assert.match(r.warning, /previous/);
});

test('autosaves rotate through three slots, replacing the oldest', async () => {
  const svc = new SaveService(new MemoryBackend());
  const s = fresh();
  const used = [];
  let now = 1000;
  const realNow = Date.now; Date.now = () => now++;
  try { for (let i = 0; i < 5; i++) { advance(s, 10); used.push((await svc.autosave(s, catalog)).slot); } } finally { Date.now = realNow; }
  assert.deepEqual(used.slice(0, 3).sort(), [...AUTOSAVES].sort());
  assert.equal(used[3], used[0]); assert.equal(used[4], used[1]);
});

test('import validates everything before the running world is touched', () => {
  const s = fresh(); advance(s, 200);
  const text = exportText(s);
  assert.equal(sha(loadText(text, catalog).state), sha(s), 'an export round-trips');
  for (const bad of ['{bad', text.slice(0, text.length / 2), '[]', JSON.stringify({ ...s, residents: { ...s.residents, 'person:highmoor:0': { ...s.residents['person:highmoor:0'], household: 'household:nowhere:1' } } }),
    JSON.stringify({ ...s, inventories: { ...s.inventories, 'inv:x': { goods: { grain: -5 }, reserved: {} } } }), JSON.stringify({ ...s, ledger: { ...s.ledger, produced: { ...s.ledger.produced, grain: 1 } } }),
    JSON.stringify({ ...s, tick: 'soon' }), JSON.stringify({ ...s, __proto__: { evil: 1 }, catalog: 'elsewhere' })]) {
    assert.throws(() => loadText(bad, catalog), /save|version|layout|readable|inconsistent/i);
  }
});

test('imported text cannot inject markup: names are data and the interface escapes them', async () => {
  const { escapeHTML, eventText } = await import('../src/ui/text.js');
  const s = fresh();
  s.residents['person:highmoor:0'].name = '<img src=x onerror=alert(1)>';
  const back = loadText(serialize(s), catalog).state;
  assert.equal(back.residents['person:highmoor:0'].name, '<img src=x onerror=alert(1)>');
  assert.ok(!escapeHTML(back.residents['person:highmoor:0'].name).includes('<'));
  const e = { id: 'event:1', t: 0, k: 'harvest', w: 'highmoor', a: ['person:highmoor:0'], c: [], d: { grain: 5 } };
  assert.ok(eventText({ state: back, catalog, resolve: id => resolve(back, id) }, e).includes('<img'), 'prose is plain text; escaping happens at render time');
});

test('a world from a newer version is refused and its slot is never overwritten', async () => {
  const svc = new SaveService(new MemoryBackend());
  const s = fresh();
  const future = JSON.stringify({ ...s, schemaVersion: 99 });
  await svc.backend.promote('slot', { key: 'slot', meta: { slot: 'slot', name: 'Future', schemaVersion: 99, revision: 1 }, text: future });
  await assert.rejects(svc.load('slot', catalog), e => e.code === 'future');
  await assert.rejects(svc.save('slot', s, catalog), e => e.code === 'future');
  assert.equal((await svc.backend.get('slot')).text, future);
});

test('full storage and an interrupted write fail clearly and leave the previous save intact', async () => {
  const s = fresh();
  const small = new SaveService(new MemoryBackend({ quota: 1000 }));
  await assert.rejects(small.save('slot', s, catalog), e => e.code === 'quota' && /full/.test(e.message));
  const flaky = new SaveService(new MemoryBackend());
  await flaky.save('slot', s, catalog);
  const good = (await flaky.backend.get('slot')).text;
  flaky.backend.failAfterBytes = 10;
  advance(s, 30);
  await assert.rejects(flaky.save('slot', s, catalog), e => e.code === 'storage');
  assert.equal((await flaky.backend.get('slot')).text, good, 'nothing was half-written');
});

test('two tabs: the second is read-only, and a revision change is a conflict, not silent loss', async () => {
  const backend = new MemoryBackend();
  const a = new SaveService(backend, { tabId: 'a' }), b = new SaveService(backend, { tabId: 'b' });
  const s = fresh();
  await a.save('shared', s, catalog);
  await b.load('shared', catalog);
  advance(s, 10);
  await a.save('shared', s, catalog);
  await assert.rejects(b.save('shared', s, catalog), e => e.code === 'conflict');
  const reader = new SaveService(backend, { readOnly: true });
  await assert.rejects(reader.save('other', s, catalog), e => e.code === 'locked');
});

test('saves mid-shipment, mid-fire and mid-build continue identically after reload', () => {
  const s = fresh();
  advance(s, 400);
  cmd(s, { type: 'ignite', building: granary('brightwater') });
  advance(s, 5);
  assert.ok(Object.values(s.incidents).some(x => x.status === 'burning'));
  assert.ok(until(s, st => Object.values(st.shipments).some(x => x.status === 'travelling'), 1440));
  assert.ok(Object.values(s.projects).length > 0);
  const back = loadText(serialize(s), catalog).state;
  advance(s, 1440); advance(back, 1440);
  assert.equal(sha(back), sha(s));
  assert.ok(balanced(back));
});

test('schema 1 saves migrate: history, the named cast, damage and time carry over; the original is untouched', async () => {
  const before = V1;
  const { state, migrated } = loadText(V1, catalog);
  assert.equal(migrated, 1);
  const v1 = JSON.parse(V1);
  assert.equal(state.tick, Math.round(v1.tick * 1440 / 420));
  for (const [id, r] of Object.entries(v1.residents)) assert.equal(state.residents[id].name, r.name);
  const damaged = Object.keys(v1.buildings)[0];
  assert.ok(state.buildings[damaged].cond < 100 && state.buildings[damaged].project, 'the scorched home has a repair project');
  assert.ok(state.events.some(e => e.k === 'migration'));
  assert.ok(state.events.some(e => e.k === 'legacy' && /fire/i.test(e.d.text)));
  validateState(state, catalog);
  assert.equal(V1, before);
  // The save service migrates a localStorage world once into its own slot and keeps the source.
  const storage = new Map([['sosaria-world-v1', V1]]);
  const svc = new SaveService(new MemoryBackend());
  const res = await svc.migrateLegacy({ getItem: k => storage.get(k) || null }, catalog);
  assert.equal(res.meta.slot, 'migrated-v1');
  assert.equal(storage.get('sosaria-world-v1'), V1);
  assert.equal(await svc.migrateLegacy({ getItem: k => storage.get(k) || null }, catalog), null, 'only once');
});
