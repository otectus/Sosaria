// Canonical world time. One integer tick is one in-world minute; everything authoritative
// (needs, jobs, travel, incidents, seasons) is scheduled in ticks. Rendering interpolates.
import { CALENDAR } from '../content/calendar.js';

export const TICKS_PER_DAY = CALENDAR.ticksPerDay;
// At 1x a day still takes the original 420 real seconds: 24/7 ticks per real second.
export const REAL_SECONDS_PER_DAY = 420;
export const SPEEDS = [1, 4, 16, 64];
// Exact rational accumulator: a real microsecond at 1x adds 24 units, one tick costs 7,000,000.
export const UNITS_PER_TICK = REAL_SECONDS_PER_DAY * 1e6 * 24 / TICKS_PER_DAY;
const UNITS_PER_MICROSECOND = 24;
export const TICKS_PER_REAL_SECOND = TICKS_PER_DAY / REAL_SECONDS_PER_DAY;

// Subsolar day count for the sky. Tick 0 is 09:30 at Highmoor, preserving the original opening.
export const START_DAY = 1 - 1.3 / 360;
export const dayAt = tick => START_DAY + tick / TICKS_PER_DAY;
export const hourAt = (tick, lon) => ((dayAt(tick) * 24 + lon / 15 + 12) % 24 + 24) % 24;

// Integer local time for simulation decisions: minutes after local midnight.
const MERIDIAN_MINUTE_AT_START = 570;
export const minuteOffset = lon => MERIDIAN_MINUTE_AT_START + Math.round((lon - CALENDAR.meridian) * 4);
export const localMinute = (tick, offset) => ((tick + offset) % TICKS_PER_DAY + TICKS_PER_DAY) % TICKS_PER_DAY;

// Days elapsed on the calendar meridian; seasons and growth use this single global day.
export const worldDay = tick => Math.floor((tick + MERIDIAN_MINUTE_AT_START) / TICKS_PER_DAY);
const localDayIndex = (tick, lon) => Math.floor(dayAt(tick) + lon / 360 + 0.5) - 1;

export function dateOf(dayIndex) {
  const n = CALENDAR.start.dayOfYear - 1 + dayIndex;
  const year = CALENDAR.start.year + Math.floor(n / CALENDAR.daysPerYear);
  const dayOfYear = ((n % CALENDAR.daysPerYear) + CALENDAR.daysPerYear) % CALENDAR.daysPerYear + 1;
  let rest = dayOfYear - 1, seasonIndex = 0;
  while (rest >= CALENDAR.seasons[seasonIndex].days) { rest -= CALENDAR.seasons[seasonIndex].days; seasonIndex++; }
  return { year, dayOfYear, seasonIndex, season: CALENDAR.seasons[seasonIndex], dayOfSeason: rest + 1, day: dayIndex };
}
export const dateAt = tick => dateOf(worldDay(tick));
export const localDateAt = (tick, lon) => dateOf(localDayIndex(tick, lon));
// Days counted from the first morning, for compact labels.
export const localDayAt = (tick, lon) => Math.max(1, localDayIndex(tick, lon) + 1);

export function declinationAt(tick) {
  const n = CALENDAR.start.dayOfYear - 1 + (tick + MERIDIAN_MINUTE_AT_START) / TICKS_PER_DAY;
  return CALENDAR.tilt * Math.sin(2 * Math.PI * n / CALENDAR.daysPerYear);
}

export function clockText(tick, lon) {
  const minutes = Math.floor(hourAt(tick, lon) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function stamp(tick, lon = CALENDAR.meridian) {
  const d = localDateAt(tick, lon);
  return `${d.dayOfSeason} ${d.season.name}, Year ${d.year} · ${clockText(tick, lon)}`;
}
export const durationText = ticks => ticks < 90 ? `${Math.max(0, Math.round(ticks))} min` :
  ticks < TICKS_PER_DAY * 2 ? `${Math.round(ticks / 60)} h` : `${Math.round(ticks / TICKS_PER_DAY)} days`;

// Converts real frame time into whole ticks. The remainder is kept exactly, so splitting the same
// real time into different frame cadences yields the same tick count. Unprocessed ticks are debt.
export class SimClock {
  constructor() {
    this.units = 0; this.debt = 0; this.limited = false; this.dropped = 0;
    this.window = []; this.achieved = 0;
  }
  accrue(elapsedSeconds, speed, paused) {
    if (paused || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 || !SPEEDS.includes(speed)) return 0;
    this.units += Math.round(elapsedSeconds * 1e6) * speed * UNITS_PER_MICROSECOND;
    const due = Math.floor(this.units / UNITS_PER_TICK);
    this.units -= due * UNITS_PER_TICK;
    this.debt += due;
    return due;
  }
  // When the machine cannot keep up, the whole world slows together instead of skipping work.
  clampDebt(maxDebt) {
    if (this.debt <= maxDebt) return 0;
    const n = this.debt - maxDebt;
    this.debt = maxDebt; this.dropped += n;
    return n;
  }
  take(maxTicks) { const n = Math.min(this.debt, Math.max(0, maxTicks | 0)); this.debt -= n; return n; }
  get fraction() { return this.debt > 0 ? 0 : this.units / UNITS_PER_TICK; }
  // Achieved speed over a short real-time window, in multiples of 1x.
  record(nowSeconds, ticks) {
    this.window.push([nowSeconds, ticks]);
    while (this.window.length > 2 && nowSeconds - this.window[0][0] > 2) this.window.shift();
    const span = nowSeconds - this.window[0][0];
    if (span > 0.25) this.achieved = this.window.slice(1).reduce((n, w) => n + w[1], 0) / span / TICKS_PER_REAL_SECOND;
    this.limited = this.debt > 0;
  }
  reset() { this.units = 0; this.debt = 0; this.window = []; this.achieved = 0; this.limited = false; }
}
