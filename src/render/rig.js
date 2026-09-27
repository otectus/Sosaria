// GPU rig: poses every character/creature part from per-instance action, phase, speed and tool.
// A Crowd is an InstancedMesh with those attributes plus four color slots, grown on demand.

import * as THREE from 'three';
import { makeKitMaterial, RIG_ATTRS } from './materials.js';
import { patchDepthMaterial } from './shared.js';

export const ACT = {
  idle: 0, walk: 1, run: 2, hammer: 3, farm: 4, talk: 5, carry: 6, cheer: 7, guard: 8, chop: 9, sit: 10,
  pray: 11, dance: 12, fish: 13, flee: 14, fight: 15, play: 16, sleep: 17, graze: 18, fly: 19, glide: 20, swim: 21, point: 22, mine: 23,
};

export const RIG = { biped: 0, quad: 1, spider: 2, flyer: 3, serpent: 4, vehicle: 5 };

const RIG_HEAD = /* glsl */`
attribute vec4 iAnim;
attribute vec3 iColA;
attribute vec3 iColB;
attribute vec3 iSkin;
attribute vec3 iHair;
uniform float uHip;
mat3 rigR;
vec3 rigT;
float rigHide;

mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

void rigPose(vec3 pos) {
  int part = int(aPart + 0.5);
  int act = int(iAnim.x + 0.5);
  float t = uTime * iAnim.z + iAnim.y;
  rigHide = (aTool > 0.5 && abs(aTool - iAnim.w) > 0.5) ? 1.0 : 0.0;
  float lL = 0.0, lR = 0.0, aL = 0.0, aR = 0.0, aLz = 0.0, aRz = 0.0, hY = 0.0, hP = 0.0, lean = 0.0, bob = 0.0, bY = 0.0, ex = 0.0, roll = 0.0;
#if RIG == 0
  if (act == 1 || act == 6 || act == 14 || act == 2) {
    float sp = act == 2 || act == 14 ? 13.0 : 8.0;
    float amp = act == 2 || act == 14 ? 0.9 : 0.55;
    float s = sin(t * sp);
    lL = s * amp; lR = -s * amp;
    aL = -s * amp * 0.8; aR = s * amp * 0.8;
    bob = abs(cos(t * sp)) * (act == 2 || act == 14 ? 0.006 : 0.003);
    lean = act == 2 ? 0.25 : act == 14 ? 0.15 : 0.04;
    if (act == 6) { aL = -1.1; aR = -1.1; }
    if (act == 14) { aL = -2.6 + s * 0.3; aR = -2.6 - s * 0.3; }
  } else if (act == 3) {
    float s = max(0.0, sin(t * 5.0));
    aR = -2.2 + pow(s, 0.5) * 2.0; aL = -0.5; lean = 0.18 + s * 0.08;
  } else if (act == 23) {
    float s = max(0.0, sin(t * 3.5));
    aR = -2.6 + s * 2.2; aL = -2.4 + s * 2.0; lean = 0.2 + s * 0.2;
  } else if (act == 4) {
    float s = sin(t * 2.6);
    aR = -0.7 - 0.6 * s; aL = -0.7 - 0.6 * s; lean = 0.35 + 0.12 * s;
  } else if (act == 9) {
    float s = sin(t * 3.0);
    aR = -2.4 + 1.8 * max(0.0, s); aL = -2.3 + 1.8 * max(0.0, s); lean = 0.1 + 0.25 * max(0.0, s);
  } else if (act == 5) {
    aR = -0.4 - 0.35 * sin(t * 2.2); aRz = 0.3 + 0.2 * sin(t * 1.3); aL = -0.15; hP = 0.08 * sin(t * 3.1); hY = 0.25 * sin(t * 0.7);
    bY = 0.1 * sin(t * 0.5);
  } else if (act == 7) {
    aR = -2.8 + 0.3 * sin(t * 9.0); aL = -2.6 - 0.3 * sin(t * 9.0); bob = abs(sin(t * 6.0)) * 0.004; hP = -0.2;
  } else if (act == 22) {
    aR = -1.5; aRz = 0.2; hP = -0.35; hY = 0.2;
  } else if (act == 8) {
    aR = -0.25; aL = 0.05; hY = 0.6 * sin(t * 0.35) * step(0.6, sin(t * 0.21)); bob = 0.0006 * sin(t * 1.5);
  } else if (act == 10) {
    lL = -1.45; lR = -1.45; bob = -uHip * 0.55; aL = -0.5; aR = -0.4 - 0.2 * sin(t); hP = 0.1 * sin(t * 1.7);
  } else if (act == 11) {
    aL = -1.0; aR = -1.0; aLz = -0.4; aRz = -0.4; hP = 0.35; lean = 0.12;
  } else if (act == 12) {
    float s = sin(t * 5.0);
    aL = -2.5 + 0.4 * s; aR = -2.5 - 0.4 * s; aLz = 0.4; aRz = 0.4; bY = t * 1.5; bob = abs(s) * 0.006; lL = max(0.0, s) * 0.6; lR = max(0.0, -s) * 0.6;
  } else if (act == 13) {
    aR = -1.1 + 0.05 * sin(t * 0.8); aL = -0.6; bob = -uHip * 0.55; lL = -1.4; lR = -1.4;
  } else if (act == 15) {
    float s = sin(t * 7.0);
    aR = -1.6 - 1.0 * s; aL = -0.9; lean = 0.2 + 0.1 * s; lL = 0.3; lR = -0.3;
  } else if (act == 16) {
    float s = sin(t * 11.0);
    lL = s * 0.8; lR = -s * 0.8; aL = -s * 0.7; aR = s * 0.7; bob = abs(cos(t * 11.0)) * 0.008;
  } else if (act == 17) {
    roll = 1.5; bob = -uHip * 0.8;
  } else {
    aR = -0.05 * sin(t * 0.9); aL = 0.05 * sin(t * 0.9 + 1.0); hY = 0.4 * sin(t * 0.4) * smoothstep(0.3, 0.9, sin(t * 0.17)); bob = 0.0006 * sin(t * 1.8);
  }
  mat3 Rp = mat3(1.0);
  if (part == 4) Rp = rX(lL);
  else if (part == 5) Rp = rX(lR);
  else if (part == 2) Rp = rZ(-aLz) * rX(aL);
  else if (part == 3 || part == 6) Rp = rZ(aRz) * rX(aR);
  else if (part == 1) Rp = rY(hY) * rX(hP);
  else if (part == 7) {
    if (pos.y > uHip * 1.6) Rp = rY(sign(pos.x) * (0.4 + 0.5 * sin(uTime * 40.0 + iAnim.y)));
    else Rp = rY(0.5 * sin(t * 2.0));
  }
  mat3 Rb = rY(bY) * rZ(roll) * rX(lean);
  vec3 hip = vec3(0.0, uHip, 0.0);
  if (part != 4 && part != 5) { rigR = Rb * Rp; rigT = Rb * (aPivot - hip) + hip - rigR * aPivot; }
  else { mat3 Rl = rY(bY) * rZ(roll); rigR = Rl * Rp; rigT = Rl * (aPivot - hip) + hip - rigR * aPivot; }
  rigT.y += bob;
#elif RIG == 1
  float gait = 0.0, head = 0.0;
  if (act == 1 || act == 2) {
    float sp = act == 2 ? 14.0 : 7.0, amp = act == 2 ? 0.7 : 0.45;
    gait = sin(t * sp) * amp;
    bob = abs(cos(t * sp)) * (act == 2 ? 0.005 : 0.002);
    head = act == 2 ? 0.1 : 0.05 * sin(t * sp);
    lean = act == 2 ? 0.08 * sin(t * sp * 2.0) : 0.0;
  } else if (act == 18) {
    head = 1.0; gait = 0.08 * sin(t * 1.5);
  } else if (act == 17) {
    bob = -uHip * 0.8;
  } else if (act == 15) {
    head = -0.3 + 0.3 * sin(t * 6.0); lean = -0.2 + 0.2 * sin(t * 6.0);
  } else {
    head = 0.08 * sin(t * 0.7); hY = 0.3 * sin(t * 0.3);
  }
  mat3 Rp = mat3(1.0);
  if (part == 2 || part == 5) Rp = rX(gait);
  else if (part == 3 || part == 4) Rp = rX(-gait);
  else if (part == 1) Rp = rY(hY) * rX(head);
  else if (part == 7) Rp = rY(0.5 * sin(t * 2.3)) * rX(0.2 * sin(t * 1.7));
  if (act == 17 && part >= 2 && part <= 5) Rp = rX(1.4);
  mat3 Rb = rX(lean);
  vec3 hip = vec3(0.0, uHip, 0.0);
  rigR = Rb * Rp;
  rigT = Rb * (aPivot - hip) + hip - rigR * aPivot;
  rigT.y += bob;
#elif RIG == 2
  float g = sin(t * 12.0) * (act == 1 || act == 2 ? 0.45 : 0.05);
  float lift = max(0.0, cos(t * 12.0)) * (act == 1 || act == 2 ? 0.25 : 0.0);
  mat3 Rp = mat3(1.0);
  if (part == 2 || part == 5) Rp = rY(g) * rZ(lift * sign(aPivot.x));
  else if (part == 3 || part == 4) Rp = rY(-g) * rZ(-lift * sign(aPivot.x) * -1.0);
  rigR = Rp;
  rigT = aPivot - Rp * aPivot;
  rigT.y += abs(sin(t * 12.0)) * 0.002 * step(0.5, float(act));
#elif RIG == 3
  float flap = act == 20 ? 0.12 * sin(t * 2.0) + 0.1 : sin(t * 16.0) * 0.75;
  mat3 Rp = mat3(1.0);
  if (part == 2) Rp = rZ(-flap);
  else if (part == 3) Rp = rZ(flap);
  else if (part == 7) Rp = rY(0.2 * sin(t * 3.0));
  else if (part == 1) Rp = rY(0.25 * sin(t * 0.8));
  rigR = Rp;
  rigT = aPivot - Rp * aPivot;
  rigT.y += (act == 20 ? 0.0 : -sin(t * 16.0) * 0.1) * 0.02;
#elif RIG == 5
  mat3 Rp = mat3(1.0);
  if (part >= 2 && part <= 5) Rp = rX(act == 1 ? t * 7.0 : 0.0);
  else if (part == 7) Rp = rY(0.06 * sin(uTime * 2.1 + iAnim.y));
  rigR = Rp; rigT = aPivot - Rp * aPivot;
  if (act == 21) {
    mat3 Rr = rZ(0.045 * sin(uTime * 1.3 + iAnim.y)) * rX(0.03 * sin(uTime * 0.9 + iAnim.y * 2.0));
    rigR = Rr * rigR; rigT = Rr * rigT + vec3(0.0, 0.006 * sin(uTime * 1.7 + iAnim.y), 0.0);
  }
#else
  float ph = pos.z * 5.0 - t * 2.2;
  rigR = rY(-cos(ph) * 0.5);
  vec3 sp = vec3(0.0, 0.0, pos.z);
  rigT = sp - rigR * sp + vec3(sin(ph) * 0.12, cos(ph) * 0.05 - 0.02, 0.0);
#endif
}
`;

