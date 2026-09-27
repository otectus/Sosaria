// Ocean surface (per terrain chunk patches), plus the shared water shading used by rivers and lakes.

import * as THREE from 'three';
import { GLSL_COMMON, U } from './shared.js';
import { faceUVToDir, PLANET_RADIUS } from '../core/sphere.js';

const R = PLANET_RADIUS;

export const WATER_GLSL = /* glsl */`
// Directional ripples in world space; returns the tangential slope vector.
vec3 waveSlope(vec3 wp, vec3 up, float t, float amp, float fineK) {
  vec3 g = vec3(0.0);
  vec3 k1 = vec3(2.1, 0.7, 1.3), k2 = vec3(-1.3, 2.4, 0.9), k3 = vec3(0.8, -1.1, 2.6), k4 = vec3(-2.7, -0.6, 1.1);
  g += k1 * cos(dot(k1, wp) * 1.0 + t * 1.3) * 0.35;
  g += k2 * cos(dot(k2, wp) * 1.3 + t * 1.7) * 0.25;
  g += k3 * cos(dot(k3, wp) * 2.9 + t * 2.3) * 0.12 * fineK;
  g += k4 * cos(dot(k4, wp) * 4.7 + t * 3.1) * 0.08 * fineK;
  vec3 k5 = vec3(5.3, 3.1, -4.2), k6 = vec3(-4.4, 6.1, 2.2);
  g += k5 * cos(dot(k5, wp) * 3.1 + t * 4.3) * 0.03 * fineK;
  g += k6 * cos(dot(k6, wp) * 3.7 + t * 5.1) * 0.025 * fineK;
  g -= up * dot(g, up);
  return g * amp;
}

vec3 skyColorFor(vec3 dir, vec3 up) {
  float s = dot(up, uSunDir);
  float day = smoothstep(-0.2, 0.25, s);
  float el = max(0.0, dot(dir, up));
  vec3 zen = mix(vec3(0.01, 0.015, 0.04), vec3(0.18, 0.36, 0.72), day);
  vec3 hor = mix(vec3(0.03, 0.04, 0.08), vec3(0.62, 0.72, 0.85), day);
  vec3 c = mix(hor, zen, pow(el, 0.5));
  float sunAz = max(0.0, dot(normalize(dir - up * dot(dir, up)), normalize(uSunDir - up * dot(uSunDir, up))));
  float dusk = exp(-pow(s * 4.5, 2.0));
  c += vec3(1.1, 0.42, 0.16) * dusk * pow(sunAz, 3.0) * (1.0 - el);
  return c;
}

vec3 shadeWater(vec3 wp, vec3 N, vec3 up, vec3 V, vec3 deep, float gloss, float dist) {
  float s = dot(up, uSunDir);
  float sunVis = smoothstep(-0.06, 0.05, s);
  vec3 sunC = sunTint(s) * sunVis * stormShade(up);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 refl = reflect(-V, N);
  if (dot(refl, up) < 0.02) refl = normalize(refl + up * (0.02 - dot(refl, up)));
  vec3 skyC = skyColorFor(refl, up);
  float spec = pow(max(dot(refl, uSunDir), 0.0), gloss) * 18.0 + pow(max(dot(refl, uSunDir), 0.0), gloss * 0.1) * 0.35;
  float mv = smoothstep(-0.06, 0.05, dot(up, uMoonDir));
  float mspec = pow(max(dot(refl, uMoonDir), 0.0), gloss * 1.5) * 0.9 * mv * uMoonLight;
  vec3 amb = skyAmbient(N, wp);
  vec3 body = deep * (amb * 0.9 + sunC * max(0.0, dot(N, uSunDir)) * 0.45);
  vec3 col = mix(body, skyC, fres * 0.85) + sunC * spec + vec3(0.7, 0.8, 1.0) * mspec;
  return col;
}
`;

export function makeOceanMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */`
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_COMMON}
      ${WATER_GLSL}
      varying vec3 vWorldPos;
      void main() {
        vec3 wp = vWorldPos;
        vec3 up = normalize(wp);
        vec3 V = normalize(uCamPos - wp);
        float dist = length(uCamPos - wp);
        float fineK = 1.0 - smoothstep(3.0, 30.0, dist);
        float storm = 1.0 - stormShade(up);
        vec3 g = waveSlope(wp * 3.0, up, uTime, 0.05 * (1.0 - smoothstep(6.0, 40.0, dist)) * (1.0 + storm * 2.0), fineK);
        vec3 N = normalize(up - g);
        vec3 deep = vec3(0.008, 0.05, 0.1);
        vec3 col = shadeWater(wp, N, up, V, deep, 900.0, dist);
        // whitecaps in storms
        float cap = smoothstep(0.62, 0.8, vnoise(wp * 6.0 + vec3(uTime * 0.4))) * storm;
        col = mix(col, vec3(0.7, 0.75, 0.78) * dayAt(wp), cap * 0.6);
        float fres = pow(1.0 - max(dot(up, V), 0.0), 4.0);
        float alpha = mix(0.62, 0.97, fres);
        alpha = mix(alpha, 0.92, smoothstep(10.0, 80.0, dist));
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

const WATER_N = 16;
let waterIndex = null;

function getWaterIndex() {
  if (waterIndex) return waterIndex;
  const V = WATER_N + 1;
  const idx = [];
  for (let j = 0; j < WATER_N; j++) for (let i = 0; i < WATER_N; i++) {
    const a = j * V + i, b = a + 1, c = a + V + 1, d = a + V;
    idx.push(a, b, c, a, c, d);
  }
  // skirts along the 4 edges
  const base = V * V;
  const edge = (e, k) => e === 0 ? k : e === 1 ? k * V + WATER_N : e === 2 ? WATER_N * V + k : k * V;
  for (let e = 0; e < 4; e++) for (let k = 0; k < WATER_N; k++) {
    const t0 = edge(e, k), t1 = edge(e, k + 1), s0 = base + e * V + k, s1 = base + e * V + k + 1;
    idx.push(t0, s0, t1, t1, s0, s1, t0, t1, s0, t1, s1, s0);
  }
  waterIndex = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  return waterIndex;
}

export function buildWaterPatch(face, level, ix, iy, center) {
  const V = WATER_N + 1;
  const size = 2 / (1 << level);
  const u0 = -1 + ix * size, v0 = -1 + iy * size;
  const pos = new Float32Array((V * V + 4 * V) * 3);
  const d = [0, 0, 0];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    faceUVToDir(face, u0 + (i / WATER_N) * size, v0 + (j / WATER_N) * size, d);
    const k = (j * V + i) * 3;
    pos[k] = d[0] * R - center[0]; pos[k + 1] = d[1] * R - center[1]; pos[k + 2] = d[2] * R - center[2];
  }
  const skirt = 0.03;
  const edge = (e, k) => e === 0 ? k : e === 1 ? k * V + WATER_N : e === 2 ? WATER_N * V + k : k * V;
  for (let e = 0; e < 4; e++) for (let k = 0; k < V; k++) {
    const s = edge(e, k) * 3, t = (V * V + e * V + k) * 3;
    const px = pos[s] + center[0], py = pos[s + 1] + center[1], pz = pos[s + 2] + center[2];
    const l = Math.hypot(px, py, pz), f = (l - skirt) / l;
    pos[t] = px * f - center[0]; pos[t + 1] = py * f - center[1]; pos[t + 2] = pz * f - center[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(getWaterIndex());
  g.computeBoundingSphere();
  return g;
}
