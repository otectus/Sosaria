// Dragons: articulated hierarchies animated on the CPU. They circle their mountains, voyage across
// the world, land on perches, fold their wings, roar and breathe fire.

import * as THREE from 'three';
import { Kit, M, col } from '../models/kit.js';
import { makeKitMaterial } from '../render/materials.js';
import { DRAGONS } from '../world/atlas.js';
import { latLonToDir, PLANET_RADIUS, tangentFrame, dirToLatLon } from '../core/sphere.js';

const R = PLANET_RADIUS;

function mesh(build, mat) {
  const k = new Kit();
  build(k);
  const m = new THREE.Mesh(k.build(), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildDragon(def, mat) {
  const lin = (c) => c.map(v => Math.pow(v, 2.2));
  const C = lin(def.color), B = lin(def.belly), W = lin(def.wing);
  const bone = [C[0] * 0.6, C[1] * 0.6, C[2] * 0.6];
  const horn = col(0xe8dcc0), eye = col(0xffb020);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(k => {
    k.blob(0, 0, 0, 0.23, 0.2, 0.46, C, M.scales, 2, 0.03, 3, true);
    k.blob(0, -0.08, 0.04, 0.17, 0.11, 0.36, B, M.skin, 1, 0.05, 4, true);
    k.blob(0, 0.02, 0.3, 0.17, 0.16, 0.18, C, M.scales, 1, 0.04, 6, true);
    for (let i = 0; i < 7; i++) k.cone(0, 0.14 - Math.abs(i - 3) * 0.01, 0.3 - i * 0.1, 0.03, 0.08 - Math.abs(i - 3) * 0.008, 4, bone, M.plain);
  }, mat));
  // Neck chain
  const neck = [];
  let parent = body, off = new THREE.Vector3(0, 0.06, 0.38);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    g.position.copy(off);
    parent.add(g);
    const r0 = 0.13 - i * 0.013, r1 = r0 - 0.013;
    g.add(mesh(k => {
      k.push().rot(Math.PI / 2, 0, 0); k.cyl(0, 0, 0, r0, r1, 0.15, 8, C, M.scales); k.pop();
      k.cone(0, r0 * 0.8, 0.07, 0.022, 0.06, 4, bone, M.plain);
      k.push().rot(Math.PI / 2, 0, 0); k.cyl(0, 0.0, -r0 * 0.45, r0 * 0.7, r1 * 0.7, 0.15, 5, B, M.skin, { top: false }); k.pop();
    }, mat));
    neck.push(g);
    parent = g; off = new THREE.Vector3(0, 0, 0.14);
  }
  // Head with jaw
  const head = new THREE.Group();
  head.position.set(0, 0, 0.14);
  parent.add(head);
  head.add(mesh(k => {
    k.blob(0, 0.02, 0.08, 0.085, 0.07, 0.11, C, M.scales, 1, 0.05, 5, true);
    k.box(0, 0.0, 0.2, 0.09, 0.05, 0.15, C, M.scales);
    k.box(0, 0.04, 0.24, 0.05, 0.012, 0.1, bone, M.plain);
    for (const s of [-1, 1]) {
      k.push().at(s * 0.045, 0.06, 0.02).rot(-2.3, 0, s * 0.3); k.cone(0, 0, 0, 0.018, 0.16, 5, horn, M.plain); k.pop();
      k.push().at(s * 0.06, 0.03, -0.02).rot(-1.9, 0, s * 0.9); k.cone(0, 0, 0, 0.012, 0.09, 4, horn, M.plain); k.pop();
      k.box(s * 0.05, 0.045, 0.14, 0.012, 0.014, 0.02, eye, M.fire);
      k.box(s * 0.025, 0.005, 0.27, 0.01, 0.01, 0.005, col(0x1a1a1a), M.plain);
      for (let t = 0; t < 4; t++) k.cone(s * 0.035, -0.02, 0.15 + t * 0.03, 0.005, -0.02, 3, horn, M.plain);
    }
  }, mat));
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.02, 0.1);
  head.add(jaw);
  jaw.add(mesh(k => { k.box(0, -0.03, 0.09, 0.07, 0.02, 0.14, B, M.skin); for (const s of [-1, 1]) for (let t = 0; t < 4; t++) k.cone(s * 0.03, -0.012, 0.05 + t * 0.03, 0.005, 0.018, 3, horn, M.plain); }, mat));
  // Tail chain
  const tail = [];
  parent = body; off = new THREE.Vector3(0, 0.02, -0.4);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    g.position.copy(off);
    parent.add(g);
    const r0 = 0.12 - i * 0.011, r1 = Math.max(0.012, r0 - 0.011);
    g.add(mesh(k => {
      k.push().rot(-Math.PI / 2, 0, 0); k.cyl(0, 0, 0, r0, r1, 0.17, 7, C, M.scales); k.pop();
      k.cone(0, r0 * 0.8, -0.08, 0.02, 0.05, 4, bone, M.plain);
      if (i === 9) { k.tri([0, 0, -0.17], [0.07, 0, -0.26], [0, 0, -0.34], bone, M.plain); k.tri([0, 0, -0.17], [-0.07, 0, -0.26], [0, 0, -0.34], bone, M.plain); }
    }, mat));
    tail.push(g);
    parent = g; off = new THREE.Vector3(0, 0, -0.16);
  }
  // Wings: shoulder -> upper (arm + membrane) -> elbow -> lower (fingers + membrane)
  const wings = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.14, 0.12, 0.16);
    body.add(shoulder);
    shoulder.add(mesh(k => {
      k.box(s * 0.28, -0.015, 0, 0.56, 0.04, 0.04, bone, M.scales);
      const inner = [[0.56, 0.0], [0.45, -0.3], [0.3, -0.42], [0.15, -0.36], [0.0, -0.38]];
      for (let i = 0; i < inner.length - 1; i++) {
        const [x0, z0] = inner[i], [x1, z1] = inner[i + 1];
        k.tri([0, 0, 0.05], [s * x0, 0, z0], [s * x1, 0, z1], W, M.cloth);
        k.tri([0, 0, 0.05], [s * x1, 0, z1], [s * x0, 0, z0], W, M.cloth);
      }
    }, mat));
    const elbow = new THREE.Group();
    elbow.position.set(s * 0.56, 0, 0);
    shoulder.add(elbow);
    elbow.add(mesh(k => {
      const tips = [[0.78, -0.08], [0.7, -0.4], [0.48, -0.62], [0.2, -0.6], [0.0, -0.44]];
      for (const [x, z] of tips) {
        k.tri([0, 0.004, 0], [s * x, 0.004, z], [s * x * 0.98, -0.004, z], bone, M.skin);
      }
      const pts = [[0, 0.0]].concat(tips);
      for (let i = 1; i < pts.length; i++) {
        const [x, z] = pts[i];
        // Scalloped trailing edge between finger tips.
        const [px, pz] = pts[i - 1];
        const mx = (px + x) / 2 * 0.82, mz = (pz + z) / 2 * 0.82;
        k.tri([0, 0, 0], [s * px, 0, pz], [s * mx, 0, mz], W, M.cloth);
        k.tri([0, 0, 0], [s * mx, 0, mz], [s * px, 0, pz], W, M.cloth);
        k.tri([0, 0, 0], [s * mx, 0, mz], [s * x, 0, z], W, M.cloth);
        k.tri([0, 0, 0], [s * x, 0, z], [s * mx, 0, mz], W, M.cloth);
      }
      k.box(s * 0.32, 0, -0.02, 0.64, 0.025, 0.025, bone, M.skin);
      k.cone(s * 0.02, 0, 0.03, 0.02, 0.08, 4, horn, M.plain);
    }, mat));
    wings.push({ s, shoulder, elbow });
  }
  // Legs
  const legs = [];
  for (const [x, z] of [[-0.12, 0.2], [0.12, 0.2], [-0.13, -0.25], [0.13, -0.25]]) {
    const g = new THREE.Group();
    g.position.set(x, -0.08, z);
    body.add(g);
    g.add(mesh(k => {
      k.cyl(0, -0.2, 0, 0.035, 0.05, 0.2, 6, C, M.skin);
      k.box(0, -0.22, 0.03, 0.06, 0.03, 0.08, C, M.skin);
      for (let t = -1; t <= 1; t++) k.cone(t * 0.02, -0.225, 0.08, 0.008, 0.03, 3, horn, M.plain);
    }, mat));
    legs.push(g);
  }
  return { root, body, neck, head, jaw, tail, wings, legs };
}

