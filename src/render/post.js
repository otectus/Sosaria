// Post pipeline: scene -> (outline + atmosphere + sky) -> bloom -> filmic grade -> screen.
// The atmosphere is single scattering over a transmittance LUT, applied to every pixel with depth,
// so the same code draws the orbital limb glow, sunsets at street level and aerial haze.

import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/sphere.js';

const R = PLANET_RADIUS;
export const ATMO = {
  R, Ra: R + 12, Hr: 1.55, Hm: 0.42,
  betaR: new THREE.Vector3(5.8, 13.5, 33.1).multiplyScalar(1e-6 * (8000 / 1.55) * 0.14),
  betaM: 21e-6 * (1200 / 0.42) * 0.18,
};

const ATMO_GLSL = /* glsl */`
const float PR = ${R.toFixed(2)};
const float PRA = ${ATMO.Ra.toFixed(2)};
const float HR = ${ATMO.Hr.toFixed(3)};
const float HM = ${ATMO.Hm.toFixed(3)};
const vec3 BR = vec3(${ATMO.betaR.x.toFixed(5)}, ${ATMO.betaR.y.toFixed(5)}, ${ATMO.betaR.z.toFixed(5)});
const float BM = ${ATMO.betaM.toFixed(5)};
const float BMX = BM * 1.11;

vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
`;

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function fsMaterial(frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra,
  });
}

const TRANS_FRAG = /* glsl */`
${ATMO_GLSL}
varying vec2 vUv;
void main() {
  float mu = -0.5 + vUv.x * 1.5;
  float h = vUv.y * (PRA - PR);
  vec3 ro = vec3(0.0, PR + h, 0.0);
  vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  vec2 tg = raySphere(ro, rd, PR);
  if (tg.x > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float t1 = raySphere(ro, rd, PRA).y;
  float ds = t1 / 48.0;
  float odR = 0.0, odM = 0.0;
  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * (float(i) + 0.5) * ds;
    float hh = length(p) - PR;
    odR += exp(-hh / HR) * ds;
    odM += exp(-hh / HM) * ds;
  }
  gl_FragColor = vec4(exp(-(BR * odR + BMX * odM)), 1.0);
}
`;

