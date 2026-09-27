// Globe camera: orbit the planet from space and descend smoothly to street level.
// State is a focus direction on the surface, a distance from that point, a forward vector
// (parallel-transported, so the poles behave) and a tilt that eases toward the horizon near the ground.

import * as THREE from 'three';
import { PLANET_RADIUS } from './sphere.js';

const R = PLANET_RADIUS;
const MIN_ALT = 0.14, MAX_ALT = 430;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export class GlobeCamera {
  constructor(camera, dom, heightAt) {
    this.camera = camera;
    this.dom = dom;
    this.heightAt = heightAt; // (unitDir: Vector3) => terrain height
    this.focus = new THREE.Vector3(0, 0, 1);
    this.fwd = new THREE.Vector3(0, 1, 0);
    this.alt = 260; this.altT = 260;
    this.tiltOffset = 0; this.tiltOffsetT = 0;
    this.headingVel = 0;
    this.vel = new THREE.Vector2();
    this.groundH = 0;
    this.lift = 0;
    this.flight = null;
    this.followFn = null;
    this.pointers = new Map();
    this.keys = new Set();
    this.enabled = true;
    this.onUserInput = () => {};
    this.lastDrag = 0;
    this.cursor = new THREE.Vector2(-1, -1);
    this.bind();
  }

  setView(dir, alt, headingDeg = 0) {
    this.focus.copy(dir).normalize();
    this.alt = this.altT = alt;
    this.resetForward(headingDeg);
  }

  resetForward(headingDeg = 0) {
    const up = this.focus;
    const north = _v.set(0, 1, 0).addScaledVector(up, -up.y);
    if (north.lengthSq() < 1e-6) north.set(1, 0, 0);
    north.normalize();
    const east = _w.crossVectors(north, up).normalize();
    const h = headingDeg * Math.PI / 180;
    this.fwd.copy(north).multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h)).normalize();
  }

  get heading() {
    const up = this.focus;
    const north = _v.set(0, 1, 0).addScaledVector(up, -up.y);
    if (north.lengthSq() < 1e-6) return 0;
    north.normalize();
    const east = _w.crossVectors(north, up).normalize();
    return Math.atan2(this.fwd.dot(east), this.fwd.dot(north));
  }

  autoTilt(alt) {
    const t = Math.min(1, Math.max(0, (Math.log(alt) - Math.log(0.2)) / (Math.log(90) - Math.log(0.2))));
    return 1.3 * Math.pow(1 - t, 0.8);
  }

  get tilt() { return Math.min(1.48, Math.max(0, this.autoTilt(this.alt) + this.tiltOffset)); }

  right(out = new THREE.Vector3()) { return out.crossVectors(this.fwd, this.focus).normalize(); }

  moveFocus(dRight, dFwd) {
    // Surface displacement in world units along the camera's right/forward.
    const r = this.right(_v);
    this.focus.addScaledVector(r, dRight / R).addScaledVector(this.fwd, dFwd / R).normalize();
    this.transportForward();
  }

  transportForward() {
    const up = this.focus;
    this.fwd.addScaledVector(up, -this.fwd.dot(up)).normalize();
  }

  rotateHeading(rad) {
    this.fwd.applyAxisAngle(this.focus, rad).normalize();
  }

  unitsPerPixel() {
    const h = this.dom.clientHeight || 800;
    return (2 * this.alt * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
  }

  // Ray from screen point to the planet (sphere of radius R + h); returns unit dir or null.
  pickDir(clientX, clientY, h = this.groundH) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let rr = R + Math.max(0, h);
    for (let it = 0; it < 3; it++) {
      const o = ray.ray.origin, d = ray.ray.direction;
      const b = o.dot(d), c = o.lengthSq() - rr * rr;
      const disc = b * b - c;
      if (disc < 0) return null;
      const t = -b - Math.sqrt(disc);
      if (t < 0) return null;
      const p = o.clone().addScaledVector(d, t).normalize();
      rr = R + Math.max(0, this.heightAt(p));
      if (it === 2) return p;
    }
    return null;
  }

  flyTo(dir, alt, opts = {}) {
    const from = this.focus.clone(), to = dir.clone().normalize();
    const ang = from.angleTo(to);
    const dist = ang * R;
    const dur = opts.duration ?? Math.min(5.5, 1.4 + Math.sqrt(dist) * 0.18 + Math.abs(Math.log(alt / this.alt)) * 0.25);
    const hop = Math.max(this.alt, alt, dist * 0.55);
    this.flight = { from, to, a0: this.alt, a1: alt, hop, t: 0, dur, tilt0: this.tiltOffset, tilt1: opts.tilt ?? 0,
      heading: opts.heading, ang };
    if (!opts.keepFollow) this.followFn = null;
  }

  follow(fn, alt) {
    this.followFn = fn;
    this.flight = null;
    if (alt) this.altT = alt;
  }

  stopFlight() { this.flight = null; }

  bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, ctrl: e.ctrlKey || e.shiftKey });
      this.vel.set(0, 0); this.headingVel = 0;
      this.userAction();
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointermove', e => {
      this.cursor.set(e.clientX, e.clientY);
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 1) {
        if (p.button === 2 || p.button === 1 || p.ctrl) {
          this.rotateHeading(-dx * 0.005);
          this.tiltOffset = Math.max(-1.3, Math.min(1.3, this.tiltOffset + dy * 0.004));
          this.headingVel = -dx * 0.005 * 60;
        } else {
          const s = this.unitsPerPixel();
          this.moveFocus(-dx * s, dy * s);
          this.vel.set(-dx * s * 60, dy * s * 60);
        }
        this.lastDrag = performance.now();
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.entries()];
        const other = a[0] === e.pointerId ? b[1] : a[1];
        const d0 = Math.hypot(p.x - other.x, p.y - other.y);
        const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (d0 > 10) this.altT = this.alt = clampAlt(this.alt * (d0 / d1));
        const a0 = Math.atan2(p.y - other.y, p.x - other.x), a1 = Math.atan2(e.clientY - other.y, e.clientX - other.x);
        this.rotateHeading(a1 - a0);
        this.tiltOffset = Math.max(-1.3, Math.min(1.3, this.tiltOffset + dy * 0.002));
      }
      p.x = e.clientX; p.y = e.clientY;
      this.userAction();
    });
    const up = e => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (performance.now() - this.lastDrag > 90) { this.vel.set(0, 0); this.headingVel = 0; }
      if (p && this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 5 && performance.now() - this.downAt.t < 400 && p.button === 0) {
        this.onClick && this.onClick(e.clientX, e.clientY);
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // Listen on the window so labels and overlays never swallow zooming; panels keep their own scrolling.
    window.addEventListener('wheel', e => {
      if (e.target !== el && e.target.closest && e.target.closest('.panel, .toolbar')) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      const f = Math.exp(Math.max(-2, Math.min(2, dy * 0.0012)));
      const newAlt = clampAlt(this.altT * f);
      if (f < 1) {
        const hit = this.pickDir(e.clientX, e.clientY);
        if (hit) {
          const k = (1 - newAlt / this.altT) * 0.9;
          this.zoomPull = { dir: hit, k };
        }
      }
      this.altT = newAlt;
      this.flight = null;
      this.userAction(true);
    }, { passive: false });
    el.addEventListener('dblclick', e => {
      const hit = this.pickDir(e.clientX, e.clientY);
      if (hit) this.flyTo(hit, clampAlt(this.alt * 0.3), { duration: 1.2 });
    });
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  userAction(keepFollow = false) {
    this.flight = null;
    if (!keepFollow) this.followFn = null;
    this.onUserInput();
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const K = this.keys;
    if (K.size) {
      const s = this.alt * 0.9 * dt;
      let mx = 0, my = 0;
      if (K.has('w') || K.has('arrowup')) my += s;
      if (K.has('s') || K.has('arrowdown')) my -= s;
      if (K.has('a') || K.has('arrowleft')) mx -= s;
      if (K.has('d') || K.has('arrowright')) mx += s;
      if (mx || my) { this.moveFocus(mx, my); this.userAction(); }
      if (K.has('q')) { this.rotateHeading(dt * 1.2); }
      if (K.has('e')) { this.rotateHeading(-dt * 1.2); }
      if (K.has('r')) this.tiltOffset = Math.min(1.3, this.tiltOffset + dt * 0.8);
      if (K.has('f')) this.tiltOffset = Math.max(-1.3, this.tiltOffset - dt * 0.8);
      if (K.has('=') || K.has('+')) this.altT = clampAlt(this.altT * Math.exp(-dt * 1.6));
      if (K.has('-') || K.has('_')) this.altT = clampAlt(this.altT * Math.exp(dt * 1.6));
    }

    if (this.flight) {
      const F = this.flight;
      F.t = Math.min(1, F.t + dt / F.dur);
      const e = F.t < 0.5 ? 4 * F.t * F.t * F.t : 1 - Math.pow(-2 * F.t + 2, 3) / 2;
      const q = F.ang > 1e-5 ? slerpVec(F.from, F.to, e) : F.to.clone();
      this.focus.copy(q);
      this.transportForward();
      const la = Math.log(F.a0) + (Math.log(F.a1) - Math.log(F.a0)) * e;
      const hopK = Math.sin(Math.PI * e);
      this.alt = this.altT = Math.exp(la) + Math.max(0, F.hop - Math.exp(la)) * hopK * 0.8;
      this.tiltOffset = F.tilt0 + (F.tilt1 - F.tilt0) * e;
      if (F.heading !== undefined && F.t > 0.3) this.rotateHeading(angleDiff(F.heading, this.heading) * Math.min(1, dt * 3));
      if (F.t >= 1) this.flight = null;
    } else {
      if (this.pointers.size === 0) {
        if (this.vel.lengthSq() > 1e-8) {
          this.moveFocus(this.vel.x * dt, this.vel.y * dt);
          this.vel.multiplyScalar(Math.exp(-dt * 4.5));
        }
        if (Math.abs(this.headingVel) > 1e-4) {
          this.rotateHeading(this.headingVel * dt);
          this.headingVel *= Math.exp(-dt * 5);
        }
      }
      if (this.zoomPull) {
        const k = 1 - Math.exp(-dt * 9);
        const pull = this.zoomPull.k * k;
        this.focus.copy(slerpVec(this.focus, this.zoomPull.dir, pull));
        this.transportForward();
        this.zoomPull.k -= pull;
        if (this.zoomPull.k < 1e-4) this.zoomPull = null;
      }
      const la = Math.log(this.alt), lt = Math.log(this.altT);
      this.alt = Math.exp(la + (lt - la) * (1 - Math.exp(-dt * 7)));
      this.followH = null;
      if (this.followFn) {
        const p = this.followFn();
        if (p) {
          const d = _w.copy(p).normalize();
          this.focus.copy(slerpVec(this.focus, d, 1 - Math.exp(-dt * 4)));
          this.transportForward();
          this.followH = p.length() - R;
        } else this.followFn = null;
      }
    }

    // Surface point under focus, smoothed to avoid jitter over rough terrain.
    const gh = this.followH != null ? Math.max(this.followH, Math.max(0, this.heightAt(this.focus))) : Math.max(0, this.heightAt(this.focus));
    this.groundH += (gh - this.groundH) * (1 - Math.exp(-dt * 6));
    const S = _v.copy(this.focus).multiplyScalar(R + this.groundH);
    const tilt = this.tilt;
    const up = this.focus;
    const camPos = _w.copy(up).multiplyScalar(Math.cos(tilt) * this.alt).addScaledVector(this.fwd, -Math.sin(tilt) * this.alt).add(S);
    // Keep the camera above the ground.
    const cd = camPos.clone().normalize();
    const under = Math.max(0, this.heightAt(cd));
    const clear = camPos.length() - R - under;
    const minClear = Math.min(0.09, this.alt * 0.4) + 0.02;
    const wantLift = Math.max(0, minClear - clear);
    this.lift += (wantLift - this.lift) * (1 - Math.exp(-dt * 10));
    if (wantLift > this.lift) this.lift = wantLift;
    camPos.addScaledVector(cd, this.lift);
    this.camera.position.copy(camPos);
    // Orientation: look at S with the up vector leaning forward.
    const zAxis = camPos.clone().sub(S).normalize();
    const yAxis = this.fwd.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, Math.sin(tilt));
    yAxis.addScaledVector(zAxis, -yAxis.dot(zAxis)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    _m.makeBasis(xAxis, yAxis, zAxis);
    this.camera.quaternion.setFromRotationMatrix(_m);
    this.surfacePoint = S.clone();

    // Clip planes scale with altitude.
    const camLen = camPos.length();
    const clearance = Math.max(0.02, camLen - R - under);
    this.camera.near = Math.min(20, Math.max(0.003, clearance * 0.18));
    const horizon = Math.sqrt(Math.max(0, camLen * camLen - (R - 5) * (R - 5)));
    this.camera.far = horizon + Math.sqrt((R + 20) * (R + 20) - (R - 5) * (R - 5)) + 20;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.clearance = clearance;
  }
}

function clampAlt(a) { return Math.min(MAX_ALT, Math.max(MIN_ALT, a)); }

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return -d;
}

export function slerpVec(a, b, t) {
  const c = Math.max(-1, Math.min(1, a.dot(b)));
  const om = Math.acos(c);
  if (om < 1e-6) return a.clone().lerp(b, t).normalize();
  const s = Math.sin(om);
  return a.clone().multiplyScalar(Math.sin((1 - t) * om) / s).addScaledVector(b, Math.sin(t * om) / s);
}
