// Scene adapter for committed incidents. Rendering, observation and FX never create facts.
import * as THREE from 'three';
import { stamp } from '../sim/time.js';

export class Events {
  constructor(app) {
    this.app = app;
    this.listeners = [];
    this.known = new Set();
    this.visits = {};
    this.seed = app.sim.state.seed;
    this.revision = 0;
    this.restoreView();
    this.observe('highmoor');
  }
  restoreView() {
    try {
      const view = JSON.parse(localStorage.getItem('sosaria-observer') || 'null');
      if (view?.seed === this.seed && Array.isArray(view.known) && view.known.length < 4000) {
        this.known = new Set(view.known.filter(id => typeof id === 'string'));
        this.visits = view.visits && typeof view.visits === 'object' ? view.visits : {};
      }
    } catch { /* Observation preferences are independent of the world save. */ }
  }
  saveView() {
    const available = new Set(this.app.sim.state.facts.map(f => f.id));
    this.known = new Set([...this.known].filter(id => available.has(id)));
    try { localStorage.setItem('sosaria-observer', JSON.stringify({ seed: this.seed, known: [...this.known], visits: this.visits })); } catch {}
  }
  reset() {
    this.seed = this.app.sim.state.seed;
    this.known.clear(); this.visits = {}; this.revision++;
    this.observe('highmoor');
  }
  observe(id) {
    const town = this.app.sim.state.settlements[id];
    if (!town) return;
    for (const factId of town.known) {
      if (!this.known.has(factId)) { this.known.add(factId); this.revision++; }
    }
  }
  get log() {
    return this.app.sim.state.facts.filter(f => this.known.has(f.id)).slice(-60).reverse().map(f => this.entry(f));
  }
  entry(f) {
    const site = this.app.sites.find(s => s.s.id === f.where);
    return { ...f, site: f.where, pos: site?.centerWorld, stamp: stamp(f.tick, site?.s.lon),
      icon: f.type.includes('fire') ? 'flame' : f.type.includes('shipment') ? 'coin' : f.type.includes('report') || f.status === 'legend' ? 'rumor' : 'castle',
      rumor: ['legend', 'reported'].includes(f.status) };
  }
  on(fn) { this.listeners.push(fn); }
  update(dt) {
    const { sim, people, controls, sites, structures, fx } = this.app;
    if (controls.alt < 9) {
      for (const site of sites) if (site.centerWorld.distanceTo(controls.surfacePoint) < site.s.radius + 1.5) this.observe(site.s.id);
    }
    for (const local of people.active.values()) local.alarm = null;
    for (const b of Object.values(sim.state.buildings)) {
      if (b.status !== 'burning') continue;
      const rec = structures.byBuilding.get(b.id);
      if (!rec) continue;
      const local = people.active.get(b.site);
      if (local) local.alarm = { kind: 'fire', x: rec.item.x, y: rec.item.y, until: b.endTick };
      if (dt <= 0 || controls.reducedMotion || controls.alt > 12 || rec.site.centerWorld.distanceTo(controls.surfacePoint) > 10) continue;
      const pos = new THREE.Vector3().setFromMatrixPosition(rec.matrix), up = pos.clone().normalize();
      pos.addScaledVector(up, 0.2);
      fx.emit('fire', pos, up.clone().multiplyScalar(0.12), 2, 0.04, 0.035, 0.9);
      if (Math.floor(sim.seconds * 10) % 3 === 0) fx.emit('smoke', pos, up.clone().multiplyScalar(0.06), 1, 0.03, 0.06, 4);
    }
  }
}