const ATMO_FRAG = /* glsl */`
${ATMO_GLSL}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tTrans;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uMoon2Dir;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform int uAtmoSteps;
uniform float uSunI;
uniform float uMoonI;
uniform vec2 uTexel;
uniform float uPixAngle;
uniform float uOutline;
uniform float uOutlineFar;
uniform float uStorm;
uniform float uSkyBoost;
uniform float uNoAtmo;
uniform float uFog;
uniform vec4 uFogZones[3];   // xyz: center direction, w: angular radius as (1 - cos)
uniform vec3 uFogZoneK;      // strength of each zone
uniform float uHazeBoost;
varying vec2 vUv;

vec3 trans(float h, float mu) {
  return texture2D(tTrans, vec2(clamp((mu + 0.5) / 1.5, 0.0, 1.0), clamp(h / (PRA - PR), 0.0, 1.0))).rgb;
}

float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }

float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

vec3 starLayer(vec3 rd, float res, float density, float bright) {
  vec3 a = abs(rd);
  vec2 uv; float face;
  if (a.x > a.y && a.x > a.z) { uv = rd.yz / a.x; face = rd.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y > a.z) { uv = rd.xz / a.y; face = rd.y > 0.0 ? 2.0 : 3.0; }
  else { uv = rd.xy / a.z; face = rd.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = (uv * 0.5 + 0.5) * res;
  vec2 cell = floor(g);
  float hsh = h21(cell + face * 131.7);
  if (hsh > density) return vec3(0.0);
  vec2 sp = cell + 0.2 + 0.6 * vec2(h21(cell + face * 17.1 + 3.3), h21(cell + face * 23.9 + 7.7));
  float dpx = length(g - sp) / res * 2.0; // approx angle in radians on the face
  float sigma = uPixAngle * 0.75;
  float s = exp(-dpx * dpx / (sigma * sigma));
  float mag = pow(h21(cell * 1.7 + face), 6.0);
  float tw = 1.0;
  vec3 col = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.86, 0.66), h21(cell + 9.1));
  return col * s * (0.25 + mag * 3.5) * bright;
}

vec3 moonDisk(vec3 rd, vec3 md, float rad, vec3 tint, float seed) {
  float c = dot(rd, md);
  float ang = acos(clamp(c, -1.0, 1.0));
  if (ang > rad * 1.6) return vec3(0.0);
  vec3 tx = normalize(cross(md, abs(md.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 ty = cross(md, tx);
  vec2 q = vec2(dot(rd, tx), dot(rd, ty)) / sin(rad);
  float r2 = dot(q, q);
  float glow = exp(-ang / rad * 2.5) * 0.06;
  if (r2 > 1.0) return tint * glow;
  vec3 n = normalize(q.x * tx + q.y * ty - sqrt(1.0 - r2) * md);
  float lit = smoothstep(-0.05, 0.12, dot(n, uSunDir));
  vec3 np = n * 3.0 + seed;
  float crater = vn3(np * 2.0) * 0.5 + vn3(np * 5.0) * 0.3 + vn3(np * 11.0) * 0.2;
  vec3 surf = tint * (0.55 + 0.6 * crater);
  float edge = smoothstep(1.0, 0.92, r2);
  return surf * (lit * 1.6 + 0.025) * edge + tint * glow;
}

vec3 background(vec3 rd, float dayMask) {
  vec3 col = vec3(0.0);
  float starVis = 1.0 - dayMask;
  if (starVis > 0.001) {
    col += starLayer(rd, 180.0, 0.16, 1.0) * starVis;
    col += starLayer(rd, 420.0, 0.22, 0.45) * starVis;
    // Milky way band
    vec3 gal = normalize(vec3(0.3, 0.85, 0.42));
    float b = dot(rd, gal);
    float band = exp(-b * b * 14.0);
    float neb = vn3(rd * 5.0) * 0.6 + vn3(rd * 13.0) * 0.4;
    float dust = smoothstep(0.35, 0.7, vn3(rd * 9.0 + 4.0));
    col += mix(vec3(0.08, 0.06, 0.14), vec3(0.12, 0.13, 0.2), neb) * band * (0.35 + neb) * (1.0 - dust * 0.6) * 0.5 * starVis;
    col += vec3(0.05, 0.02, 0.06) * smoothstep(0.55, 0.8, vn3(rd * 3.0 + 11.0)) * 0.25 * starVis;
  }
  // Sun disk
  float cs = dot(rd, uSunDir);
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.99985, 0.99992, cs) * 60.0;
  col += moonDisk(rd, uMoonDir, 0.034, vec3(0.92, 0.9, 0.86), 1.0);
  col += moonDisk(rd, uMoon2Dir, 0.016, vec3(0.62, 0.78, 1.0), 7.3);
  return col;
}

vec3 scatter(vec3 ro, vec3 rd, float tMax, out vec3 T) {
  T = vec3(1.0);
  vec2 ta = raySphere(ro, rd, PRA);
  if (ta.y <= 0.0) return vec3(0.0);
  float t0 = max(ta.x, 0.0);
  float t1 = min(ta.y, tMax);
  vec2 tp = raySphere(ro, rd, PR - 0.2);
  if (tp.x > 0.0) t1 = min(t1, tp.x);
  if (t1 <= t0) return vec3(0.0);
  int N = uAtmoSteps;
  float L = t1 - t0;
  float odR = 0.0, odM = 0.0;
  vec3 sR = vec3(0.0), sM = vec3(0.0), mR = vec3(0.0), mM = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= N) break;
    float f = (float(i) + 1.0) / float(N);
    float tt = f * f;
    float seg = (tt - prev) * L;
    float tm = (prev + tt) * 0.5 * L;
    prev = tt;
    vec3 p = ro + rd * (t0 + tm);
    float lp = length(p);
    float h = max(0.0, lp - PR);
    float dR = exp(-h / HR) * seg;
    float dM = exp(-h / HM) * seg;
    odR += dR * 0.5; odM += dM * 0.5;
    vec3 up = p / lp;
    vec3 Tv = exp(-(BR * odR + BMX * odM));
    vec3 Ts = trans(h, dot(up, uSunDir));
    vec3 Tm = trans(h, dot(up, uMoonDir));
    sR += Tv * Ts * dR; sM += Tv * Ts * dM;
    mR += Tv * Tm * dR; mM += Tv * Tm * dM;
    odR += dR * 0.5; odM += dM * 0.5;
  }
  T = exp(-(BR * odR + BMX * odM));
  float mu = dot(rd, uSunDir);
  float pR = 0.0596831 * (1.0 + mu * mu);
  float g = 0.76;
  float pM = 0.1193662 * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  float mu2 = dot(rd, uMoonDir);
  float pR2 = 0.0596831 * (1.0 + mu2 * mu2);
  float pM2 = 0.1193662 * (1.0 - g * g) * (1.0 + mu2 * mu2) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu2, 1.5));
  vec3 Ls = uSunI * (sR * BR * pR + sM * BM * pM);
  vec3 Lm = uMoonI * (mR * BR * pR2 + mM * BM * pM2) * vec3(0.8, 0.9, 1.15);
  return Ls + Lm;
}

void main() {
  float d = texture2D(tDepth, vUv).r;
  vec3 col = texture2D(tColor, vUv).rgb;
  bool sky = d >= 0.999999;
  vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 vp = uProjInv * ndc; vp /= vp.w;
  vec3 wp = (uViewInv * vp).xyz;
  vec3 rd = normalize(wp - uCamPos);
  float tMax = sky ? 1e9 : length(wp - uCamPos);

  float mask = texture2D(tColor, vUv).a;
  if (!sky && uOutline > 0.0 && mask > 0.5) {
    float zc = linZ(d);
    float wc = 1.0 / zc;
    vec2 o = uTexel;
    float wl = 1.0 / linZ(texture2D(tDepth, vUv - vec2(o.x, 0.0)).r);
    float wr = 1.0 / linZ(texture2D(tDepth, vUv + vec2(o.x, 0.0)).r);
    float wd = 1.0 / linZ(texture2D(tDepth, vUv - vec2(0.0, o.y)).r);
    float wu = 1.0 / linZ(texture2D(tDepth, vUv + vec2(0.0, o.y)).r);
    float lap = (abs(wl + wr - 2.0 * wc) + abs(wu + wd - 2.0 * wc)) / wc;
    float edge = smoothstep(0.08, 0.3, lap);
    float fade = 1.0 - smoothstep(uOutlineFar * 0.4, uOutlineFar, zc);
    col *= 1.0 - edge * fade * uOutline;
  }

  if (uNoAtmo > 0.5) { gl_FragColor = vec4(col, 1.0); return; }
  // Low drifting fog: exponential in height above sea level, broken into patches that drift.
  {
    float camH = length(uCamPos) - PR;
    float segLen = min(tMax, 26.0);
    if (camH < 8.0) {
      vec3 pEnd = uCamPos + rd * segLen;
      float h0 = camH, h1 = length(pEnd) - PR;
      const float HF = 0.28;
      float dh = h1 - h0;
      float integ = abs(dh) > 1e-3 ? HF * (exp(-max(h0, 0.0) / HF) - exp(-max(h1, 0.0) / HF)) / dh : exp(-max(h0, 0.0) / HF);
      integ *= segLen;
      vec3 mid = uCamPos + rd * min(segLen, 6.0) * 0.5;
      vec3 up = normalize(mid);
      float zone = 0.0;
      for (int i = 0; i < 3; i++) zone = max(zone, uFogZoneK[i] * (1.0 - smoothstep(uFogZones[i].w * 0.5, uFogZones[i].w, 1.0 - dot(up, uFogZones[i].xyz))));
      float drift = vn3(mid * 0.9 + vec3(uTime * 0.05, 0.0, uTime * 0.03)) * 0.65 + vn3(mid * 2.3 - vec3(uTime * 0.08)) * 0.35;
      float patchy = smoothstep(0.35, 0.75, drift);
      float dens = (uFog * patchy + zone * (0.5 + 0.5 * patchy)) * 0.55;
      float fogAmt = 1.0 - exp(-integ * dens);
      float s = dot(up, uSunDir);
      float dayF = smoothstep(-0.2, 0.25, s);
      vec3 fogCol = mix(vec3(0.03, 0.04, 0.07), vec3(0.62, 0.66, 0.72), dayF);
      fogCol += vec3(0.5, 0.25, 0.12) * exp(-pow(s * 5.0, 2.0)) * 0.6;
      fogCol = mix(fogCol, vec3(0.12, 0.2, 0.14), zone * (1.0 - dayF) * 0.6);
      col = mix(col, fogCol * 1.4, clamp(fogAmt, 0.0, 0.85) * (1.0 - smoothstep(4.0, 8.0, camH)));
    }
  }
  vec3 T;
  // Day mask for stars: brightness of the sky along this ray from the sun's point of view.
  vec3 L = scatter(uCamPos, rd, tMax, T);
  if (sky) {
    L *= uSkyBoost;
    float dayMask = clamp(dot(L, vec3(0.3, 0.5, 0.2)) * 6.0, 0.0, 1.0);
    col = background(rd, dayMask);
  } else {
    L *= uHazeBoost;
    // A warm twilight band along the terminator, strongest when seen from high up.
    float se = dot(normalize(wp), uSunDir);
    float orbitK = smoothstep(15.0, 90.0, length(uCamPos) - PR);
    L += vec3(1.0, 0.42, 0.16) * 0.05 * exp(-pow((se + 0.02) / 0.06, 2.0)) * orbitK;
  }
  // Storm gloom
  col = col * T + L * (1.0 - uStorm * 0.35);
  gl_FragColor = vec4(col, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tIn; uniform float uThreshold; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tIn, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(0.0, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
}
`;

