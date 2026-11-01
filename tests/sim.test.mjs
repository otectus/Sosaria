import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeCatalog, createState, residentSchedule, GOODS } from '../src/sim/state.js';
import { Simulation, stepWorld, command } from '../src/sim/step.js';
import { materialBalance } from '../src/sim/economy.js';
import { depart, loseTrip } from '../src/sim/travel.js';
import { startFire } from '../src/sim/incidents.js';
import { fact } from '../src/sim/knowledge.js';
import { parseSnapshot, snapshot, loadWorld, saveWorld, SAVE_KEY, BACKUP_KEY } from '../src/sim/storage.js';
import { FixedTime, hourAt, localDayAt, stamp, DAY_LENGTH } from '../src/sim/time.js';
import { WorldClock } from '../src/render/sky.js';
import { Nav } from '../src/life/people.js';
import { stormAt, precipitation } from '../src/sim/weather.js';
import { dirToLatLon } from '../src/core/sphere.js';

export const catalog = makeCatalog(['highmoor', 'brightwater', 'millbrook'].map((id, i) => ({
  id, name: id[0].toUpperCase() + id.slice(1), culture: 'human', kind: i === 0 ? 'capital' : 'town', lon: -36 - i * 5,
  plaza: { x: 0, y: 0 }, work: [{ kind: 'field', x: 1, y: 0 }],
  buildings: Array.from({ length: 6 }, (_, n) => ({ id: `building:${id}:${n}`, kind: 'home', model: 'house0', x: n / 10, y: 0.2, combustible: true })),
})), [
  { id: 'road:highmoor:brightwater', a: 'highmoor', b: 'brightwater', duration: 150 },
  { id: 'road:brightwater:millbrook', a: 'brightwater', b: 'millbrook', duration: 150 },
]);
const advance = (state, tick, cat = catalog) => { while (state.tick < tick) stepWorld(state, cat); return state; };
const hash = state => createHash('sha256').update(snapshot(state)).digest('hex');
const balanced = state => assert.deepEqual(materialBalance(state), Object.fromEntries(GOODS.map(g => [g, 0])));

// The command list is tick-based, independent of rendering or observers.
function replay(speed, fps) {
  const sim = new Simulation(catalog, createState(catalog, 'replay-seed'));
  const clock = new FixedTime();
  while (sim.state.tick < 2940) {
    const left = 2940 - sim.state.tick - clock.pending;
    clock.advance(Math.min(1 / fps, left / speed), speed, false, () => {
      if (sim.state.tick === 180) command(sim.state, catalog, { type: 'repair', site: 'highmoor', building: Object.keys(sim.state.buildings)[0] });
      if (sim.state.tick === 240) command(sim.state, catalog, { type: 'close_route', site: 'brightwater', route: catalog.edges[0].id });
      stepWorld(sim.state, catalog);
    });
    // Observer queries must have no effect on state or random decisions.
    if (fps === 30) for (const person of Object.values(sim.state.residents)) residentSchedule(sim.state, person, catalog);
  }
  return sim.state;
}

test('one day is 420 seconds at every speed; pause preserves logical and interpolated time', () => {
  for (const speed of [1, 4, 16, 64]) {
    const sim = new Simulation(catalog);
    for (let i = 0; i < 420; i++) sim.advance(1 / speed, speed);
    assert.equal(sim.state.tick, DAY_LENGTH);
    assert.ok(Math.abs(hourAt(0, -36) - hourAt(DAY_LENGTH, -36)) < 1e-10);
    const sky = new WorldClock(); sky.sync(sim.seconds);
    assert.ok(Math.abs(hourAt(sim.seconds, -36) - sky.hourAt(-36)) < 1e-10);
    const before = snapshot(sim.state), seconds = sim.seconds;
    sim.advance(5000, speed, true);
    assert.equal(snapshot(sim.state), before); assert.equal(sim.seconds, seconds);
  }
});

test('Chronicle dates and local midnight agree with the sky at different longitudes', () => {
  const sky = new WorldClock();
  for (const tick of [0, 180, 270, 420, 2940]) for (const lon of [-120, -36.2, 0, 90]) {
    sky.sync(tick);
    assert.equal(localDayAt(tick, lon), sky.localDay(lon));
    assert.ok(stamp(tick, lon).startsWith(`Day ${sky.localDay(lon)} · `));
  }
});

