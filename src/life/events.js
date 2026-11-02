// Presentation of committed incidents: flames and smoke scale with a fire's authoritative
// intensity. Effects use cosmetic randomness only and never create or change world state.
import * as THREE from 'three';

export class IncidentFX {
  constructor(app) { this.app = app; this.acc = 0; this.pos = new THREE.Vector3(); this.up = new THREE.Vector3(); }
  update(realDt) {
    const { sim, structures, controls, fx, settings } = this.app;
    if (realDt <= 0 || controls.alt > 12 || settings?.calmEffects) return;
    this.acc += realDt;
    const state = sim.state;
    for (const town of Object.values(state.settlements)) for (const id of town.fires) {
      const x = state.incidents[id], rec = x && structures.byBuilding.get(x.building);
      if (!rec || rec.site.centerWorld.distanceTo(controls.surfacePoint) > 10) continue;
      const k = x.intensity / 1000;
      if (k <= 0 || this.app.clock.paused) continue;
      this.pos.setFromMatrixPosition(rec.matrix); this.up.copy(this.pos).normalize();
      this.pos.addScaledVector(this.up, 0.12 + 0.1 * k);
      const motion = controls.reducedMotion ? 0.4 : 1;
      fx.emit('fire', this.pos, this.up.clone().multiplyScalar(0.12), Math.max(1, Math.round(4 * k * motion)), 0.04 + 0.03 * k, 0.035, 0.9);
      if (Math.random() < 0.4 * motion) fx.emit('smoke', this.pos, this.up.clone().multiplyScalar(0.06), 1, 0.03 + 0.04 * k, 0.06, 4);
    }
  }
}
