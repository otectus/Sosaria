// Animated props hung on structure anchors: windmill sails, water wheels, heraldic banners,
// lighthouse beams and the swirl of the Gate of Ages.

import * as THREE from 'three';
import { Kit, M, col } from '../models/kit.js';
import { makeKitMaterial } from './materials.js';
import { GLSL_COMMON, U } from './shared.js';

function sailsGeometry() {
  const k = new Kit();
  const wood = col(0x6b4a2f), cloth = col(0xe9dfc6);
  k.box(0, -0.01, -0.02, 0.02, 0.02, 0.04, wood, M.wood);
  for (let i = 0; i < 4; i++) {
    k.push().at(0, 0, 0).rot(0, 0, (i * Math.PI) / 2);
    k.box(0, 0, 0, 0.008, 1.0, 0.006, wood, M.wood);
    k.box(0.05, 0.18, 0.004, 0.08, 0.78, 0.003, cloth, M.cloth);
    for (let j = 0; j < 5; j++) k.box(0.05, 0.2 + j * 0.16, 0.007, 0.09, 0.004, 0.003, wood, M.wood);
    k.pop();
  }
  return k.build();
}
function wheelGeometry() {
  const k = new Kit();
  const wood = col(0x5a3d26);
  k.push().rot(0, 0, Math.PI / 2);
  k.cyl(0, -0.05, 0, 1, 1, 0.02, 14, wood, M.wood, { top: false });
  k.cyl(0, 0.03, 0, 1, 1, 0.02, 14, wood, M.wood, { top: false });
  k.pop();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.push().at(0, 0, 0).rot(a, 0, 0);
    k.box(0, 0, 0.0, 0.1, 0.05, 1.9, wood, M.wood);
    k.pop();
  }
  return k.build();
}
function bannerGeometry() {
  const k = new Kit();
  k.box(0, 0, 0, 0.012, 1.0, 0.012, col(0x3a2819), M.wood);
  k.cone(0, 1.0, 0, 0.012, 0.04, 5, col(0xd9aa4c), M.gold);
  // cloth: many columns so it can wave (x from 0 to 0.55)
  const cols = 8;
  for (let i = 0; i < cols; i++) {
    const x0 = 0.01 + (i / cols) * 0.55, x1 = 0.01 + ((i + 1) / cols) * 0.55;
    k.quad([x0, 0.55, 0], [x1, 0.55, 0], [x1, 0.97, 0], [x0, 0.97, 0], [1, 1, 1], M.cloth);
    k.quad([x1, 0.55, 0], [x0, 0.55, 0], [x0, 0.97, 0], [x1, 0.97, 0], [1, 1, 1], M.cloth);
  }
  return k.build();
}

const CULTURE_BANNER = {
  human: 0x2a4f9e, elf: 0x2c8a9a, dwarf: 0xc79a3c, fae: 0xb35ad6, beast: 0x9e3a2a, draconic: 0xa3201c, undead: 0x2f6f4a, ruin: 0x6b6b6b,
};

export class Props {
  constructor(scene, structures) {
    const A = structures.anchors;
    const group = new THREE.Group();
    group.name = 'props';
    scene.add(group);
    this.group = group;

    const inst = (geo, mat, list, fn, name) => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      const tmp = new THREE.Matrix4();
      list.forEach((a, i) => { fn(a, tmp, i); m.setMatrixAt(i, tmp); });
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false;
      m.name = name;
      group.add(m);
      return m;
    };
    // Orientation of an anchor = its structure's rotation, placed at the anchor point.
    const placeAt = (a, s, out) => {
      const rot = new THREE.Matrix4().extractRotation(a.matrix);
      const sc = new THREE.Vector3().setFromMatrixScale(a.matrix);
      out.copy(rot).scale(new THREE.Vector3(s * sc.x, s * sc.y, s * sc.z)).setPosition(a.p);
      return out;
    };

    const sailMat = makeKitMaterial({ key: 'sails', side: THREE.DoubleSide, vertexTransform: `{
      float ang = uTime * 0.9 + float(gl_InstanceID) * 1.7;
      float c = cos(ang), s = sin(ang);
      transformed.xy = vec2(c * transformed.x - s * transformed.y, s * transformed.x + c * transformed.y);
    }` });
    this.sails = inst(sailsGeometry(), sailMat, A.sails, (a, m) => placeAt(a, a.size, m), 'sails');

