// Clouds and weather. Fair-weather cumulus drift on latitude winds and grow/fade on their own
// cycles; storm cells roam with anvils, rain and lightning. All motion is evaluated on the GPU.

import * as THREE from 'three';
import { GLSL_COMMON, U, patchDepthMaterial } from './shared.js';
import { latLonToDir, PLANET_RADIUS } from '../core/sphere.js';
import { mulberry32 } from '../core/noise.js';
import { STORMS, stormAt } from '../sim/weather.js';

const R = PLANET_RADIUS;

export function stormState(k, t, out = new THREE.Vector4()) {
  const s = stormAt(k, t);
  return out.set(...s.dir, s.intensity);
}

const CLOUD_VERT_HEAD = /* glsl */`
attribute vec3 aP0;
attribute vec4 aInfo;   // radius, angular speed, phase, storm index (-1 = fair weather)
attribute vec3 aLocal;  // storm-relative offset (east, north, height)
uniform float uCloudT;
uniform float uCover;
varying float vShade;
varying float vStorm;
varying float vFade;

vec3 cloudWorld(vec3 pos, out vec3 nrm) {
  float storm = aInfo.w;
  float rad = aInfo.x;
  vec3 center;
  vShade = fract(aInfo.z * 13.7);
  vStorm = 0.0;
  if (storm < -0.5) {
    float ang = aInfo.y * uCloudT;
    float c = cos(ang), s = sin(ang);
    center = vec3(c * aP0.x + s * aP0.z, aP0.y, -s * aP0.x + c * aP0.z);
    float cyc = 0.5 + 0.5 * sin(uCloudT * 0.0018 * (0.6 + fract(aInfo.z * 7.31)) + aInfo.z * 6.2831);
    float cov = smoothstep(0.3, 0.62, cyc + (uCover - 0.5) * 0.9);
    rad *= cov;
  } else {
    vec4 st = uStorms[int(storm + 0.5)];
    vec3 up0 = st.xyz;
    vec3 tx0 = normalize(cross(up0, abs(up0.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 ty0 = cross(up0, tx0);
    center = up0 * (${R.toFixed(1)} + aLocal.z) + tx0 * aLocal.x + ty0 * aLocal.y;
    rad *= smoothstep(0.0, 0.5, st.w) * (0.7 + 0.3 * st.w);
    vStorm = st.w;
  }
  vec3 up = normalize(center);
  vec3 tx = normalize(cross(up, abs(up.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 ty = cross(tx, up); // right-handed (tx, up, ty) keeps the triangle winding outward
  vec3 p = pos;
  if (p.y < -0.25) p.y = -0.25 + (p.y + 0.25) * 0.25; // flat bases
  float dc = distance(center, uCamPos);
  vFade = smoothstep(rad * 1.1, rad * 2.6 + 0.4, dc);
  nrm = normalize(tx * pos.x + up * pos.y + ty * pos.z);
  return center + (tx * p.x + up * p.y * 0.78 + ty * p.z) * rad;
}
`;

