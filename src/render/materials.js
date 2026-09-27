// Materials for kit-built geometry: procedural surface patterns keyed by a per-vertex material id,
// plus emissive windows, runes, fire and ghost-light. Variants add wind sway and distance fading.

import * as THREE from 'three';
import { patchMaterial, patchDepthMaterial, U } from './shared.js';

export const KIT_FRAGMENT_HEAD = /* glsl */`
varying float vMatId;
varying vec2 vKitUv;
float kitRelief = 0.0;
float kitGrain = 0.5;
`;

export const KIT_PATTERNS = /* glsl */`
{
  int mid = int(vMatId + 0.5);
  vec2 uv = vKitUv;
  float fwu = max(max(fwidth(uv.x), fwidth(uv.y)), 1e-5);
  float detail = (1.0 - smoothstep(0.004, 0.014, fwu)) * uDetail;
  vec3 base = diffuseColor.rgb;
  if (mid == 1) {
    vec2 b = uv / vec2(0.055, 0.03);
    b.x += mod(floor(b.y), 2.0) * 0.5;
    vec2 id = floor(b), f = fract(b);
    float e = min(min(f.x, 1.0 - f.x) * 0.055, min(f.y, 1.0 - f.y) * 0.03);
    float mortar = smoothstep(0.0012, 0.0012 + fwu * 1.2, e);
    float bevel = smoothstep(0.001, 0.004 + fwu, e);
    float tone = 0.8 + 0.34 * hash13(vec3(id, 3.0));
    kitGrain = hash13(vec3(id, 3.0));
    kitRelief = bevel * 0.0012 * detail;
    base *= mix(0.95, mix(0.55, tone * mix(0.85, 1.0, bevel), mortar), detail);
    if (detail > 0.05) base *= 0.93 + 0.14 * vnoise(vec3(uv * 80.0, 1.0));
  } else if (mid == 2) {
    float f = fract(uv.y / 0.018);
    float line = smoothstep(0.0, 0.14, f) * smoothstep(1.0, 0.86, f);
    float grain = 0.88 + 0.12 * sin(uv.x * 420.0 + sin(uv.y * 95.0) * 2.0 + hash13(vec3(floor(uv.y / 0.018), 1.0, 2.0)) * 30.0);
    kitGrain = grain;
    kitRelief = (line * 0.0005 + grain * 0.0003) * detail;
    base *= mix(1.0, mix(0.62, grain, line), detail);
  } else if (mid == 3) {
    float row = uv.y / 0.022; float rf = fract(row); float ri = floor(row);
    float cx = fract(uv.x / 0.02 + mod(ri, 2.0) * 0.5);
    float sc = abs(cx - 0.5) * 2.0;
    float edge = smoothstep(0.0, 0.3, rf - sc * sc * 0.3);
    float tone = 0.82 + 0.3 * hash13(vec3(floor(uv.x / 0.02 + mod(ri, 2.0) * 0.5), ri, 7.0));
    kitRelief = edge * (1.0 - rf * 0.6) * 0.00075 * detail;
    kitGrain = tone;
    base *= mix(1.0, mix(0.5, tone, edge), detail);
    if (detail > 0.05) base *= 0.94 + 0.12 * vnoise(vec3(uv * 75.0, 4.0));
  } else if (mid == 4) {
    float st = vnoise(vec3(uv.x * 320.0, uv.y * 18.0, 1.0));
    float band = 0.82 + 0.18 * smoothstep(0.0, 0.35, fract(uv.y / 0.028));
    kitRelief = st * band * 0.0008 * detail;
    base *= mix(1.0, (0.72 + 0.5 * st) * band, detail);
  } else if (mid == 5) {
    if (detail > 0.05) {
      float m = vnoise(vec3(uv * 170.0, 2.0));
      base *= 0.91 + 0.18 * m;
      kitRelief = m * 0.00035 * detail;
    }
  } else if (mid == 7) {
    // Leaded panes: an antialiased diamond lattice, also masking the night glow.
    vec2 pane = vec2(uv.x + uv.y, uv.x - uv.y) / 0.014;
    vec2 edge = abs(fract(pane + 0.5) - 0.5);
    vec2 aa = max(fwidth(pane), vec2(0.001));
    float lead = min(smoothstep(0.035, 0.035 + aa.x, edge.x), smoothstep(0.035, 0.035 + aa.y, edge.y));
    kitGrain = mix(1.0, lead, detail);
    base *= mix(0.2, 1.25, kitGrain);
  } else if (mid == 15) {
    vec2 b = uv / 0.02; vec2 id = floor(b); vec2 f = fract(b) - 0.5;
    f += (vec2(hash13(vec3(id, 1.0)), hash13(vec3(id, 2.0))) - 0.5) * 0.25;
    float st = smoothstep(0.52, 0.34, length(f));
    kitRelief = st * 0.0014 * detail;
    base *= mix(1.0, mix(0.5, 0.8 + 0.35 * hash13(vec3(id, 5.0)), st), detail);
  } else if (mid == 18) {
    if (detail > 0.05) {
      float bark = vnoise(vec3(uv.x * 220.0, uv.y * 26.0, 2.0));
      base *= mix(1.0, 0.78 + 0.34 * bark, detail);
      kitRelief = bark * 0.0015 * detail;
    }
  } else if (mid == 11) {
    if (detail > 0.05) base *= mix(1.0, 0.88 + 0.24 * vnoise(vec3(uv * 70.0, 5.0)), detail);
  } else if (mid == 10) {
    float weave = sin(uv.x * 1500.0) * sin(uv.y * 1500.0);
    float thread = (1.0 - smoothstep(0.0006, 0.002, fwu)) * uDetail;
    base *= 1.0 + weave * thread * 0.09;
    kitRelief = weave * thread * 0.00008;
  } else if (mid == 23) {
    // Overlapping dragon scales
    vec2 b = uv / vec2(0.028, 0.022);
    b.x += mod(floor(b.y), 2.0) * 0.5;
    vec2 f = fract(b) - vec2(0.5, 0.0);
    float arc = length(f * vec2(1.0, 1.3));
    float edge = smoothstep(0.42, 0.5, arc) * (1.0 - smoothstep(0.5, 0.6, arc));
    float tone = 0.85 + 0.25 * hash13(vec3(floor(b), 9.0));
    kitRelief = (1.0 - edge) * 0.0008 * detail;
    base *= mix(1.0, tone * (1.0 - edge * 0.45) * (0.8 + 0.4 * f.y), detail);
  } else if (mid == 17) {
    base += vec3(0.02, 0.0, 0.04) * vnoise(vWorldPos * 30.0);
  }
  diffuseColor.rgb = base;
}
`;

