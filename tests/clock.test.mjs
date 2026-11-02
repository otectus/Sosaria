// F01: one authoritative clock. Equal simulated time gives equal results at every speed and
// frame cadence; pause, long frames and hidden tabs never desynchronize the world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SimClock, TICKS_PER_DAY, TICKS_PER_REAL_SECOND, hourAt, localDayAt, stamp, dateOf, dateAt, declinationAt, worldDay, localMinute, minuteOffset } from '../src/sim/clock.js';
import { CALENDAR, validateCalendar } from '../src/content/calendar.js';
import { WorldClock } from '../src/render/sky.js';
import { Simulation } from '../src/sim/kernel.js';
import { world, fresh, sha } from './helpers.mjs';

test('a day is 1,440 one-minute ticks and 420 real seconds at 1x, for any frame cadence', () => {
  for (const speed of [1, 4, 16, 64]) for (const fps of [30, 60, 144]) {
    const clock = new SimClock();
    const frames = Math.round(420 / speed * fps);
    for (let i = 0; i < frames; i++) clock.accrue(1 / fps, speed, false);
    assert.ok(Math.abs(clock.debt - TICKS_PER_DAY) <= 1, `${speed}x at ${fps} fps gave ${clock.debt} ticks`);
  }
});

test('the rational accumulator does not drift when the same real time is split differently', () => {
  const a = new SimClock(), b = new SimClock();
  for (let i = 0; i < 7000; i++) a.accrue(0.001, 16, false);
  for (let i = 0; i < 7; i++) b.accrue(1, 16, false);
  assert.equal(a.debt, b.debt);
  assert.equal(a.units, b.units);
  assert.equal(a.debt, Math.floor(7 * 16 * TICKS_PER_REAL_SECOND));
});

test('pause stops ticks and freezes interpolation; invalid input is ignored', () => {
  const c = new SimClock();
  c.accrue(0.5, 4, false);
  const debt = c.debt, frac = c.fraction;
  c.accrue(100, 4, true);
  assert.equal(c.debt, debt); assert.equal(c.fraction, frac);
  for (const bad of [NaN, -1, Infinity]) assert.equal(c.accrue(bad, 4, false), 0);
  assert.equal(c.accrue(1, 3, false), 0, 'only offered speeds are accepted');
});

test('equal simulated time gives identical worlds at 1x, 4x, 16x and 64x', () => {
  const { catalog } = world();
  const target = 2 * TICKS_PER_DAY;
  const run = (speed, fps) => {
    const sim = new Simulation(catalog, fresh('clock-seed'));
    let guard = 0;
    while (sim.state.tick < target && guard++ < 1e6) {
      const left = target - sim.state.tick - sim.clock.debt;
      sim.advance(Math.min(1 / fps, Math.max(1e-6, left / speed / TICKS_PER_REAL_SECOND)), speed, false, { budgetMs: 1e9, maxTicks: Math.max(1, left) });
    }
    while (sim.state.tick > target) throw new Error('overshoot');
    return sha(sim.state);
  };
  const reference = run(1, 60);
  for (const [speed, fps] of [[4, 30], [16, 144], [64, 60]]) assert.equal(run(speed, fps), reference, `${speed}x/${fps}fps`);
});

test('a long frame is processed within a budget; debt beyond two seconds slows the whole world and is reported', () => {
  const { catalog } = world();
  const sim = new Simulation(catalog, fresh());
  let t = 0; const now = () => t;
  sim.advance(30, 64, false, { budgetMs: 8, maxTicks: 50, now });
  assert.equal(sim.state.tick, 50, 'per-frame work is bounded');
  assert.ok(sim.clock.debt <= Math.ceil(64 * TICKS_PER_REAL_SECOND * 2) + 1, 'retained debt is bounded');
  assert.ok(sim.clock.dropped > 0, 'unsustainable real time is dropped coherently, not skipped work');
  for (let i = 0; i < 100; i++) { t += 16; sim.advance(0.016, 64, false, { now }); }
  assert.ok(sim.clock.achieved > 0 && Number.isFinite(sim.clock.achieved));
});

test('pause halts the world at once, even with ticks still owed from 64x', () => {
  const { catalog } = world();
  const sim = new Simulation(catalog, fresh());
  let t = 0;
  sim.advance(1.5, 64, false, { budgetMs: 1e9, maxTicks: 10, now: () => t });
  assert.ok(sim.clock.debt > 0, 'ticks are owed');
  const tick = sim.state.tick;
  for (let i = 0; i < 20; i++) sim.advance(0.1, 64, true, { now: () => t });
  assert.equal(sim.state.tick, tick);
});

test('hidden time is never simulated: nothing accrues unless the app passes it in', () => {
  const { catalog } = world();
  const sim = new Simulation(catalog, fresh());
  sim.advance(0.1, 1, false);
  const before = sim.state.tick;
  // The app does not call advance while document.hidden; on return it resets its frame clock.
  sim.advance(0.016, 1, false);
  assert.ok(sim.state.tick - before <= 1);
});

test('the sky reads canonical time: hours, local days and seasons agree with the simulation', () => {
  const sky = new WorldClock();
  for (const tick of [0, 333, 1440, 4321, 172800]) for (const lon of [-176, -36.2, 0, 70, 140]) {
    sky.sync(tick);
    assert.ok(Math.abs(sky.hourAt(lon) - hourAt(tick, lon)) < 1e-9);
    assert.equal(sky.localDay(lon), localDayAt(tick, lon));
    assert.ok(stamp(tick, lon).includes(dateOf(localDayAt(tick, lon) - 1).season.name));
    assert.ok(Math.abs(sky.declination - declinationAt(tick)) < 1e-12);
  }
  assert.equal(Math.round(hourAt(0, -36.2) * 60), 570, 'tick 0 is 09:30 in Highmoor');
  assert.equal(localMinute(0, minuteOffset(-36.2)), 570);
});

test('the calendar is data: 120 days, four seasons, and dates derived from ticks', () => {
  assert.deepEqual(validateCalendar(CALENDAR), []);
  assert.equal(dateAt(0).dayOfYear, CALENDAR.start.dayOfYear);
  const y = dateOf(CALENDAR.daysPerYear - CALENDAR.start.dayOfYear + 1);
  assert.equal(y.year, CALENDAR.start.year + 1); assert.equal(y.dayOfYear, 1); assert.equal(y.season.id, 'spring');
  assert.equal(worldDay(TICKS_PER_DAY - 570), 1, 'calendar days turn over at Highmoor midnight');
  const peak = Math.max(...Array.from({ length: 120 }, (_, d) => declinationAt(d * TICKS_PER_DAY)));
  assert.ok(peak > 16 && peak <= CALENDAR.tilt);
});