export class Dragons {
  constructor(scene, world, fx) {
    this.world = world; this.fx = fx;
    this.list = [];
    const mat = makeKitMaterial({ key: 'dragon', side: THREE.DoubleSide, rim: 0.7 });
    for (const def of DRAGONS) {
      const rig = buildDragon(def, mat);
      rig.root.scale.setScalar(def.size * 1.3);
      scene.add(rig.root);
      const d = { def, rig, name: def.name, pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0),
        state: 'fly', stateT: 0, fireT: 20 + Math.random() * 30, breathing: 0, roarT: 0, bank: 0, lastPos: null, flap: Math.random() * 6 };
      if (def.center) {
        d.C = latLonToDir(def.center[0], def.center[1]);
        const tf = tangentFrame(d.C); d.Ce = tf.east; d.Cn = tf.north;
        d.rad = def.radius * Math.PI / 180 * R;
      }
      if (def.perch) {
        d.P = latLonToDir(def.perch[0], def.perch[1]);
        d.perchH = Math.max(0.2, world.field.height(d.P[0], d.P[1], d.P[2]));
      }
      if (def.behavior === 'voyage') {
        const tilt = def.tilt * Math.PI / 180, node = def.node * Math.PI / 180;
        d.U = new THREE.Vector3(Math.cos(node), 0, -Math.sin(node));
        d.W = new THREE.Vector3(0, 1, 0).applyAxisAngle(d.U, 0).clone();
        const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(d.U, tilt);
        d.W = new THREE.Vector3().crossVectors(n, d.U).normalize();
      }
      this.list.push(d);
    }
  }

  // Position on the flight path at sim time t.
  flightPoint(d, t, out) {
    const def = d.def;
    if (def.behavior === 'voyage') {
      const a = t * (2 * Math.PI / 420);
      const prec = t * 0.00035;
      const U = d.U.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), prec), W = d.W.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), prec);
      const dir = U.multiplyScalar(Math.cos(a)).addScaledVector(W, Math.sin(a)).normalize();
      return out.copy(dir).multiplyScalar(R + def.alt + 1.2 * Math.sin(t * 0.07));
    }
    const speed = 1.1;
    const a = (t * speed) / d.rad;
    const wob = 1 + 0.18 * Math.sin(t * 0.05);
    const x = Math.cos(a) * d.rad * wob, y = Math.sin(a) * d.rad * (0.8 + 0.2 * Math.cos(t * 0.03));
    const p = [d.C[0] + (d.Ce[0] * x + d.Cn[0] * y) / R, d.C[1] + (d.Ce[1] * x + d.Cn[1] * y) / R, d.C[2] + (d.Ce[2] * x + d.Cn[2] * y) / R];
    const l = Math.hypot(p[0], p[1], p[2]);
    const g = Math.max(0, this.world.field.height(p[0] / l, p[1] / l, p[2] / l));
    const h = Math.max(def.alt * 0.75, g + 2.5) + 1.0 * Math.sin(t * 0.11);
    return out.set(p[0] / l, p[1] / l, p[2] / l).multiplyScalar(R + h);
  }

  perchPoint(d, out) { return out.set(d.P[0], d.P[1], d.P[2]).multiplyScalar(R + d.perchH + 0.26 * d.def.size); }

  update(dt, simT, clock, cameraPos) {
    for (const d of this.list) this.step(d, dt, simT, clock, cameraPos);
  }

  step(d, dt, t, clock, cameraPos) {
    const def = d.def;
    const target = new THREE.Vector3();
    // Behaviour cycle: fly ~3 min, land, rest ~1 min, take off. Nocturnal dragons rest by day.
    let mode = 'fly', k = 0;
    if (def.behavior !== 'voyage' && d.P) {
      const cycle = 260, landT = 18, restT = 70;
      let u = (t + def.size * 97) % cycle;
      const flyT = cycle - landT * 2 - restT;
      let resting = false;
      if (def.nocturnal && clock) {
        const [, lon] = dirToLatLon(d.P);
        const h = clock.hourAt(lon);
        resting = h > 6.5 && h < 19;
      }
      if (resting) { mode = 'rest'; }
      else if (u < flyT) mode = 'fly';
      else if (u < flyT + landT) { mode = 'land'; k = (u - flyT) / landT; }
      else if (u < flyT + landT + restT) mode = 'rest';
      else { mode = 'takeoff'; k = (u - flyT - landT - restT) / landT; }
    }
    const fp = this.flightPoint(d, t, new THREE.Vector3());
    const pp = d.P ? this.perchPoint(d, new THREE.Vector3()) : fp;
    if (mode === 'fly') target.copy(fp);
    else if (mode === 'rest') target.copy(pp);
    else {
      const e = k * k * (3 - 2 * k);
      const from = mode === 'land' ? fp : pp, to = mode === 'land' ? pp : this.flightPoint(d, t + 18, new THREE.Vector3());
      target.copy(from).lerp(to, e);
      target.addScaledVector(target.clone().normalize(), Math.sin(Math.PI * e) * 1.5);
    }
    if (!d.lastPos) d.lastPos = target.clone();
    const vel = target.clone().sub(d.lastPos).divideScalar(Math.max(1e-4, dt));
    d.lastPos.copy(target);
    d.pos.copy(target);
    const up = target.clone().normalize();
    // Heading from velocity (or look around while perched)
    let fwd;
    if (mode === 'rest') {
      const a = t * 0.2;
      const tf = tangentFrame([up.x, up.y, up.z]);
      fwd = new THREE.Vector3(...tf.north).multiplyScalar(Math.cos(a * 0.3)).addScaledVector(new THREE.Vector3(...tf.east), Math.sin(a * 0.3));
    } else {
      fwd = vel.clone().addScaledVector(up, -vel.dot(up));
      if (fwd.lengthSq() < 1e-8) fwd.copy(d.fwd);
      fwd.normalize();
    }
    // Smooth heading and bank into turns.
    const prevF = d.fwd.clone();
    d.fwd.lerp(fwd, 1 - Math.exp(-dt * 3)).normalize();
    const turn = prevF.clone().cross(d.fwd).dot(up) / Math.max(1e-4, dt);
    d.bank += (THREE.MathUtils.clamp(-turn * 0.6, -0.7, 0.7) - d.bank) * (1 - Math.exp(-dt * 2));
    const right = new THREE.Vector3().crossVectors(up, d.fwd).normalize();
    const f = d.fwd.clone().addScaledVector(up, -d.fwd.dot(up)).normalize();
    const climb = mode === 'fly' ? THREE.MathUtils.clamp(vel.dot(up) * 0.4, -0.4, 0.4) : 0;
    const m = new THREE.Matrix4().makeBasis(right, up, f);
    const rig = d.rig;
    rig.root.quaternion.setFromRotationMatrix(m);
    rig.root.rotateZ(mode === 'rest' ? 0 : d.bank);
    rig.root.rotateX(-climb);
    rig.root.position.copy(target);
    rig.root.updateMatrixWorld();

    // Wings, neck, tail, legs
    const flying = mode !== 'rest';
    const glide = flying && Math.sin(t * 0.25 + def.size * 3) > 0.35 && mode === 'fly';
    d.flap += dt * (glide ? 1.2 : mode === 'takeoff' ? 7 : 4.2);
    const fl = glide ? 0.12 * Math.sin(d.flap) : Math.sin(d.flap);
    for (const w of rig.wings) {
      if (flying) {
        w.shoulder.rotation.set(0, 0, w.s * (0.15 + 0.75 * fl));
        w.elbow.rotation.set(0, 0, w.s * (0.25 + 0.55 * Math.sin(d.flap - 0.8)) * (glide ? 0.2 : 1));
      } else {
        w.shoulder.rotation.set(0.2, w.s * 0.9, w.s * -0.95);
        w.elbow.rotation.set(0, w.s * 0.2, w.s * -2.3);
      }
    }
    const breathing = d.breathing > 0;
    rig.neck.forEach((g, i) => {
    if (!g) return;
      if (flying) g.rotation.set(-0.08 + 0.05 * Math.sin(t * 1.3 - i * 0.5), 0.06 * Math.sin(t * 0.9 - i * 0.4), 0);
      else g.rotation.set(-0.28 + (breathing ? 0.05 : 0.04 * Math.sin(t * 0.8 - i * 0.4)), 0.12 * Math.sin(t * 0.35 - i * 0.2), 0);
    });
    rig.head.rotation.set(flying ? 0.1 : 0.55 + (breathing ? -0.4 : 0), 0, 0);
    rig.jaw.rotation.x = breathing ? 0.5 : 0.03 + 0.03 * Math.sin(t * 2);
    rig.tail.forEach((g, i) => g.rotation.set(flying ? 0.02 : -0.08 * (i < 3 ? 1 : -0.5), 0.14 * Math.sin(t * 1.3 - i * 0.55), 0));
    for (const L of rig.legs) L.rotation.x = flying ? 1.1 : 0.0;

    // Fire breath
    d.fireT -= dt;
    if (d.fireT <= 0 && !breathing) {
      d.fireT = mode === 'rest' ? 18 + Math.random() * 25 : 35 + Math.random() * 45;
      d.breathing = 2.4;
      d.roar = true;
    }
    if (d.breathing > 0) {
      d.breathing -= dt;
      const mouth = new THREE.Vector3(0, -0.01, 0.3).applyMatrix4(rig.head.matrixWorld);
      const dir = new THREE.Vector3(0, -0.15, 1).transformDirection(rig.head.matrixWorld).normalize();
      const s = def.size * 1.3;
      const gold = def.id === 'aurum', frost = def.id === 'skarn', shadow = def.id === 'nyxmaw', verd = def.id === 'verdigris';
      const color = frost ? [0.8, 1.6, 2.6] : shadow ? [1.4, 0.5, 2.2] : verd ? [0.8, 2.4, 0.9] : null;
      if (this.fx) {
        if (color) this.fx.emit('magic', mouth, dir.clone().multiplyScalar(3.2 * s), 6, 0.9 * s, 0.1 * s, 0.9, color);
        else this.fx.emit('fire', mouth, dir.clone().multiplyScalar(3.4 * s), 7, 0.9 * s, gold ? 0.11 * s : 0.1 * s, 0.85);
        if (Math.random() < 0.3) this.fx.emit('smoke', mouth.clone().addScaledVector(dir, 1.5 * s), dir.clone().multiplyScalar(0.8), 1, 0.3, 0.25 * s, 3);
      }
    }
  }
}
