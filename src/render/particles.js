// Stateless GPU particles: every particle's position is a pure function of time and its seed,
// so thousands of chimneys, forges, fires, falls and rune sites cost nothing on the CPU.

import * as THREE from 'three';
import { GLSL_COMMON, U } from './shared.js';

export const PT = {
  smoke: 0, fire: 1, spark: 2, mist: 3, mote: 4, firefly: 5, ember: 6, plume: 7, steam: 8, ghost: 9, lava: 10, fae: 11,
};

// life (s), max view distance, base size, particles per emitter
const SPEC = {
  [PT.smoke]: [7.0, 9, 0.05, 7],
  [PT.fire]: [0.7, 7, 0.025, 6],
  [PT.spark]: [1.3, 5, 0.006, 10],
  [PT.mist]: [2.6, 14, 0.12, 22],
  [PT.mote]: [5.0, 9, 0.012, 7],
  [PT.firefly]: [6.0, 5, 0.008, 10],
  [PT.ember]: [4.0, 40, 0.02, 14],
  [PT.plume]: [26.0, 400, 0.8, 70],
  [PT.steam]: [6.0, 60, 0.3, 26],
  [PT.ghost]: [7.0, 8, 0.02, 6],
  [PT.lava]: [2.0, 30, 0.05, 10],
  [PT.fae]: [5.0, 7, 0.01, 8],
};
const ADDITIVE = new Set([PT.fire, PT.spark, PT.mote, PT.firefly, PT.ember, PT.ghost, PT.lava, PT.fae]);