test('replay agrees across speed, cadence, observer queries and save/reload', () => {
  const reference = replay(1, 60);
  for (const speed of [1, 4, 16, 64]) for (const fps of [30, 60]) assert.equal(hash(replay(speed, fps)), hash(reference), `${speed}x / ${fps}fps`);
  balanced(reference);
  const a = advance(createState(catalog), 125);
  const restored = parseSnapshot(snapshot(a), catalog);
  assert.equal(hash(advance(a, 2940)), hash(advance(restored, 2940)));
});

test('bounded frame work retains debt instead of skipping simulation; hidden time can be omitted', () => {
  const sim = new Simulation(catalog);
  sim.advance(10, 64);
  assert.equal(sim.state.tick, 128); assert.equal(sim.time.limited, true);
  while (sim.time.pending >= 1) sim.advance(0, 64);
  assert.equal(sim.state.tick, 640); assert.equal(sim.time.limited, false);
});

test('shipments reserve inventory and resolve once; losses cannot later deliver', () => {
  const state = createState(catalog);
  const before = state.settlements.millbrook.stocks.grain;
  const t = depart(state, catalog, 'millbrook', 'brightwater', { grain: 20 });
  assert.ok(t); assert.equal(state.settlements.millbrook.stocks.grain, before - 20);
  assert.equal(depart(state, catalog, 'millbrook', 'highmoor', { grain: 1 }), null, 'no invented direct road');
  assert.equal(depart(state, catalog, 'brightwater', 'highmoor', { grain: 999 }), null, 'insufficient stock');
  assert.equal(loseTrip(state, t.id), true); assert.equal(loseTrip(state, t.id), false);
  advance(state, 600); balanced(state);
  assert.equal(state.facts.filter(f => f.type === 'shipment_delivered' && f.trip === t.id).length, 0);
  for (const trip of state.trips.filter(t => t.status === 'delivered')) assert.equal(state.facts.filter(f => f.type === 'shipment_delivered' && f.trip === trip.id).length, 1);
});

test('a merchant remains at the destination until a real return journey completes', () => {
  const state = createState(catalog);
  const trip = depart(state, catalog, 'millbrook', 'brightwater', { grain: 20 });
  advance(state, 150);
  assert.equal(state.residents[trip.carrier].location, 'brightwater');
  assert.equal(depart(state, catalog, 'millbrook', 'brightwater', { grain: 20 }), null);
  advance(state, 180);
  const back = state.trips.find(t => t.carrier === trip.carrier && t.id !== trip.id && t.status === 'travelling');
  assert.equal(back.from, 'brightwater'); assert.equal(back.to, 'millbrook');
  advance(state, 330);
  assert.equal(state.residents[trip.carrier].location, 'millbrook');
  balanced(state);
});

test('fire eligibility reads the same storm positions as the rendered sky', () => {
  const storm = stormAt(0, 90), [lat, lon] = dirToLatLon(storm.dir);
  assert.ok(precipitation({ lat, lon }, 90) > 0.3);
  const wet = makeCatalog(catalog.places.map(p => ({ ...p, lat, lon })), catalog.edges);
  const state = createState(wet); state.tick = 90;
  assert.equal(startFire(state, wet, 'highmoor', 'building:highmoor:0'), null);
});

test('closed routes interrupt cargo and knowledge together, then resume after save/load', () => {
  let state = createState(catalog);
  const origin = fact(state, 'fire_extinguished', 'highmoor', 'An observed fire was put out.');
  const t = depart(state, catalog, 'highmoor', 'brightwater', {}, [origin.id]);
  advance(state, 10);
  assert.ok(command(state, catalog, { type: 'close_route', site: 'highmoor', route: t.route }).ok);
  const frozen = t.progress;
  advance(state, 75);
  assert.equal(t.progress, frozen);
  assert.equal(state.settlements.brightwater.known.includes(origin.id), false);
  state = parseSnapshot(snapshot(state), catalog);
  advance(state, 240);
  assert.equal(state.trips.find(x => x.id === t.id).status, 'delivered');
  assert.ok(state.settlements.brightwater.known.includes(origin.id));
  const report = state.reports.find(r => r.factId === origin.id && r.trip === t.id);
  assert.ok(report.received >= t.duration + 89);
  assert.equal(state.settlements.millbrook.known.includes(origin.id), false, 'news cannot skip the next road');
  balanced(state);
});

