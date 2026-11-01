// One world second per logical tick. Presentation may interpolate, never invent time.
export const DAY_LENGTH = 420;
export const START_DAY = 1 - 1.3 / 360; // 09:30 at Highmoor, preserving the original sky.
export const dayAt = tick => START_DAY + tick / DAY_LENGTH;
export const hourAt = (tick, lon) => ((dayAt(tick) * 24 + lon / 15 + 12) % 24 + 24) % 24;
export const localDayAt = (tick, lon) => Math.max(1, Math.floor(dayAt(tick) + lon / 360 + 0.5));
export const stamp = (tick, lon = -36.2) => {
  const hour = hourAt(tick, lon), minutes = Math.floor(hour * 60);
  return `Day ${localDayAt(tick, lon)} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export class FixedTime {
  constructor() { this.pending = 0; this.limited = false; }
  advance(elapsed, speed, paused, step, maxTicks = 128) {
    if (paused) return 0;
    if (!Number.isFinite(elapsed) || elapsed < 0 || ![1, 4, 16, 64].includes(speed)) return 0;
    this.pending += elapsed * speed;
    const n = Math.min(maxTicks, Math.floor(this.pending + 1e-9));
    for (let i = 0; i < n; i++) step();
    this.pending = Math.max(0, this.pending - n);
    this.limited = this.pending >= 1;
    return n;
  }
  get fraction() { return Math.min(1, this.pending); }
}