// Reuse pattern height for relief without texture fetches or additional geometry.
export const KIT_NORMAL = /* glsl */`
{
  vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
  vec3 rx = cross(dy, normal), ry = cross(normal, dx);
  float det = dot(dx, rx);
  vec3 gradient = sign(det) * (dFdx(kitRelief) * rx + dFdy(kitRelief) * ry);
  vec3 slope = gradient / max(abs(det), 1e-12);
  // Bound the tilt at pattern seams to avoid sparkling highlights on subpixel tiles.
  slope *= inversesqrt(max(1.0, dot(slope, slope) * 4.0));
  normal = normalize(normal - slope);
}
`;

export const KIT_ROUGHNESS = /* glsl */`
{
  int mid = int(vMatId + 0.5);
  if (mid == 1 || mid == 15) { roughnessFactor = mix(0.95, 0.72, kitGrain); }
  else if (mid == 2 || mid == 18) { roughnessFactor = mix(0.9, 0.65, kitGrain); }
  else if (mid == 6 || mid == 14) { metalnessFactor = 0.85; roughnessFactor = 0.32; }
  else if (mid == 7) { roughnessFactor = 0.18; }
  else if (mid == 12 || mid == 16 || mid == 17 || mid == 22) { roughnessFactor = 0.12; metalnessFactor = 0.1; }
  else if (mid == 11) { roughnessFactor = 0.75; }
  else if (mid == 23) { roughnessFactor = 0.42; metalnessFactor = 0.15; }
  else if (mid == 3) { roughnessFactor = 0.62; }
}
`;

