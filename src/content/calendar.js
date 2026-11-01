// The default calendar, expressed as data. One tick is one in-world minute.
// These values are a balance default for the authored scenario, not established lore.

export const CALENDAR = {
  id: 'valdren-reckoning',
  ticksPerDay: 1440,
  daysPerYear: 120,
  seasons: [
    { id: 'spring', name: 'Spring', days: 30, growth: 100, sowing: true },
    { id: 'summer', name: 'Summer', days: 30, growth: 120, sowing: false },
    { id: 'autumn', name: 'Autumn', days: 30, growth: 60, sowing: true },
    { id: 'winter', name: 'Winter', days: 30, growth: 10, sowing: false },
  ],
  // The default world opens late in summer, with harvests approaching.
  start: { year: 1, dayOfYear: 52 },
  // Calendar days turn over at midnight on this meridian (Highmoor), never per settlement.
  meridian: -36.2,
  // Axial tilt used by the sky; declination follows the year rather than a separate cycle.
  tilt: 17,
};

export function validateCalendar(c = CALENDAR) {
  const errors = [];
  if (!Number.isSafeInteger(c.ticksPerDay) || c.ticksPerDay <= 0) errors.push('calendar.ticksPerDay must be a positive integer');
  const total = c.seasons.reduce((n, s) => n + s.days, 0);
  if (total !== c.daysPerYear) errors.push(`calendar.seasons span ${total} days, expected ${c.daysPerYear}`);
  const ids = new Set();
  for (const s of c.seasons) {
    if (ids.has(s.id)) errors.push(`calendar.seasons duplicates ${s.id}`);
    ids.add(s.id);
    if (!Number.isSafeInteger(s.growth) || s.growth < 0) errors.push(`calendar.seasons.${s.id}.growth must be a non-negative integer`);
  }
  if (c.start.dayOfYear < 1 || c.start.dayOfYear > c.daysPerYear) errors.push('calendar.start.dayOfYear is outside the year');
  return errors;
}