function rigMaterial(rigType, key) {
  const uniforms = { uHip: { value: 0.034 } };
  const vt = `
    if (rigHide > 0.5) transformed = aPivot; else transformed = rigR * transformed + rigT;`;
  const mat = makeKitMaterial({
    key: 'rig-' + key,
    rig: true,
    rim: 0.55,
    side: THREE.DoubleSide,
    uniforms,
    vertexHead: `#define RIG ${rigType}\n` + RIG_HEAD,
    vertexTransform: vt,
    vertexBody: ``,
  });
  // Pose must be computed before normals; inject into beginnormal as well.
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      rigPose(position);
      objectNormal = rigR * objectNormal;`);
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
      {
        int sl = int(aSlot + 0.5);
        vec3 sc = sl == 1 ? iColA : sl == 2 ? iColB : sl == 3 ? iSkin : sl == 4 ? iHair : vec3(1.0);
        vColor.rgb *= sc;
      }`);
  };
  const depth = patchDepthMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), {
    key: 'rig-' + key, uniforms, vertexHead: `#define RIG ${rigType}\n` + RIG_ATTRS + RIG_HEAD,
    vertexTransform: `rigPose(position);` + vt,
  });
  return { mat, depth, uniforms };
}

export class Crowd {
  constructor(scene, geometry, rigType, key, cap = 64, opts = {}) {
    this.geometry = geometry;
    this.rigType = rigType;
    const { mat, depth, uniforms } = rigMaterial(rigType, key);
    uniforms.uHip.value = geometry.userData.hip ?? 0.034;
    this.mat = mat; this.depth = depth;
    this.cap = 0;
    this.count = 0;
    this.scene = scene;
    this.mesh = null;
    this.castShadow = opts.castShadow ?? true;
    this.grow(cap);
  }