    const wheelMat = makeKitMaterial({ key: 'wheels', vertexTransform: `{
      float ang = -uTime * 0.8 + float(gl_InstanceID);
      float c = cos(ang), s = sin(ang);
      transformed.yz = vec2(c * transformed.y - s * transformed.z, s * transformed.y + c * transformed.z);
    }` });
    this.wheels = inst(wheelGeometry(), wheelMat, A.wheel, (a, m) => placeAt(a, a.size, m), 'wheels');

    const bannerMat = makeKitMaterial({ key: 'banners', side: THREE.DoubleSide, rim: 0.2, vertexTransform: `{
      float x = max(0.0, transformed.x - 0.01);
      float ph = float(gl_InstanceID) * 2.3;
      transformed.z += sin(x * 12.0 - uTime * 5.0 + ph) * x * 0.22 + sin(x * 25.0 - uTime * 9.0 + ph) * x * 0.05;
      transformed.y -= x * x * 0.12;
    }` });
    const bannerColor = new THREE.Color();
    this.banners = inst(bannerGeometry(), bannerMat, A.banner, (a, m) => {
      placeAt(a, a.size, m);
    }, 'banners');
    if (this.banners) {
      A.banner.forEach((a, i) => {
        const cult = a.site ? a.site.s.culture : 'human';
        bannerColor.setHex(CULTURE_BANNER[cult] || 0x2a4f9e);
        this.banners.setColorAt(i, bannerColor);
      });
      this.banners.instanceColor.needsUpdate = true;
      // Banners should hang from the anchor's top, not stand on it.
      A.banner.forEach((a, i) => {
        const m = new THREE.Matrix4();
        this.banners.getMatrixAt(i, m);
        const up = a.p.clone().normalize();
        m.setPosition(a.p.clone().addScaledVector(up, -a.size * 0.9));
        this.banners.setMatrixAt(i, m);
      });
      this.banners.instanceMatrix.needsUpdate = true;
    }

    // Lighthouse beams and portal swirls: additive cards that only show at night.
    this.beams = [];
    for (const b of A.beam) {
      const isPortal = b.rec.model === 'portal';
      const isIsle = b.rec.model === 'floatisle';
      if (isIsle) continue;
      const mesh = isPortal ? this.makePortal(b) : this.makeBeam(b);
      group.add(mesh);
      this.beams.push(mesh);
    }
  }

  makeBeam(b) {
    const g = new THREE.PlaneGeometry(2.4, 0.16, 8, 1);
    g.translate(1.2, 0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${GLSL_COMMON}
        varying vec2 vUv; varying vec3 vW;
        void main(){ float night = 1.0 - dayAt(vW); float a = (1.0 - vUv.x) * (1.0 - abs(vUv.y - 0.5) * 2.0) * night * 0.8;
          gl_FragColor = vec4(vec3(2.5, 2.1, 1.3) * a, a); }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.position.copy(b.p);
    m.userData.up = b.p.clone().normalize();
    m.userData.kind = 'beam';
    m.frustumCulled = false;
    m.renderOrder = 9;
    return m;
  }

  makePortal(b) {
    const g = new THREE.CircleGeometry(0.5, 40);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${GLSL_COMMON}
        varying vec2 vUv; varying vec3 vW;
        void main(){
          vec2 q = vUv - 0.5; float r = length(q) * 2.0; float a = atan(q.y, q.x);
          float sw = sin(a * 5.0 + r * 12.0 - uTime * 2.2) * 0.5 + 0.5;
          float night = 1.0 - dayAt(vW);
          float k = smoothstep(1.0, 0.3, r) * (0.35 + 0.65 * sw) * (0.3 + night);
          vec3 c = mix(vec3(0.3, 1.6, 2.4), vec3(1.4, 0.5, 2.2), sw);
          gl_FragColor = vec4(c * k, k);
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    const rot = new THREE.Matrix4().extractRotation(b.matrix);
    m.quaternion.setFromRotationMatrix(rot);
    m.position.copy(b.p);
    m.frustumCulled = false;
    m.userData.kind = 'portal';
    m.renderOrder = 9;
    return m;
  }

  update(t) {
    for (const m of this.beams) {
      if (m.userData.kind !== 'beam') continue;
      const up = m.userData.up;
      const tx = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
      const ty = new THREE.Vector3().crossVectors(up, tx);
      const a = t * 1.1;
      const dir = tx.clone().multiplyScalar(Math.cos(a)).addScaledVector(ty, Math.sin(a));
      const side = new THREE.Vector3().crossVectors(up, dir);
      m.matrix.makeBasis(dir, up, side).setPosition(m.position);
      m.matrixAutoUpdate = false;
      m.matrixWorldNeedsUpdate = true;
    }
  }
}