export class Clouds {
  constructor(scene) {
    const rnd = mulberry32(2024);
    const P0 = [], INFO = [], LOC = [];
    const addPuff = (p, rad, speed, phase, storm, local) => {
      P0.push(p[0], p[1], p[2]); INFO.push(rad, speed, phase, storm); LOC.push(local[0], local[1], local[2]);
    };
    // Fair-weather clusters.
    for (let c = 0; c < 440; c++) {
      let lat;
      const u = rnd();
      if (u < 0.3) lat = (rnd() - 0.5) * 24;
      else if (u < 0.8) lat = (rnd() < 0.5 ? -1 : 1) * (35 + rnd() * 25);
      else lat = (rnd() - 0.5) * 150;
      const lon = rnd() * 360 - 180;
      const al = Math.abs(lat);
      const speed = (al < 28 ? -0.00022 : al < 62 ? 0.00028 : -0.00015) * (0.7 + rnd() * 0.6);
      const alt = 7.2 + rnd() * 2.4;
      const size = 1.0 + rnd() * rnd() * 3.4;
      const d = latLonToDir(lat, lon);
      const up = new THREE.Vector3(...d);
      const tx = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
      if (tx.lengthSq() < 0.5) tx.set(1, 0, 0);
      const ty = new THREE.Vector3().crossVectors(up, tx);
      const n = 5 + Math.floor(rnd() * 9);
      const phase = rnd();
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = (i === 0 ? 0 : 0.35 + rnd() * 0.65) * size;
        const x = Math.cos(a) * r * 1.3, y = Math.sin(a) * r;
        const rad = size * (i === 0 ? 0.75 : 0.35 + rnd() * 0.35) * (1 - r / (size * 2.2));
        const h = alt + rad * 0.35 + (i === 0 ? 0.2 : 0);
        const p = up.clone().multiplyScalar(R + h).addScaledVector(tx, x).addScaledVector(ty, y);
        addPuff([p.x, p.y, p.z], Math.max(0.2, rad), speed, phase + i * 0.001, -1, [0, 0, 0]);
      }
    }
    // Storm cells: tall towers with wide anvils.
    for (let k = 0; k < STORMS.length; k++) {
      for (let i = 0; i < 30; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 3.2;
        const tower = i < 18;
        const z = tower ? 5.6 + rnd() * 3.2 : 9.6 + rnd() * 0.8;
        const rad = tower ? 1.0 + rnd() * 0.9 : 1.2 + rnd() * 0.8;
        const rr = tower ? r : 1.5 + rnd() * 3.2;
        addPuff([0, 0, 0], rad, 0, rnd(), k, [Math.cos(a) * rr * 1.2, Math.sin(a) * rr, z]);
      }
    }
    const base = new THREE.IcosahedronGeometry(1, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('normal', base.attributes.normal);
    g.setAttribute('aP0', new THREE.InstancedBufferAttribute(new Float32Array(P0), 3));
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(INFO), 4));
    g.setAttribute('aLocal', new THREE.InstancedBufferAttribute(new Float32Array(LOC), 3));
    g.instanceCount = P0.length / 3;
    this.uniforms = { uCloudT: { value: 0 }, uCover: { value: 0.55 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, ...this.uniforms },
      transparent: true,
      depthWrite: true,
      vertexShader: /* glsl */`
        ${GLSL_COMMON}
        ${CLOUD_VERT_HEAD}
        varying vec3 vN; varying vec3 vWorldPos;
        void main() {
          vec3 n;
          vec3 wp = cloudWorld(position, n);
          vN = n; vWorldPos = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        ${GLSL_COMMON}
        varying vec3 vN; varying vec3 vWorldPos; varying float vShade; varying float vStorm; varying float vFade;
        void main() {
          vec3 N = normalize(vN);
          vec3 up = normalize(vWorldPos);
          vec3 V = normalize(uCamPos - vWorldPos);
          float s = dot(up, uSunDir);
          float sunVis = smoothstep(-0.16, 0.02, s);
          vec3 sunC = sunTint(s + 0.06) * sunVis;
          float wrap = dot(N, uSunDir) * 0.5 + 0.5;
          float lit = smoothstep(0.15, 0.95, wrap);
          float under = smoothstep(-0.2, 0.6, dot(N, up));
          vec3 amb = skyAmbient(N, vWorldPos) * (0.55 + 0.45 * under);
          vec3 base = mix(vec3(1.0), vec3(0.42, 0.44, 0.5), vStorm);
          base *= 0.93 + 0.1 * vShade;
          vec3 col = base * (amb * 0.8 + sunC * (0.25 + 0.95 * lit));
          // Silver lining when backlit.
          float back = pow(max(0.0, dot(-V, uSunDir)), 4.0);
          float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          col += sunC * rim * back * 1.8;
          // Moonlight
          float mv = smoothstep(-0.1, 0.05, dot(up, uMoonDir));
          col += vec3(0.08, 0.1, 0.16) * mv * uMoonLight * (dot(N, uMoonDir) * 0.5 + 0.5);
          if (uFlash.w > 0.0) col += vec3(1.6, 1.7, 2.2) * uFlash.w * (1.0 - smoothstep(0.0, 0.0035, 1.0 - dot(up, uFlash.xyz))) * (0.5 + 0.5 * vStorm);
          float edge = smoothstep(0.02, 0.4, dot(N, V));
          gl_FragColor = vec4(col, edge * vFade);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = patchDepthMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), {
      key: 'clouds', uniforms: this.uniforms, vertexHead: CLOUD_VERT_HEAD,
      vertexTransform: `{ vec3 nn; transformed = cloudWorld(position, nn); }`,
    });
    scene.add(this.mesh);
    this.count = g.instanceCount;

    this.rain = this.makeRain(scene);
    this.bolt = this.makeBolt(scene);
    this.flash = 0;
    this.nextStrike = [3, 5, 7, 9];
    this.storms = STORMS.map(() => new THREE.Vector4());
    this.strikes = [];
  }

  makeRain(scene) {
    const n = STORMS.length * 1800;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    const a = new Float32Array(n * 4);
    const rnd = mulberry32(77);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(rnd()) * 3.4, ang = rnd() * Math.PI * 2;
      a[i * 4] = Math.floor(i / 1800); a[i * 4 + 1] = Math.cos(ang) * r * 1.2; a[i * 4 + 2] = Math.sin(ang) * r; a[i * 4 + 3] = rnd();
    }
    g.setAttribute('aRain', new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        ${GLSL_COMMON}
        attribute vec4 aRain;
        varying float vA; varying vec2 vQ;
        void main() {
          vec4 st = uStorms[int(aRain.x + 0.5)];
          vec3 up0 = st.xyz;
          vec3 tx = normalize(cross(up0, abs(up0.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 ty = cross(up0, tx);
          float H = 6.0;
          float h = H - mod(uTime * 5.5 + aRain.w * H, H);
          vec3 base = up0 * ${R.toFixed(1)} + tx * aRain.y + ty * aRain.z;
          vec3 up = normalize(base);
          vec3 p = up * (${R.toFixed(1)} + h) + (tx * aRain.y + ty * aRain.z) * 0.0;
          p = base + up * h;
          float dc = distance(p, uCamPos);
          float vis = st.w * (1.0 - smoothstep(10.0, 28.0, dc)) * smoothstep(0.1, 0.6, h);
          vA = vis * 0.35; vQ = position.xy;
          vec3 side = normalize(cross(up, uCamPos - p));
          vec3 wp = p + side * position.x * 0.006 * (1.0 + dc * 0.02) + up * position.y * 0.22;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          if (vis <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vA; varying vec2 vQ;
        void main() { gl_FragColor = vec4(vec3(0.7, 0.75, 0.82), vA * (1.0 - abs(vQ.x) * 2.0)); }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 7;
    scene.add(m);
    return m;
  }

  makeBolt(scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3 * 6), 3));
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 7, 10), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.visible = false;
    m.renderOrder = 8;
    scene.add(m);
    return m;
  }

  strike(st, field, camPos) {
    const up0 = new THREE.Vector3(st.x, st.y, st.z);
    const tx = new THREE.Vector3().crossVectors(up0, new THREE.Vector3(0, 1, 0)).normalize();
    const ty = new THREE.Vector3().crossVectors(up0, tx);
    const a = Math.random() * Math.PI * 2, r = Math.random() * 2.6;
    const ground = up0.clone().multiplyScalar(R).addScaledVector(tx, Math.cos(a) * r).addScaledVector(ty, Math.sin(a) * r);
    const gdir = ground.clone().normalize();
    const gh = Math.max(0, field.height(gdir.x, gdir.y, gdir.z));
    const bottom = gdir.clone().multiplyScalar(R + gh);
    const top = gdir.clone().multiplyScalar(R + 6.5);
    // Jagged path
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = top.clone().lerp(bottom, t);
      if (i > 0 && i < N) p.addScaledVector(tx, (Math.random() - 0.5) * 0.5).addScaledVector(ty, (Math.random() - 0.5) * 0.5);
      pts.push(p);
    }
    const pos = this.bolt.geometry.attributes.position.array;
    const view = camPos.clone();
    let o = 0;
    for (let i = 0; i < N; i++) {
      const a0 = pts[i], a1 = pts[i + 1];
      const dirv = a1.clone().sub(a0);
      const side = dirv.clone().cross(view.clone().sub(a0)).normalize().multiplyScalar(0.035 + 0.004 * a0.distanceTo(view) * 0.02);
      const q = [a0.clone().add(side), a0.clone().sub(side), a1.clone().add(side), a1.clone().sub(side)];
      for (const p of [q[0], q[1], q[2], q[2], q[1], q[3]]) { pos[o++] = p.x; pos[o++] = p.y; pos[o++] = p.z; }
    }
    for (; o < pos.length; o++) pos[o] = 0;
    this.bolt.geometry.attributes.position.needsUpdate = true;
    this.bolt.geometry.computeBoundingSphere();
    this.bolt.visible = true;
    this.flash = 1;
    U.uFlash.value.set(gdir.x, gdir.y, gdir.z, 1);
    this.strikes.push({ p: bottom, t: performance.now() });
    return bottom;
  }

  update(dt, gameSeconds, cover, field, camPos) {
    this.uniforms.uCloudT.value = gameSeconds;
    this.uniforms.uCover.value = cover;
    let stormNear = 0;
    for (let k = 0; k < STORMS.length; k++) {
      stormState(k, gameSeconds, this.storms[k]);
      U.uStorms.value[k].copy(this.storms[k]);
      const st = this.storms[k];
      if (st.w > 0.5) {
        this.nextStrike[k] -= dt;
        if (this.nextStrike[k] <= 0) {
          this.nextStrike[k] = 1.5 + Math.random() * 5;
          this.strike(st, field, camPos);
        }
      }
      const d = new THREE.Vector3(st.x, st.y, st.z).multiplyScalar(R).distanceTo(camPos);
      stormNear = Math.max(stormNear, st.w * (1 - THREE.MathUtils.smoothstep(d, 6, 22)));
    }
    this.stormNear = stormNear;
    if (this.flash > 0) {
      this.flash -= dt * 4;
      const f = Math.max(0, this.flash);
      U.uFlash.value.w = f * (0.6 + 0.4 * Math.sin(this.flash * 60));
      this.bolt.material.opacity = Math.min(1, f * 1.5);
      if (this.flash <= 0) { this.bolt.visible = false; U.uFlash.value.w = 0; }
    }
  }
}