  grow(cap) {
    const old = this.mesh;
    this.cap = cap;
    const g = this.geometry.clone();
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.anim = mk(4); this.colA = mk(3); this.colB = mk(3); this.skin = mk(3); this.hair = mk(3);
    g.setAttribute('iAnim', this.anim);
    g.setAttribute('iColA', this.colA);
    g.setAttribute('iColB', this.colB);
    g.setAttribute('iSkin', this.skin);
    g.setAttribute('iHair', this.hair);
    const m = new THREE.InstancedMesh(g, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.customDepthMaterial = this.depth;
    m.castShadow = this.castShadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    if (old) {
      m.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, Math.min(old.instanceMatrix.array.length, m.instanceMatrix.array.length)));
      // A crowd may grow halfway through a frame. Preserve every uploaded actor channel.
      for (const name of ['iAnim', 'iColA', 'iColB', 'iSkin', 'iHair']) {
        g.getAttribute(name).array.set(old.geometry.getAttribute(name).array);
      }
      this.scene.remove(old);
      old.dispose();
      old.geometry.dispose();
    }
    this.mesh = m;
    this.scene.add(m);
  }

  begin() { this.count = 0; }

  // Add one instance for this frame. matrix: THREE.Matrix4. colors: arrays of 3.
  push(matrix, act, phase, speed, tool, a, b, skin, hair) {
    if (this.count >= this.cap) this.grow(Math.ceil(this.cap * 1.6) + 8);
    const i = this.count++;
    matrix.toArray(this.mesh.instanceMatrix.array, i * 16);
    const A = this.anim.array;
    A[i * 4] = act; A[i * 4 + 1] = phase; A[i * 4 + 2] = speed; A[i * 4 + 3] = tool;
    this.colA.array.set(a, i * 3); this.colB.array.set(b, i * 3); this.skin.array.set(skin, i * 3); this.hair.array.set(hair, i * 3);
  }

  end() {
    const n = this.count;
    const m = this.mesh;
    m.count = n;
    for (const [attr, size] of [[m.instanceMatrix, 16], [this.anim, 4], [this.colA, 3], [this.colB, 3], [this.skin, 3], [this.hair, 3]]) {
      attr.clearUpdateRanges();
      if (n) attr.addUpdateRange(0, n * size);
      attr.needsUpdate = n > 0;
    }
    m.visible = n > 0;
  }
}