export const KIT_EMISSIVE = /* glsl */`
{
  int mid = int(vMatId + 0.5);
  float night = 1.0 - dayAt(vWorldPos);
  if (mid == 7) {
    vec3 cell = floor(vWorldPos * 24.0);
    float h = hash13(cell);
    float deep = -dot(normalize(vWorldPos), uSunDir);
    float prob = mix(0.92, 0.28, smoothstep(0.3, 0.95, deep));
    float lit = step(h, prob) * smoothstep(0.35, 0.75, night);
    float flick = 0.88 + 0.12 * sin(uTime * 3.3 + h * 50.0);
    vec3 warm = mix(vec3(2.7, 1.3, 0.45), vec3(2.2, 1.6, 0.8), hash13(cell + 3.0));
    outgoingLight = mix(outgoingLight, warm * flick * mix(0.08, 1.0, kitGrain), lit * 0.95);
  } else if (mid == 8) {
    float pulse = 0.62 + 0.38 * sin(uTime * 1.9 + dot(vWorldPos, vec3(4.0, 3.0, 5.0)));
    outgoingLight += vec3(0.25, 1.5, 2.1) * pulse * (0.45 + 1.1 * night);
  } else if (mid == 9 || mid == 21) {
    float fl = 0.75 + 0.25 * vnoise(vWorldPos * 80.0 + vec3(0.0, uTime * 3.0, 0.0));
    outgoingLight = vec3(4.2, 1.3, 0.25) * fl;
  } else if (mid == 13) {
    float pulse = 0.6 + 0.4 * sin(uTime * 1.3 + dot(vWorldPos, vec3(2.0)));
    outgoingLight += vec3(0.35, 2.1, 0.9) * pulse * (0.35 + night);
  } else if (mid == 20) {
    outgoingLight += diffuseColor.rgb * (0.6 + 2.2 * night);
  } else if (mid == 12) {
    float sp = pow(vnoise(vWorldPos * 120.0 + uTime * 0.5), 6.0);
    outgoingLight += diffuseColor.rgb * (0.25 + 1.2 * night) + vec3(sp * 2.0);
  } else if (mid == 22) {
    float rip = vnoise(vWorldPos * 90.0 + vec3(uTime * 0.6, 0.0, uTime * 0.4));
    outgoingLight += vec3(0.05, 0.08, 0.1) * rip;
  } else if (mid == 11) {
    // Broadleaf translucency catches warm sunlight through the canopy.
    float backlit = pow(sat(dot(normalize(uCamPos - vWorldPos), -uSunDir)), 3.0);
    outgoingLight += diffuseColor.rgb * vec3(0.65, 0.8, 0.22) * backlit * (1.0 - night) * 0.45;
  }
}
`;

const KIT_VERTEX_HEAD = /* glsl */`
attribute float aMat;
varying float vMatId;
varying vec2 vKitUv;
`;
const KIT_VERTEX_BODY = /* glsl */`
vMatId = aMat;
vKitUv = uv;
`;

export const RIG_ATTRS = /* glsl */`
attribute vec4 aRig;
attribute vec3 aPivot;
#define aPart aRig.x
#define aSlot aRig.y
#define aTool aRig.z
`;

export function makeKitMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.85, metalness: 0, side: opts.side ?? THREE.FrontSide });
  const head = opts.rig ? RIG_ATTRS + `varying float vMatId;\nvarying vec2 vKitUv;\n` : KIT_VERTEX_HEAD;
  const body = opts.rig ? `vMatId = aRig.w;\nvKitUv = uv;\n` : KIT_VERTEX_BODY;
  return patchMaterial(mat, {
    key: opts.key || 'kit',
    rim: opts.rim ?? 0.45,
    uniforms: opts.uniforms,
    vertexHead: head + (opts.vertexHead || ''),
    vertexTransform: opts.vertexTransform,
    vertexBody: body + (opts.vertexBody || ''),
    fragmentHead: KIT_FRAGMENT_HEAD + (opts.fragmentHead || ''),
    fragmentColor: KIT_PATTERNS + (opts.fragmentColor || ''),
    fragmentRoughness: KIT_ROUGHNESS,
    fragmentNormal: KIT_NORMAL,
    fragmentEmissive: KIT_EMISSIVE + (opts.fragmentEmissive || ''),
  });
}

// Wind sway + distance LOD fade for instanced flora. uFade: (start, end, mode) mode 0 fade-out, 1 fade-in.
export const FLORA_VERTEX = /* glsl */`
{
  vec3 iOrigin = vec3(0.0);
  #ifdef USE_INSTANCING
    iOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  float dcam = distance(iOrigin, uCamPos);
  float fs = uFade.z > 0.5 ? smoothstep(uFade.x, uFade.y, dcam) : 1.0 - smoothstep(uFade.x, uFade.y, dcam);
  transformed *= fs;
  float h = max(0.0, transformed.y);
  float ph = dot(iOrigin, vec3(1.3, 2.1, 1.7));
  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ph * 0.05);
  transformed.x += sin(uTime * 1.7 + ph) * h * h * uSway * gust;
  transformed.z += cos(uTime * 1.3 + ph * 0.7) * h * h * uSway * gust;
}
`;

export function makeFloraMaterial(key, fade, sway) {
  const uniforms = { uFade: { value: fade }, uSway: { value: sway } };
  const head = `uniform vec3 uFade; uniform float uSway;`;
  const mat = makeKitMaterial({ key: 'flora-' + key, uniforms, vertexHead: head, vertexTransform: FLORA_VERTEX, rim: 0.35, side: THREE.DoubleSide });
  const depth = patchDepthMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), {
    key: 'flora-' + key, uniforms, vertexHead: head, vertexTransform: FLORA_VERTEX,
  });
  return { mat, depth, uniforms };
}

export { U };
