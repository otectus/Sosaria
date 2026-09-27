// River ribbons (with waterfalls where the bed drops), lake surfaces and the lava flow.

import * as THREE from 'three';
import { GLSL_COMMON, U } from './shared.js';
import { WATER_GLSL } from './water.js';
import { PLANET_RADIUS, tangentFrame, normalize } from '../core/sphere.js';

const R = PLANET_RADIUS;

function riverMaterial(lava) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent: !lava,
    depthWrite: true,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      attribute vec2 aFlow; // x: across (-1..1), y: distance along (world units)
      attribute float aSteep;
      varying vec3 vWorldPos; varying vec2 vFlow; varying float vSteep; varying vec3 vN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz; vFlow = aFlow; vSteep = aSteep;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        mv.xyz *= 1.0 - 0.0015;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_COMMON}
      ${WATER_GLSL}
      varying vec3 vWorldPos; varying vec2 vFlow; varying float vSteep; varying vec3 vN;
      void main() {
        vec3 wp = vWorldPos;
        vec3 up = normalize(wp);
        vec3 V = normalize(uCamPos - wp);
        float dist = length(uCamPos - wp);
        float t = uTime;
        ${lava ? `
        float flow = vnoise(vec3(vFlow.x * 2.0, vFlow.y * 3.0 - t * 0.35, 0.5));
        float crust = smoothstep(0.45, 0.8, vnoise(vec3(vFlow.x * 5.0, vFlow.y * 9.0 - t * 0.35, 2.0)));
        vec3 c = mix(vec3(5.0, 1.4, 0.18), vec3(0.9, 0.12, 0.02), crust) * (0.55 + 0.9 * flow);
        c *= 0.8 + 0.4 * smoothstep(0.9, 0.2, abs(vFlow.x));
        gl_FragColor = vec4(c, 1.0);
        ` : `
        float speed = 0.25 + vSteep * 2.2;
        vec2 fp = vec2(vFlow.x * 1.5, vFlow.y * 7.0 - t * speed * 7.0);
        float streak = vnoise(vec3(fp, 1.0)) * 0.6 + vnoise(vec3(fp * vec2(3.0, 2.2), 4.0)) * 0.4;
        vec3 N = normalize(vN + (vec3(streak) - 0.5) * 0.25 * (1.0 - smoothstep(4.0, 20.0, dist)) + waveSlope(wp * 4.0, up, t, 0.03, 1.0));
        vec3 deep = vec3(0.02, 0.09, 0.1);
        vec3 col = shadeWater(wp, N, up, V, deep, 600.0, dist);
        // Foam at the banks, over rapids and down waterfalls.
        float bank = smoothstep(0.7, 1.0, abs(vFlow.x));
        float foam = bank * smoothstep(0.45, 0.75, streak) * 0.6;
        foam = max(foam, vSteep * smoothstep(0.25, 0.7, streak));
        vec3 light = skyAmbient(up, wp) + sunTint(dot(up, uSunDir)) * smoothstep(-0.05, 0.1, dot(up, uSunDir)) * 0.9;
        col = mix(col, vec3(0.85, 0.9, 0.92) * light, foam * 0.85);
        float alpha = mix(0.78, 0.95, max(foam, pow(1.0 - max(dot(up, V), 0.0), 3.0)));
        alpha *= smoothstep(1.0, 0.92, abs(vFlow.x));
        gl_FragColor = vec4(col, alpha);
        `}
      }`,
  });
}

export class Waters {
  constructor(scene, world) {
    this.group = new THREE.Group();
    this.group.name = 'waters';
    scene.add(this.group);
    this.falls = [];
    const water = riverMaterial(false), lava = riverMaterial(true);
    for (const rv of world.rivers) this.buildRiver(rv, rv.lava ? lava : water);
    this.lakeMat = this.makeLakeMaterial();
    for (const lk of world.lakes) this.buildLake(lk, world);
  }

  buildRiver(rv, mat) {
    const n = rv.dirs.length;
    // Split into chunks so frustum culling can skip unseen stretches.
    const CH = 40;
    let dist = 0;
    const along = [0];
    for (let i = 1; i < n; i++) {
      const a = rv.dirs[i - 1], b = rv.dirs[i];
      dist += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * R;
      along.push(dist);
    }
    for (let c0 = 0; c0 < n - 1; c0 += CH) {
      const c1 = Math.min(n - 1, c0 + CH);
      const pos = [], flow = [], steep = [], nrm = [], idx = [];
      const center = new THREE.Vector3(...rv.dirs[c0]).multiplyScalar(R);
      for (let i = c0; i <= c1; i++) {
        const d = rv.dirs[i];
        const prev = rv.dirs[Math.max(0, i - 1)], next = rv.dirs[Math.min(n - 1, i + 1)];
        const tan = normalize([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
        const side = normalize([d[1] * tan[2] - d[2] * tan[1], d[2] * tan[0] - d[0] * tan[2], d[0] * tan[1] - d[1] * tan[0]]);
        const w = rv.widths[i] + (rv.lava ? 0.02 : 0.05);
        const lvl = rv.levels[i] + (rv.lava ? 0.01 : 0.0);
        const drop = Math.max(rv.levels[Math.max(0, i - 1)] - rv.levels[i], rv.levels[i] - rv.levels[Math.min(n - 1, i + 1)]);
        const st = Math.min(1, Math.max(0, (drop - 0.04) / 0.2));
        for (const sgn of [-1, 1]) {
          const p = normalize([d[0] + side[0] * sgn * w / R, d[1] + side[1] * sgn * w / R, d[2] + side[2] * sgn * w / R]);
          pos.push(p[0] * (R + lvl) - center.x, p[1] * (R + lvl) - center.y, p[2] * (R + lvl) - center.z);
          nrm.push(p[0], p[1], p[2]);
          flow.push(sgn, along[i]);
          steep.push(st);
        }
      }
      for (let i = 0; i < c1 - c0; i++) {
        const a = i * 2, b = a + 1, c = a + 2, dd = a + 3;
        idx.push(a, c, b, b, c, dd);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
      g.setAttribute('aSteep', new THREE.Float32BufferAttribute(steep, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.position.copy(center);
      m.renderOrder = 2;
      this.group.add(m);
    }
    // Waterfall sites for mist emitters.
    if (!rv.lava) {
      for (const i of rv.falls) {
        const d = rv.dirs[i + 1];
        this.falls.push({ p: new THREE.Vector3(...d).multiplyScalar(R + rv.levels[i + 1] + 0.02), width: rv.widths[i], drop: rv.levels[i] - rv.levels[i + 1] });
      }
    } else {
      // Lava reaching the sea throws up steam.
      const d = rv.dirs[n - 1];
      this.lavaMouth = new THREE.Vector3(...d).multiplyScalar(R + 0.05);
    }
  }

  makeLakeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { ...U },
      transparent: true,
      depthWrite: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      vertexShader: /* glsl */`
        attribute float aMagic;
        varying vec3 vWorldPos; varying float vMagic; varying float vEdge;
        attribute float aEdge;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz; vMagic = aMagic; vEdge = aEdge;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        ${GLSL_COMMON}
        ${WATER_GLSL}
        varying vec3 vWorldPos; varying float vMagic; varying float vEdge;
        void main() {
          vec3 wp = vWorldPos;
          vec3 up = normalize(wp);
          vec3 V = normalize(uCamPos - wp);
          float dist = length(uCamPos - wp);
          vec3 g = waveSlope(wp * 5.0, up, uTime * 0.7, 0.025, 1.0 - smoothstep(3.0, 20.0, dist));
          vec3 N = normalize(up - g);
          vec3 deep = mix(vec3(0.02, 0.08, 0.1), vec3(0.03, 0.2, 0.3), vMagic);
          vec3 col = shadeWater(wp, N, up, V, deep, 900.0, dist);
          if (vMagic > 0.0) {
            float night = 1.0 - dayAt(wp);
            float sw = vnoise(wp * 20.0 + vec3(uTime * 0.3)) * vnoise(wp * 7.0 - vec3(uTime * 0.2));
            col += vec3(0.2, 1.1, 1.5) * vMagic * (0.25 + night * 0.9) * (0.5 + sw);
          }
          float alpha = mix(0.8, 0.96, pow(1.0 - max(dot(up, V), 0.0), 3.0));
          gl_FragColor = vec4(col, alpha);
        }`,
    });
  }

  buildLake(lk, world) {
    const rings = 10, segs = 48;
    const rMax = lk.r * 1.35 + 0.15;
    const d = lk.d;
    const { east, north } = tangentFrame(d);
    const center = new THREE.Vector3(...d).multiplyScalar(R + lk.level);
    const pos = [0, 0, 0], magic = [], edge = [0], idx = [];
    const mg = lk.id === 'moonpool' ? 1 : lk.id === 'sundered' ? 0.45 : 0;
    magic.push(mg);
    for (let r = 1; r <= rings; r++) {
      const rr = (r / rings) * rMax;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        const p = normalize([d[0] + (east[0] * x + north[0] * y) / R, d[1] + (east[1] * x + north[1] * y) / R, d[2] + (east[2] * x + north[2] * y) / R]);
        pos.push(p[0] * (R + lk.level) - center.x, p[1] * (R + lk.level) - center.y, p[2] * (R + lk.level) - center.z);
        magic.push(mg);
        edge.push(r / rings);
      }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
    for (let r = 1; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + ((s + 1) % segs);
        const c = a + segs, dd = b + segs;
        idx.push(a, c, b, b, c, dd);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aMagic', new THREE.Float32BufferAttribute(magic, 1));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.lakeMat);
    m.position.copy(center);
    m.renderOrder = 2;
    this.group.add(m);
  }
}