test('fire has local durable damage, one outcome, and a funded recovery with real costs', () => {
  const state = createState(catalog);
  const fire = startFire(state, catalog, 'highmoor', 'building:highmoor:0');
  assert.ok(fire);
  assert.equal(startFire(state, catalog, 'brightwater', 'building:highmoor:0'), null);
  const before = snapshot(state);
  assert.equal(command(state, catalog, { type: 'repair', site: 'brightwater', building: 'building:highmoor:0' }).ok, false);
  assert.equal(snapshot(state), before, 'rejection changes no state');
  advance(state, 75);
  const b = state.buildings['building:highmoor:0'];
  assert.equal(b.status, 'damaged'); assert.ok(b.condition < 100);
  assert.equal(Object.values(state.buildings).filter(b => b.site === 'brightwater').length, 0);
  const coins = state.settlements.highmoor.stocks.coin;
  assert.equal(command(state, catalog, { type: 'repair', site: 'highmoor', building: b.id }).ok, true);
  assert.equal(state.settlements.highmoor.stocks.coin, coins - 12);
  assert.equal(command(state, catalog, { type: 'repair', site: 'highmoor', building: b.id }).ok, false);
  const restored = parseSnapshot(snapshot(state), catalog);
  advance(restored, 300);
  assert.equal(restored.buildings[b.id].status, 'repaired');
  assert.equal(restored.facts.filter(f => f.type === 'fire_extinguished' && f.building === b.id).length, 1);
  assert.equal(restored.facts.filter(f => f.type === 'repair_completed' && f.building === b.id).length, 1);
  balanced(restored);
});

test('named identities, homes, work and time-derived positions survive revisit and reload', () => {
  const state = createState(catalog, 'names');
  const people = structuredClone(state.residents);
  const resident = people['person:highmoor:0'];
  advance(state, 2000);
  const loaded = parseSnapshot(snapshot(state), catalog);
  assert.equal(loaded.residents[resident.id].name, resident.name);
  assert.deepEqual(loaded.residents[resident.id].home, resident.home);
  assert.deepEqual(residentSchedule(loaded, loaded.residents[resident.id], catalog), residentSchedule(state, state.residents[resident.id], catalog));
});

test('legends retain uncertainty through transport and source lineage', () => {
  const state = createState(catalog);
  const legend = state.facts.find(f => f.status === 'legend');
  const trip = depart(state, catalog, 'highmoor', 'brightwater');
  advance(state, trip.duration);
  const report = state.reports.find(r => r.factId === legend.id && r.trip === trip.id);
  assert.equal(report.truthStatus, 'legend'); assert.equal(legend.status, 'legend');
  assert.ok(state.facts.some(f => f.report === report.id && f.status === 'legend' && f.causeIds.includes(legend.id)));
});

test('saves reject invalid and future schemas and recover the last readable snapshot', () => {
  const data = new Map(), storage = { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) };
  const s = advance(createState(catalog), 100);
  saveWorld(storage, s, catalog); advance(s, 101); saveWorld(storage, s, catalog);
  data.set(SAVE_KEY, '{broken');
  const loaded = loadWorld(storage, catalog);
  assert.equal(loaded.state.tick, 100); assert.match(loaded.warning, /Recovered/);
  assert.ok(data.get(BACKUP_KEY));
  const bad = structuredClone(s); bad.settlements.highmoor.stocks.bread = -1;
  assert.throws(() => parseSnapshot(snapshot(bad), catalog));
  bad.schemaVersion = 99; assert.throws(() => parseSnapshot(snapshot(bad), catalog), /unsupported/);
  bad.schemaVersion = 1; bad.catalog = 'changed'; assert.throws(() => parseSnapshot(snapshot(bad), catalog), /layout/);
  assert.equal(hash(parseSnapshot(snapshot(s), catalog)), hash(s), 'v1 round trip');
});

test('multi-week seed scenarios keep inventories finite, material balanced and archives bounded', () => {
  for (const seed of ['calm', 'wet', 'trade']) {
    const s = advance(createState(catalog, seed), 420 * 48);
    balanced(s);
    for (const t of Object.values(s.settlements)) {
      assert.ok(Object.values(t.stocks).every(n => Number.isFinite(n) && n >= 0));
      assert.equal(t.unmetMeals, 0);
    }
    assert.ok(s.facts.length < 800); assert.ok(s.trips.length < 40); assert.ok(s.reports.length < 120);
    assert.doesNotThrow(() => parseSnapshot(snapshot(s), catalog));
  }
});

test('disconnected navigation never appends an unreachable destination', () => {
  const nav = new Nav({ streets: [{ pts: [[0, 0], [1, 0]] }, { pts: [[10, 0], [11, 0]] }], plaza: [0, 0] });
  assert.equal(nav.path(0, 0, 11, 0), null);
  assert.ok(nav.path(0, 0, 1, 0));
});
