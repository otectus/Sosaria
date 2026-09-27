// Short-lived CPU particles for events: dragon fire, burning roofs, magic bursts, sparks and dust.

import * as THREE from 'three';
import { U } from './shared.js';

const MAX = 3000;

export class FX {
  constructor(scene) {
    this.p = [];
    this.free = [];
    this.alpha = [];
    this.up = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.cursor = 0;
    this.systems = {};
    for (const [name, additive] of [['add', true], ['alpha', false]]) {
      const quad = new THREE.PlaneGeometry(2, 2);
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index;
      g.setAttribute('position', quad.attributes.position);
      const pos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const colr = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const shape = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', pos);
      g.setAttribute('iCol', colr);
      g.setAttribute('iShape', shape);
      g.instanceCount = 0;
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U },
        transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: /* glsl */`
          attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iShape;
          varying vec4 vC; varying vec2 vQ; varying vec2 vShape;
          void main() {
            vC = iCol; vQ = position.xy;
            vShape = iShape.xw;
            vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
            vec2 corner = position.xy * vec2(iShape.z, 1.0);
            float c = cos(iShape.y), s = sin(iShape.y);
            mv.xy += mat2(c, s, -s, c) * corner * iPos.w;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          varying vec4 vC; varying vec2 vQ; varying vec2 vShape;
          void main() {
            float r = dot(vQ, vQ);
            if (r > 1.0) discard;
            float soft = (1.0 - r) * (1.0 - r);
            vec3 color = vC.rgb;
            if (vShape.x < 0.5) {
              // Warm flame envelope with a small incandescent core.
              color = mix(color, vec3(5.0, 3.4, 1.1), exp(-r * 12.0) * 0.55);
            } else if (vShape.x > 2.5) {
              // Broad overlapping lobes give smoke and dust a rolling, soft silhouette.
              float billow = 0.72 + 0.28 * sin(vQ.x * 7.0 + vShape.y) * cos(vQ.y * 6.0 - vShape.y);
              soft *= billow;
              color *= 0.85 + 0.2 * vQ.y;
            } else if (vShape.x > 1.5) {
              float rays = pow(max(0.0, 1.0 - abs(vQ.x * vQ.y) * 16.0), 4.0);
              soft = mix(soft, rays * (1.0 - r), 0.4);
            }
            gl_FragColor = vec4(color, vC.a * soft);
          }`,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = additive ? 11 : 10;
      scene.add(mesh);
      this.systems[name] = { mesh, pos, colr, shape, g };
    }
  }

  // kind: 'fire' | 'smoke' | 'spark' | 'magic' | 'dust'
  emit(kind, pos, vel, n = 1, spread = 0.1, size = 0.05, life = 1.5, color = null) {
    for (let i = 0; i < n; i++) {
      let q;
      if (this.p.length >= MAX) q = this.p[this.cursor++ % MAX];
      else {
        q = this.free.pop() || { x: new THREE.Vector3(), v: new THREE.Vector3() };
        this.p.push(q);
      }
      q.kind = kind; q.x.copy(pos); q.v.copy(vel);
      q.v.x += (Math.random() - 0.5) * spread;
      q.v.y += (Math.random() - 0.5) * spread;
      q.v.z += (Math.random() - 0.5) * spread;
      q.age = 0; q.life = Math.max(0.001, life * (0.7 + Math.random() * 0.6));
      q.size = size * (0.7 + Math.random() * 0.6); q.color = color;
      q.seed = Math.random() * Math.PI * 2;
    }
  }

  update(dt, camera = null) {
    const add = this.systems.add, alpha = this.systems.alpha;
    let na = 0, nb = 0;
    let live = 0;
    this.alpha.length = 0;
    for (const q of this.p) {
      q.age += dt;
      if (q.age > q.life) { this.free.push(q); continue; }
      this.p[live++] = q;
      const up = this.up.copy(q.x).normalize();
      const k = q.age / q.life;
      if (q.kind === 'smoke') { q.v.addScaledVector(up, dt * 0.05); q.v.multiplyScalar(1 - dt * 0.8); }
      else if (q.kind === 'fire') { q.v.multiplyScalar(1 - dt * 1.6); q.v.addScaledVector(up, dt * 0.2); }
      else if (q.kind === 'spark') q.v.addScaledVector(up, -dt * 0.6);
      else if (q.kind === 'magic') q.v.multiplyScalar(1 - dt * 1.2);
      else q.v.multiplyScalar(1 - dt * 2);
      q.x.addScaledVector(q.v, dt);
      let r, g, b, a, s = q.size;
      if (q.kind === 'fire') { r = 4.2 - k * 2; g = 1.6 - k * 1.3; b = 0.35 - k * 0.3; a = 1 - k; s *= 1 + k * 2.5; }
      else if (q.kind === 'spark') { r = 4; g = 2.4; b = 0.6; a = 1 - k; }
      else if (q.kind === 'magic') { const c = q.color || [0.4, 1.8, 2.4]; r = c[0]; g = c[1]; b = c[2]; a = Math.sin(k * Math.PI); s *= 1 + k; }
      else if (q.kind === 'smoke') { r = g = b = 0.25 + k * 0.2; a = (1 - k) * 0.55 * Math.min(1, k * 6); s *= 1 + k * 3; }
      else { r = 0.55; g = 0.48; b = 0.38; a = (1 - k) * 0.4; s *= 1 + k * 2; }
      const additive = q.kind === 'fire' || q.kind === 'spark' || q.kind === 'magic';
      q.r = r; q.g = g; q.b = b; q.a = a; q.s = s;
      if (additive) this.write(add, na++, q, camera);
      else {
        q.distance = q.x.distanceToSquared(camera?.position || U.uCamPos.value);
        this.alpha.push(q);
      }
    }
    this.p.length = live;
    // Alpha smoke must blend back to front; additive effects need no sorting.
    this.alpha.sort((a, b) => b.distance - a.distance);
    for (const q of this.alpha) this.write(alpha, nb++, q, camera);
    for (const [sys, n] of [[add, na], [alpha, nb]]) {
      sys.g.instanceCount = n;
      sys.mesh.visible = n > 0;
      for (const attr of [sys.pos, sys.colr, sys.shape]) {
        attr.clearUpdateRanges();
        if (n) { attr.addUpdateRange(0, n * 4); attr.needsUpdate = true; }
      }
    }
  }

  write(sys, i, q, camera) {
    sys.pos.setXYZW(i, q.x.x, q.x.y, q.x.z, q.s);
    sys.colr.setXYZW(i, q.r, q.g, q.b, q.a);
    const kind = q.kind === 'fire' ? 0 : q.kind === 'spark' ? 1 : q.kind === 'magic' ? 2 : 3;
    let angle = q.seed + q.age * 0.2;
    if (kind === 1 && camera) {
      this.velocity.copy(q.v).transformDirection(camera.matrixWorldInverse);
      angle = Math.atan2(this.velocity.y, this.velocity.x);
    }
    sys.shape.setXYZW(i, kind, angle, kind === 1 ? 2.8 : 1, q.seed + q.age * 0.4);
  }
}
