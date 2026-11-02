// F04: event IDs are allocated at commit time from a saved counter, never from a list length.
// References survive UI truncation, compaction into the archive, and save/load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { commit, resolve, compactHistory, causeChain, LIVE_LIMIT, ARCHIVE_LIMIT } from '../src/sim/history.js';
import { remember } from '../src/sim/residents.js';
import { serialize } from '../src/sim/snapshot.js';
import { loadText } from '../src/sim/migrate.js';
import { world, fresh, advance } from './helpers.mjs';

test('10,000 committed events have unique, increasing IDs and references survive compaction and reload', () => {
  const { catalog } = world();
  const s = fresh();
  const person = s.residents['person:highmoor:3'];
  const first = commit(s, 'harvest', 'millbrook', { grain: 1 }, { importance: 0 });
  remember(s, person, first.id, 'witness');
  const important = commit(s, 'fire_resolved', 'highmoor', { outcome: 'extinguished' }, { importance: 3 });
  let prev = important;
  const ids = new Set([first.id, important.id]);
  for (let i = 0; i < 10000; i++) {
    const e = commit(s, i % 2 ? 'harvest' : 'report_received', i % 3 ? 'brightwater' : 'saltmere', { n: i }, { importance: 0, causes: i % 1000 === 0 ? [prev.id] : [] });
    assert.ok(!ids.has(e.id)); ids.add(e.id);
    if (i % 1000 === 0) prev = e;
    if (i % 500 === 0) compactHistory(s);
  }
  compactHistory(s);
  assert.equal(ids.size, 10002);
  assert.ok(s.events.length <= LIVE_LIMIT && s.archive.length <= ARCHIVE_LIMIT, 'storage stays bounded');
  // The remembered routine event and the historic one stay resolvable with their payloads.
  assert.equal(resolve(s, first.id).d.grain, 1);
  assert.equal(resolve(s, important.id).d.outcome, 'extinguished');
  // An unreferenced routine event becomes a counted summary, never undefined.
  const gone = resolve(s, 'event:9');
  assert.ok(gone && (gone.summarized || gone.d));
  assert.ok(Object.values(s.summaries).reduce((n, k) => n + k, 0) > 0);
  assert.equal(resolve(s, `event:${s.ids.event + 5}`), null, 'IDs never issued do not resolve');
  const back = loadText(serialize(s), catalog).state;
  assert.deepEqual(resolve(back, first.id), resolve(s, first.id));
  assert.equal(back.ids.event, s.ids.event, 'the allocator is saved');
  const next = commit(back, 'harvest', 'millbrook', {});
  assert.ok(!ids.has(next.id));
});

test('cause chains link committed facts; the Chronicle list length never decides an ID', () => {
  const s = fresh();
  advance(s, 300);
  const a = commit(s, 'ignition', 'highmoor', {});
  const b = commit(s, 'fire_started', 'highmoor', {}, { causes: [a.id] });
  const c = commit(s, 'fire_resolved', 'highmoor', {}, { causes: [b.id] });
  assert.deepEqual(causeChain(s, c.id).map(e => e.id), [c.id, b.id, a.id]);
  s.events.splice(0, s.events.length - 2);
  const d = commit(s, 'harvest', 'millbrook', {});
  assert.ok(+d.id.split(':')[1] > +c.id.split(':')[1]);
});

test('settlement knowledge and recent lists stay bounded over a long run', () => {
  const s = fresh();
  advance(s, 1440 * 6);
  for (const t of Object.values(s.settlements)) { assert.ok(t.known.length <= 48); assert.ok(t.recent.length <= 24); }
  for (const p of Object.values(s.residents)) assert.ok(p.memories.length <= 8);
});