const VERT = /* glsl */`
${GLSL_COMMON}
attribute vec3 aOrigin;
attribute vec4 aParams; // type, seed, strength, sizeMul
varying vec4 vColor;
varying vec2 vCorner;
varying float vKind;

vec3 hash33(float s) { return fract(sin(vec3(s * 12.9898, s * 78.233, s * 37.719)) * 43758.5453); }

void main() {
  float type = aParams.x, seed = aParams.y, strength = aParams.z;
  vec4 spec = TYPE_SPEC;
  float life = spec.x, maxD = spec.y, size = spec.z * aParams.w;
  vCorner = position.xy;
  vKind = type;
  float dcam = distance(aOrigin, uCamPos);
  // Reject before evaluating trajectories, noise and the billboard frame.
  if (dcam >= maxD || fract(seed * 53.17) > uDetail) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
  }
  vec3 up = normalize(aOrigin);
  vec3 tx = normalize(cross(up, abs(up.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 ty = cross(up, tx);
  float age01 = fract(uTime / life + seed);
  float age = age01 * life;
  float cyc = floor(uTime / life + seed);
  vec3 r = hash33(seed * 91.7 + cyc * 3.1);
  vec3 wind = normalize(tx * 0.8 + ty * 0.35);
  vec3 p = aOrigin;
  float s = size;
  vec4 col = vec4(1.0);
  float night = 1.0 - dayAt(aOrigin);
  float day = 1.0 - night;
  float sunK = dayAt(aOrigin) * 0.8 + 0.2;
  if (type < 0.5) { // smoke
    p += up * (age * 0.045 + age * age * 0.002) + wind * age * age * 0.004 + (tx * (r.x - 0.5) + ty * (r.y - 0.5)) * age * 0.01;
    s = size * (0.5 + age * 0.35);
    float a = smoothstep(0.0, 0.1, age01) * (1.0 - smoothstep(0.35, 1.0, age01)) * 0.4;
    vec3 c = mix(vec3(0.62, 0.62, 0.64), vec3(0.3, 0.3, 0.32), r.z) * (sunK * 0.9 + 0.1);
    col = vec4(c, a * strength);
  } else if (type < 1.5) { // fire
    p += up * age01 * 0.05 * strength + (tx * (r.x - 0.5) + ty * (r.y - 0.5)) * 0.012 * strength;
    s = size * strength * (1.0 - age01 * 0.7);
    vec3 c = mix(vec3(3.5, 1.4, 0.3), vec3(1.6, 0.25, 0.05), age01);
    col = vec4(c, (1.0 - age01) * 0.9);
  } else if (type < 2.5) { // forge sparks
    vec3 v = up * (0.12 + r.x * 0.1) + (tx * (r.y - 0.5) + ty * (r.z - 0.5)) * 0.12;
    p += v * age - up * 0.08 * age * age;
    s = size * (1.0 - age01);
    float burst = step(0.5, fract(uTime * 0.7 + seed * 0.3)) ;
    col = vec4(vec3(4.0, 2.2, 0.6), (1.0 - age01) * (0.4 + 0.6 * burst));
  } else if (type < 3.5) { // waterfall mist
    p += up * (age * 0.03 + r.z * 0.03) + (tx * (r.x - 0.5) + ty * (r.y - 0.5)) * age * 0.12 * strength;
    s = size * strength * (0.6 + age01);
    col = vec4(vec3(0.85, 0.9, 0.95) * (0.4 + 0.6 * sunK), (1.0 - age01) * 0.35);
  } else if (type < 4.5) { // rune motes
    float an = age * 0.8 + seed * 20.0;
    p += up * (age01 * 0.25) + (tx * cos(an) + ty * sin(an)) * (0.05 + r.x * 0.06) * strength;
    s = size * (0.8 + 0.4 * sin(age * 6.0 + seed * 9.0));
    col = vec4(vec3(0.4, 1.8, 2.4), sin(age01 * 3.14159) * (0.4 + 0.8 * night));
  } else if (type < 5.5) { // fireflies
    vec3 w = vec3(sin(age * 0.9 + seed * 17.0), sin(age * 1.3 + seed * 5.0), cos(age * 0.7 + seed * 11.0));
    p += (tx * w.x + ty * w.z) * 0.3 * strength + up * (0.03 + 0.03 * w.y);
    float blink = smoothstep(0.3, 1.0, sin(age * 3.0 + seed * 30.0));
    col = vec4(vec3(1.8, 2.4, 0.6), blink * smoothstep(0.35, 0.8, night));
  } else if (type < 6.5) { // embers
    p += up * age * 0.18 * strength + wind * age * 0.05 + (tx * (r.x - 0.5) + ty * (r.y - 0.5)) * age * 0.08;
    s = size * (1.0 - age01 * 0.6) * strength;
    col = vec4(vec3(4.0, 1.4, 0.3), (1.0 - age01) * 0.9);
  } else if (type < 7.5) { // volcanic plume
    p += up * age * 0.55 + wind * age * age * 0.012 + (tx * (r.x - 0.5) + ty * (r.y - 0.5)) * age * 0.12;
    s = size * (0.5 + age * 0.14);
    float a = smoothstep(0.0, 0.08, age01) * (1.0 - smoothstep(0.4, 1.0, age01)) * 0.5;
    vec3 c = mix(vec3(0.24, 0.22, 0.22), vec3(0.45, 0.43, 0.42), age01) * (sunK * 0.9 + 0.1);
    c += vec3(0.8, 0.25, 0.05) * (1.0 - smoothstep(0.0, 0.12, age01)) * 2.0;
    col = vec4(c, a);
  } else if (type < 8.5) { // steam
    p += up * age * 0.12 + wind * age * 0.05 + (tx * (r.x - 0.5) + ty * (r.y - 0.5)) * (0.3 + age * 0.05);
    s = size * (0.6 + age01 * 1.5);
    col = vec4(vec3(0.9) * (0.3 + 0.7 * sunK), (1.0 - age01) * smoothstep(0.0, 0.1, age01) * 0.4);
  } else if (type < 9.5) { // ghost wisps
    vec3 w = vec3(sin(age * 0.6 + seed * 7.0), cos(age * 0.5 + seed * 3.0), sin(age * 0.4 + seed));
    p += (tx * w.x + ty * w.y) * 0.25 * strength + up * (0.04 + 0.03 * w.z);
    s = size * (0.8 + 0.4 * w.z);
    col = vec4(vec3(0.4, 2.2, 1.0), sin(age01 * 3.14159) * (0.3 + night * 0.8));
  } else if (type < 10.5) { // lava bubbles / spatter
    vec3 v = up * (0.1 + r.x * 0.12) + (tx * (r.y - 0.5) + ty * (r.z - 0.5)) * 0.1;
    p += v * age - up * 0.1 * age * age;
    s = size * (1.0 - age01 * 0.5);
    col = vec4(vec3(5.0, 1.6, 0.2), 1.0 - age01);
  } else { // fae sparkles, many colours
    vec3 w = vec3(sin(age * 0.8 + seed * 13.0), sin(age * 1.1 + seed * 7.0), cos(age * 0.9 + seed * 3.0));
    p += (tx * w.x + ty * w.z) * 0.18 * strength + up * (0.05 + 0.08 * age01);
    vec3 c = r.x < 0.33 ? vec3(2.2, 0.8, 2.0) : r.x < 0.66 ? vec3(0.8, 1.2, 2.6) : vec3(0.8, 2.4, 1.6);
    col = vec4(c, sin(age01 * 3.14159) * (0.3 + night * 0.9));
  }
  float vis = 1.0 - smoothstep(maxD * 0.7, maxD, dcam);
  if (vis <= 0.0 || col.a <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vColor = vec4(col.rgb, col.a * vis);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
varying vec4 vColor;
varying vec2 vCorner;
varying float vKind;
void main() {
  float r = length(vCorner);
  if (r > 1.0) discard;
  float envelope = max(0.0, 1.0 - r * r);
  bool smoke = vKind < 0.5 || (vKind > 2.5 && vKind < 3.5) || (vKind > 6.5 && vKind < 8.5);
  float soft = smoke ? envelope * envelope : exp(-r * r * 3.5) * envelope;
  if (smoke) soft *= 0.8 + 0.2 * sin(vCorner.x * 7.0) * cos(vCorner.y * 8.0);
  if (vKind > 3.5 && vKind < 6.5 || vKind > 10.5) {
    float rays = pow(max(0.0, 1.0 - abs(vCorner.x * vCorner.y) * 18.0), 4.0);
    soft += rays * envelope * 0.18;
  }
  gl_FragColor = vec4(vColor.rgb, vColor.a * soft);
}
`;

