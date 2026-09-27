// Shared uniforms and the material patch every lit surface uses: planet-shadowed sun and moon,
// a sky/ground ambient that follows the local "up", sunset tinting, and a soft comic rim light.

import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  uMoonDir: { value: new THREE.Vector3(-1, 0, 0) },
  uMoonLight: { value: 0.3 },
  uCamPos: { value: new THREE.Vector3() },
  uFocus: { value: new THREE.Vector3() },
  uStorms: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uFlash: { value: new THREE.Vector4(0, 0, 0, 0) }, // lightning: xyz dir, w intensity
  uWind: { value: new THREE.Vector3(0.6, 0, 0.3) },
  uDetail: { value: 1 },
};

export const GLSL_COMMON = /* glsl */`
uniform float uTime;
uniform float uDetail;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uMoonLight;
uniform vec3 uCamPos;
uniform vec4 uStorms[4];
uniform vec4 uFlash;

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1,0,0)), n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1)), n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

// Local daylight 0..1 from the sun elevation at a world position.
float dayAt(vec3 wp) { return smoothstep(-0.18, 0.12, dot(normalize(wp), uSunDir)); }

vec3 sunTint(float s) {
  vec3 low = vec3(1.0, 0.38, 0.14);
  vec3 mid = vec3(1.0, 0.78, 0.55);
  vec3 c = mix(low, mid, smoothstep(0.0, 0.12, s));
  c = mix(c, vec3(1.0, 0.97, 0.92), smoothstep(0.12, 0.45, s));
  return c * mix(0.35, 1.0, smoothstep(-0.02, 0.2, s));
}

// Dimming under storm cells.
float stormShade(vec3 up) {
  float k = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 s = uStorms[i];
    if (s.w <= 0.0) continue;
    float d = 1.0 - dot(up, s.xyz);
    k *= 1.0 - s.w * 0.6 * (1.0 - smoothstep(0.0006, 0.0045, d));
  }
  return k;
}

vec3 dirLightFactor(int i, vec3 wp) {
  vec3 up = normalize(wp);
  if (i == 0) {
    float s = dot(up, uSunDir);
    return sunTint(s) * smoothstep(-0.07, 0.05, s) * stormShade(up);
  }
  float s = dot(up, uMoonDir);
  return vec3(smoothstep(-0.07, 0.05, s)) * uMoonLight;
}

vec3 skyAmbient(vec3 wn, vec3 wp) {
  vec3 up = normalize(wp);
  float s = dot(up, uSunDir);
  float day = smoothstep(-0.2, 0.25, s);
  float dusk = exp(-pow(s * 5.0, 2.0));
  vec3 daySky = vec3(0.42, 0.53, 0.72);
  vec3 nightSky = vec3(0.028, 0.04, 0.085);
  vec3 sky = mix(nightSky, daySky, day) + vec3(0.36, 0.16, 0.1) * dusk;
  vec3 ground = mix(vec3(0.025, 0.03, 0.04), vec3(0.32, 0.28, 0.2), day);
  float m = max(0.0, dot(up, uMoonDir));
  sky += vec3(0.03, 0.045, 0.08) * m * uMoonLight * 3.0 * (1.0 - day);
  float hemi = dot(wn, up) * 0.5 + 0.5;
  vec3 amb = mix(ground, sky, hemi);
  amb *= mix(0.55, 1.0, stormShade(up));
  // Lightning flash lights everything nearby.
  if (uFlash.w > 0.0) amb += vec3(0.7, 0.75, 1.0) * uFlash.w * (1.0 - smoothstep(0.0, 0.004, 1.0 - dot(up, uFlash.xyz)));
  return amb;
}
`;

// Patch a built-in lit material (Standard/Lambert/Phong) with the planet lighting model.
// opts.vertexHead / vertexBody / fragmentHead / fragmentColor / fragmentEmissive: extra GLSL.
export function patchMaterial(mat, opts = {}) {
  const key = opts.key || 'base';
  mat.customProgramCacheKey = () => 'planet-' + key;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, U, opts.uniforms || {});
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>
${GLSL_COMMON}
varying vec3 vWorldPos;
${opts.vertexHead || ''}`);
    if (opts.vertexTransform) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
${opts.vertexTransform}`);
    if (opts.vertexNormal) vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
${opts.vertexNormal}`);
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    wp4 = batchingMatrix * wp4;
  #endif
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
  #endif
  vWorldPos = (modelMatrix * wp4).xyz;
}
${opts.vertexBody || ''}`);

    fs = fs.replace('#include <common>', `#include <common>
${GLSL_COMMON}
varying vec3 vWorldPos;
${opts.fragmentHead || ''}`);
    if (opts.fragmentColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
${opts.fragmentColor}`);
    if (opts.fragmentRoughness) fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
${opts.fragmentRoughness}`);
    if (opts.fragmentNormal) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + opts.fragmentNormal);
    // The light loop lives inside an include; expand it so the edits below can land.
    fs = fs.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin);
    fs = fs.replace('getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= dirLightFactor( UNROLLED_LOOP_INDEX, vWorldPos );');
    fs = fs.replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );',
      `vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	irradiance += PI * skyAmbient( inverseTransformDirection( geometryNormal, viewMatrix ), vWorldPos ) * ${(opts.ambient ?? 1).toFixed(3)};`);
    fs = fs.replace('#include <opaque_fragment>', `{
  vec3 wN = inverseTransformDirection( normal, viewMatrix );
  vec3 V = normalize(uCamPos - vWorldPos);
  float rim = pow(1.0 - sat(dot(wN, V)), 3.0);
  vec3 up = normalize(vWorldPos);
  float lit = sat(dot(up, uSunDir) * 4.0 + 0.3);
  outgoingLight += diffuseColor.rgb * rim * mix(vec3(0.05, 0.07, 0.14), vec3(0.35, 0.33, 0.3), lit) * ${(opts.rim ?? 0.5).toFixed(3)};
}
${opts.fragmentEmissive || ''}
#include <opaque_fragment>`);
    if (!fs.includes('dirLightFactor( UNROLLED_LOOP_INDEX') || !fs.includes('skyAmbient( inverseTransformDirection')) {
      console.warn('planet lighting patch did not apply for', key);
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
    if (prev) prev(shader, renderer);
    if (opts.onShader) opts.onShader(shader);
  };
  return mat;
}

// Depth material for shadow casters that animate in the vertex shader.
export function patchDepthMaterial(mat, opts) {
  mat.customProgramCacheKey = () => 'planet-depth-' + (opts.key || 'base');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, opts.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${GLSL_COMMON}
${opts.vertexHead || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${opts.vertexTransform || ''}`);
  };
  return mat;
}