const DOWN_FRAG = /* glsl */`
uniform sampler2D tIn; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tIn, vUv).rgb * 4.0;
  c += texture2D(tIn, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP_FRAG = /* glsl */`
uniform sampler2D tIn; uniform vec2 uTexel; uniform float uWeight;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tIn, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  c += texture2D(tIn, vUv + uTexel * vec2(1.0, 0.0)).rgb * 2.0;
  c += texture2D(tIn, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
  c += texture2D(tIn, vUv + uTexel * vec2(0.0, 1.0)).rgb * 2.0;
  c += texture2D(tIn, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tIn, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 12.0 * uWeight, 1.0);
}
`;

const FINAL_FRAG = /* glsl */`
uniform sampler2D tIn; uniform sampler2D tBloom;
uniform float uExposure; uniform float uBloom; uniform float uSat; uniform float uTime; uniform float uVignette;
uniform vec3 uGradeShadow; uniform vec3 uGradeHigh;
uniform vec2 uTexel;
uniform float uFXAA;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 sceneColor() {
  vec3 center = texture2D(tIn, vUv).rgb;
  if (uFXAA < 0.5) return center;
  vec3 nw = texture2D(tIn, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 ne = texture2D(tIn, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 sw = texture2D(tIn, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 se = texture2D(tIn, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  float lo = min(luma(center), min(min(luma(nw), luma(ne)), min(luma(sw), luma(se))));
  float hi = max(luma(center), max(max(luma(nw), luma(ne)), max(luma(sw), luma(se))));
  if (hi - lo < max(0.025, hi * 0.12)) return center;
  vec2 dir = vec2(-luma(nw + ne - sw - se), luma(nw + sw - ne - se));
  float reduce = max(luma(nw + ne + sw + se) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -6.0, 6.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tIn, vUv - dir / 6.0).rgb + texture2D(tIn, vUv + dir / 6.0).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tIn, vUv - dir * 0.5).rgb + texture2D(tIn, vUv + dir * 0.5).rgb);
  return luma(b) < lo || luma(b) > hi ? a : b;
}
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 c = sceneColor();
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  // split toning: cool shadows, warm highlights
  float lt = l / (1.0 + l);
  c *= mix(uGradeShadow, uGradeHigh, smoothstep(0.05, 0.6, lt));
  c = aces(c);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;
  c = toSRGB(c);
  // dither against banding
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
  c += (n - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);

    this.trans = new THREE.WebGLRenderTarget(256, 64, { type: THREE.HalfFloatType, depthBuffer: false });
    this.trans.texture.minFilter = this.trans.texture.magFilter = THREE.LinearFilter;
    this.trans.texture.wrapS = this.trans.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.pass(fsMaterial(TRANS_FRAG, {}), this.trans);

    this.atmoMat = fsMaterial(ATMO_FRAG, {
      tColor: { value: null }, tDepth: { value: null }, tTrans: { value: this.trans.texture },
      uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() },
      uMoon2Dir: { value: new THREE.Vector3() },
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uTime: { value: 0 }, uSunI: { value: 22 }, uMoonI: { value: 0.5 },
      uAtmoSteps: { value: 12 },
      uTexel: { value: new THREE.Vector2() }, uPixAngle: { value: 0.001 }, uOutline: { value: 0.55 }, uOutlineFar: { value: 20 },
      uStorm: { value: 0 }, uSkyBoost: { value: 1 }, uHazeBoost: { value: 1 }, uNoAtmo: { value: 0 },
      uFog: { value: 0 }, uFogZones: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uFogZoneK: { value: new THREE.Vector3() },
    });
    this.brightMat = fsMaterial(BRIGHT_FRAG, { tIn: { value: null }, uThreshold: { value: 1.1 }, uTexel: { value: new THREE.Vector2() } });
    this.downMat = fsMaterial(DOWN_FRAG, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = fsMaterial(UP_FRAG, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } },
      { blending: THREE.AdditiveBlending, transparent: true });
    this.finalMat = fsMaterial(FINAL_FRAG, {
      tIn: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.35 }, uSat: { value: 1.12 },
      uTime: { value: 0 }, uVignette: { value: 0.55 },
      uTexel: { value: new THREE.Vector2() }, uFXAA: { value: 0 },
      uGradeShadow: { value: new THREE.Vector3(0.96, 0.99, 1.06) }, uGradeHigh: { value: new THREE.Vector3(1.04, 1.0, 0.95) },
    });
    this.size = new THREE.Vector2(1, 1);
    this.bloomLevels = [];
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  setSize(w, h, samples = 2, levels = 5) {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    samples = Math.min(samples, this.renderer.capabilities.maxSamples);
    if (this.scene && this.size.x === w && this.size.y === h && this.samples === samples && this.levels === levels) return;
    this.samples = samples; this.levels = levels;
    this.size.set(w, h);
    if (this.scene) { this.scene.dispose(); this.scene.depthTexture.dispose(); }
    const dt = new THREE.DepthTexture(w, h);
    dt.type = THREE.FloatType;
    this.scene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthTexture: dt });
    if (this.hdr) this.hdr.dispose();
    this.hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.bloomLevels.forEach(t => t.dispose());
    this.bloomLevels = [];
    let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    for (let i = 0; i < levels; i++) {
      const t = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
      t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
      this.bloomLevels.push(t);
      if (bw <= 4 || bh <= 4) break;
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.atmoMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.finalMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.finalMat.uniforms.uFXAA.value = samples === 0 ? 1 : 0;
  }

  render(scene, camera, p) {
    const r = this.renderer;
    r.setRenderTarget(this.scene);
    r.clear();
    r.render(scene, camera);

    const A = this.atmoMat.uniforms;
    A.tColor.value = this.scene.texture;
    A.tDepth.value = this.scene.depthTexture;
    A.uProjInv.value.copy(camera.projectionMatrixInverse);
    A.uViewInv.value.copy(camera.matrixWorld);
    A.uCamPos.value.copy(camera.position);
    A.uSunDir.value.copy(p.sunDir);
    A.uMoonDir.value.copy(p.moonDir);
    A.uMoon2Dir.value.copy(p.moon2Dir);
    A.uNear.value = camera.near; A.uFar.value = camera.far;
    A.uTime.value = p.time;
    A.uPixAngle.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / this.size.y;
    A.uOutline.value = p.outline;
    A.uOutlineFar.value = p.outlineFar;
    A.uStorm.value = p.storm || 0;
    A.uFog.value = p.fog || 0;
    if (p.fogZones) p.fogZones.forEach((z, i) => { A.uFogZones.value[i].set(z.d[0], z.d[1], z.d[2], z.chord); A.uFogZoneK.value.setComponent(i, z.k); });
    // Skies seen from inside the atmosphere read brighter than the thin haze seen from orbit.
    const camAlt = camera.position.length() - R;
    const k = 1 - THREE.MathUtils.smoothstep(camAlt, 3, 40);
    A.uSkyBoost.value = 1 + 6.0 * k;
    A.uHazeBoost.value = 1 + 1.1 * k;
    A.uSunI.value = p.sunI ?? 22;
    A.uMoonI.value = p.moonI ?? 0.5;
    this.pass(this.atmoMat, this.hdr);

    // Bloom
    const L = this.bloomLevels;
    this.brightMat.uniforms.tIn.value = this.hdr.texture;
    this.brightMat.uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
    this.brightMat.uniforms.uThreshold.value = p.bloomThreshold ?? 1.0;
    this.pass(this.brightMat, L[0]);
    for (let i = 1; i < L.length; i++) {
      this.downMat.uniforms.tIn.value = L[i - 1].texture;
      this.downMat.uniforms.uTexel.value.set(1 / L[i - 1].width, 1 / L[i - 1].height);
      this.pass(this.downMat, L[i]);
    }
    for (let i = L.length - 1; i > 0; i--) {
      this.upMat.uniforms.tIn.value = L[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / L[i].width, 1 / L[i].height);
      this.upMat.uniforms.uWeight.value = 1.0;
      r.autoClear = false;
      this.pass(this.upMat, L[i - 1]);
      r.autoClear = true;
    }

    const F = this.finalMat.uniforms;
    F.tIn.value = this.hdr.texture;
    F.tBloom.value = L[0].texture;
    F.uExposure.value = p.exposure;
    F.uBloom.value = p.bloom ?? 0.35;
    F.uTime.value = p.time % 100;
    this.pass(this.finalMat, null);
  }
}