function specGLSL() {
  // TYPE_SPEC as a chain of selects on the type.
  let s = 'vec4(1.0)';
  for (const [t, v] of Object.entries(SPEC)) s = `(abs(type - ${t}.0) < 0.5 ? vec4(${v[0].toFixed(3)}, ${v[1].toFixed(3)}, ${v[2].toFixed(4)}, 0.0) : ${s})`;
  return s;
}

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.emitters = [];
    this.systems = [];
  }

  add(type, p, strength = 1, sizeMul = 1, count = null) {
    this.emitters.push({ type, p: p.clone(), strength, sizeMul, count: count ?? SPEC[type][3] });
  }

  build() {
    for (const additive of [false, true]) {
      const list = this.emitters.filter(e => ADDITIVE.has(e.type) === additive);
      let n = 0;
      for (const e of list) n += e.count;
      if (!n) continue;
      const quad = new THREE.PlaneGeometry(2, 2);
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index;
      g.setAttribute('position', quad.attributes.position);
      const origin = new Float32Array(n * 3), params = new Float32Array(n * 4);
      let i = 0;
      for (const e of list) {
        for (let k = 0; k < e.count; k++, i++) {
          origin[i * 3] = e.p.x; origin[i * 3 + 1] = e.p.y; origin[i * 3 + 2] = e.p.z;
          params[i * 4] = e.type; params[i * 4 + 1] = (k + 0.5) / e.count + Math.random() * 0.03;
          params[i * 4 + 2] = e.strength; params[i * 4 + 3] = e.sizeMul;
        }
      }
      g.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
      g.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U },
        vertexShader: VERT.replace('TYPE_SPEC', specGLSL()),
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = additive ? 6 : 5;
      this.scene.add(mesh);
      this.systems.push(mesh);
    }
    return this;
  }

  get count() { return this.emitters.reduce((a, e) => a + e.count, 0); }
}

// Snow or ash drifting in a box around the camera's patch of ground.
export class WeatherVolume {
  constructor(scene) {
    const n = 2200;
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = Math.random() - 0.5; a[i * 4 + 1] = Math.random() - 0.5; a[i * 4 + 2] = Math.random(); a[i * 4 + 3] = Math.random(); }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = n;
    this.uniforms = { uCenter: { value: new THREE.Vector3() }, uKind: { value: 0 }, uAmount: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, ...this.uniforms },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        ${GLSL_COMMON}
        uniform vec3 uCenter; uniform float uKind; uniform float uAmount;
        attribute vec4 aSeed;
        varying vec4 vC; varying vec2 vQ;
        void main() {
          vQ = position.xy;
          vec3 up = normalize(uCenter);
          vec3 tx = normalize(cross(up, abs(up.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 ty = cross(tx, up);
          float H = 2.2, S = 5.0;
          float fall = uKind < 0.5 ? 0.12 : 0.05;
          float h = H - mod(uTime * fall + aSeed.z * H, H);
          vec2 xy = aSeed.xy * S + vec2(sin(uTime * 0.6 + aSeed.w * 20.0), cos(uTime * 0.5 + aSeed.w * 13.0)) * 0.06;
          // Keep the box stable in world space as the camera moves (wrap).
          vec2 off = vec2(dot(uCenter, tx), dot(uCenter, ty));
          xy = mod(xy - off + S * 0.5, S) - S * 0.5;
          vec3 p = uCenter + tx * xy.x + ty * xy.y + up * h;
          float vis = step(aSeed.w, uAmount) * smoothstep(0.0, 0.3, h) * (1.0 - smoothstep(1.6, 2.2, h));
          float night = 1.0 - dayAt(p);
          vC = uKind < 0.5 ? vec4(vec3(0.95, 0.97, 1.0) * (1.0 - night * 0.7), 0.85 * vis) : vec4(mix(vec3(0.35, 0.33, 0.32), vec3(3.0, 0.9, 0.2), step(0.85, aSeed.w)), 0.7 * vis);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          mv.xy += position.xy * (uKind < 0.5 ? 0.006 : 0.005);
          gl_Position = projectionMatrix * mv;
          if (vis <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec4 vC; varying vec2 vQ;
        void main() { float r = dot(vQ, vQ); if (r > 1.0) discard; gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r)); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }
  update(center, field, alt) {
    const d = center.clone().normalize();
    field.regionWeights(d.x, d.y, d.z);
    const cold = field.regionProp('cold'), volc = field.regionProp('volcanic');
    const h = field.height(d.x, d.y, d.z);
    let kind = 0, amount = 0;
    if (cold > 0.35 || h > 4.3) { kind = 0; amount = Math.min(1, cold + (h > 4.3 ? 0.5 : 0)); }
    else if (volc > 0.35) { kind = 1; amount = Math.min(1, volc); }
    amount *= 1 - THREE.MathUtils.smoothstep(alt, 2.5, 6);
    this.uniforms.uCenter.value.copy(center);
    this.uniforms.uKind.value = kind;
    this.uniforms.uAmount.value = amount;
    this.mesh.visible = amount > 0.01;
  }
}
