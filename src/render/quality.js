// Frame-time hysteresis changes budgets only after sustained load or headroom.
export const QUALITY = Object.freeze({
  performance: Object.freeze({ label: 'Performance', dpr: 1, pixels: 1200000, samples: 0, shadow: 1024, atmosphere: 8, bloom: 4, detail: 0.65 }),
  balanced: Object.freeze({ label: 'Balanced', dpr: 1.5, pixels: 2200000, samples: 2, shadow: 2048, atmosphere: 12, bloom: 5, detail: 0.85 }),
  cinematic: Object.freeze({ label: 'Cinematic', dpr: 2, pixels: 4200000, samples: 4, shadow: 4096, atmosphere: 16, bloom: 6, detail: 1 }),
});
const TIERS = Object.keys(QUALITY);

export class RenderQuality {
  constructor(mode = 'auto') {
    this.mode = 'auto';
    this.tier = 1;
    this.scale = 1;
    this.setMode(mode);
  }

  get settings() { return QUALITY[TIERS[this.tier]]; }
  get name() { return TIERS[this.tier]; }

  setMode(mode) {
    if (mode !== 'auto' && !Object.hasOwn(QUALITY, mode)) mode = 'auto';
    this.mode = mode;
    this.tier = mode === 'auto' ? 1 : TIERS.indexOf(mode);
    this.scale = 1;
    this.reset();
  }

  reset() { this.average = 1000 / 60; this.slow = 0; this.fast = 0; this.cooldown = 3; }

  pixelRatio(w, h, deviceRatio = 1) {
    const s = this.settings;
    return Math.min(deviceRatio, s.dpr, Math.sqrt(s.pixels / Math.max(1, w * h))) * this.scale;
  }

  update(seconds) {
    if (this.mode !== 'auto' || !Number.isFinite(seconds) || seconds <= 0) return false;
    seconds = Math.min(seconds, 0.25);
    this.average += (seconds * 1000 - this.average) * (1 - Math.exp(-seconds * 2));
    if (this.cooldown > 0) { this.cooldown -= seconds; return false; }
    this.slow = this.average > 25 ? this.slow + seconds : Math.max(0, this.slow - seconds * 2);
    this.fast = this.average < 18 ? this.fast + seconds : 0;
    if (this.slow > 2) {
      if (this.tier > 0) this.tier--;
      else if (this.scale > 0.7) this.scale = Math.max(0.7, Math.round((this.scale - 0.1) * 10) / 10);
      else return false;
    } else if (this.fast > 12) {
      if (this.scale < 1) this.scale = Math.min(1, Math.round((this.scale + 0.1) * 10) / 10);
      else if (this.tier < 2) this.tier++;
      else return false;
    } else return false;
    this.reset();
    return true;
  }
}
