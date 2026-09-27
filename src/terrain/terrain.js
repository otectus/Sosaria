// Quadtree LOD terrain on a cube sphere. Chunks are built in workers and swapped in without holes.

import * as THREE from 'three';
import { chunkIndex, chunkSpacing, CHUNK_N } from './chunkgen.js';
import { PLANET_RADIUS, faceUVToDir } from '../core/sphere.js';
import { patchMaterial } from '../render/shared.js';
import { makeOceanMaterial, buildWaterPatch } from '../render/water.js';

const R = PLANET_RADIUS;
const MAX_LEVEL = 8;
const SPLIT_K = 1.75;

export function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0 });
  return patchMaterial(mat, {
    key: 'terrain',
    rim: 0.25,
    vertexHead: `attribute vec4 aSurf; attribute vec3 aMagic; attribute vec4 aFarm; attribute vec4 aRoad; attribute vec4 aRiver;
      varying vec4 vSurf; varying vec3 vMagic; varying vec4 vFarm; varying vec4 vRoad; varying vec4 vRiver;`,
    vertexBody: `vSurf = aSurf; vMagic = aMagic; vFarm = aFarm; vRoad = aRoad; vRiver = aRiver;`,
    fragmentHead: `varying vec4 vSurf; varying vec3 vMagic; varying vec4 vFarm; varying vec4 vRoad; varying vec4 vRiver;
      float gLava = 0.0;
      // Bit-exact port of hash1/hash3 from core/noise.js so crops match the scattered props.
      float hashU(uint n) {
        n = (n ^ 0x27d4eb2du) * 0x9E3779B1u;
        n ^= n >> 15u; n *= 0x85EBCA77u; n ^= n >> 13u; n *= 0xC2B2AE3Du; n ^= n >> 16u;
        return float(n) / 4294967296.0;
      }
      float hash3i(int x, int y, int z) { return hashU(uint(x) * 73856093u ^ uint(y) * 19349663u ^ uint(z) * 83492791u); }
      vec3 cropColor(int c) {
        if (c == 0) return vec3(0.62, 0.45, 0.10);
        if (c == 1) return vec3(0.18, 0.36, 0.05);
        if (c == 2) return vec3(0.20, 0.11, 0.05);
        if (c == 3) return vec3(0.52, 0.42, 0.14);
        if (c == 4) return vec3(0.10, 0.25, 0.08);
        return vec3(0.34, 0.30, 0.36);
      }`,
    fragmentColor: `
      {
        float h = length(vWorldPos) - ${R.toFixed(1)};
        float dist = length(uCamPos - vWorldPos);
        float fine = 1.0 - smoothstep(2.0, 18.0, dist);
        vec3 p = vWorldPos;
        // Rotated domains hide the value-noise lattice.
        vec3 pr = vec3(p.x * 0.8 + p.z * 0.6, p.y, p.z * 0.8 - p.x * 0.6);
        float n1 = vnoise(p * 9.0), n2 = vnoise(pr * 37.0 + 3.1), n3 = vnoise(pr.zxy * 140.0);
        float n3b = vnoise(p.yzx * 97.0 + 7.7);
        float det = (n1 - 0.5) * 0.18 + ((n2 - 0.5) * 0.18 + (n3 + n3b - 1.0) * 0.07) * fine;
        diffuseColor.rgb *= 1.0 + det * (1.0 - vSurf.y);
        diffuseColor.a = 0.0; // outline mask: terrain never gets ink lines
        // farmland patchwork, hedgerows and furrows
        if (vFarm.w > 0.002) {
          float ru = vFarm.x, rv = vFarm.y;
          const float cw = 0.62, ch = 0.95;
          float cj = floor(rv / ch);
          float fx = ru / cw + mod(cj, 2.0) * 0.5;
          float ci = floor(fx);
          float fu = fx - ci, fv = rv / ch - cj;
          int crop = int(floor(hash3i(int(ci), int(cj), int(vFarm.z + 0.5) * 7 + 3) * 6.0));
          vec3 cc = cropColor(crop);
          float fw = fwidth(ru);
          float furrow = 1.0 + 0.14 * sin(ru * 55.0) * (1.0 - smoothstep(0.015, 0.05, fw));
          float speck = 0.9 + 0.2 * n2;
          float ed = min(min(fu, 1.0 - fu) * cw, min(fv, 1.0 - fv) * ch);
          float aa = fwidth(ed) + 1e-4;
          float hedge = 1.0 - smoothstep(0.024, 0.024 + aa * 1.5, ed);
          vec3 fc = mix(cc * furrow * speck, vec3(0.045, 0.11, 0.03) * (0.8 + 0.4 * n3), hedge);
          diffuseColor.rgb = mix(diffuseColor.rgb, fc, vFarm.w);
        }
        // roads: crisp edges from the interpolated offset to the centerline
        if (vRoad.w != 0.0) {
          float rw = abs(vRoad.w);
          float rd = length(vRoad.xyz);
          float aa = fwidth(rd) + 1e-4;
          float k = 1.0 - smoothstep(rw - aa, rw + aa * 1.5, rd);
          vec3 rc;
          if (vRoad.w > 0.0) {
            float rut = 0.85 + 0.15 * smoothstep(0.2, 0.5, abs(rd / max(rw, 1e-3) - 0.45));
            rc = vec3(0.24, 0.17, 0.10) * rut * (0.85 + 0.3 * n2);
          } else {
            // Cobbles projected on the world plane most facing the ground (stable, no swimming).
            vec3 an = abs(normalize(p));
            vec2 pw = an.y > an.x && an.y > an.z ? p.xz : (an.x > an.z ? p.yz : p.xy);
            vec2 q = pw / vec2(0.03, 0.022);
            q.x += mod(floor(q.y), 2.0) * 0.5;
            vec2 cid = floor(q), fq = fract(q) - 0.5;
            float cb = hash13(vec3(cid, 11.0));
            float stoneM = smoothstep(0.62, 0.42, length(fq * vec2(1.0, 1.25)) + (cb - 0.5) * 0.12);
            float cfine = 1.0 - smoothstep(0.35, 0.9, fwidth(q.x));
            rc = vec3(0.21, 0.19, 0.16) * mix(1.0, mix(0.45, 0.7 + 0.6 * cb, stoneM), cfine);
            k = 1.0 - smoothstep(rw - aa, rw + aa, rd);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, rc, k * 0.95);
        }
        // rivers (the water surface itself is drawn up close; this carries them at range)
        if (vRiver.w != 0.0) {
          float vd = length(vRiver.xyz), vw = abs(vRiver.w);
          float aa = fwidth(vd) + 1e-4;
          float k = 1.0 - smoothstep(vw - aa, vw + aa, vd);
          if (vRiver.w < 0.0) { gLava = k; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.02, 0.01), k); }
          else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015, 0.07, 0.1), k);
        }
        // rock: strata and cracks
        float rk = vSurf.x;
        if (rk > 0.01) {
          float strata = 0.9 + 0.1 * sin(h * 22.0 + n1 * 9.0 + n2 * 3.0);
          float cr = 1.0 - abs(vnoise(p * 48.0) * 2.0 - 1.0);
          float crack = smoothstep(0.93, 0.99, cr) * fine;
          float mottle = 0.85 + 0.3 * vnoise(p * 14.0);
          diffuseColor.rgb *= mix(1.0, strata * mottle * (1.0 - crack * 0.45), rk);
        }
        // snow sparkle and blue shading
        float sn = vSurf.y;
        if (sn > 0.01) {
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 0.96, 1.05), sn * n2);
        }
        // shoreline foam and caustics seen through the shallows
        if (h < 0.06 && h > -0.7) {
          float wave = sin(uTime * 1.3 + n1 * 6.0) * 0.012;
          float foam = smoothstep(0.03, 0.0, abs(h - wave + 0.005)) * (0.6 + 0.4 * n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.9), foam * 0.8);
          if (h < 0.0) {
            vec3 cp = p * 22.0 + vec3(uTime * 0.25, uTime * 0.18, -uTime * 0.2);
            float c = pow(1.0 - abs(vnoise(cp) - vnoise(cp * 1.7 + 3.1)), 8.0);
            diffuseColor.rgb += vec3(0.12, 0.2, 0.2) * c * smoothstep(-0.7, -0.05, h) * dayAt(vWorldPos);
          }
        }
      }`,
    fragmentEmissive: `
      {
        float day = dayAt(vWorldPos);
        vec3 p = vWorldPos;
        // lava: flowing crust
        float lv = max(vSurf.z, gLava);
        if (lv > 0.001) {
          float flow = vnoise(p * 18.0 + vec3(0.0, -uTime * 0.25, uTime * 0.2));
          float crust = smoothstep(0.35, 0.75, vnoise(p * 60.0 + vec3(uTime * 0.1)));
          vec3 lava = mix(vec3(4.0, 0.9, 0.12), vec3(1.2, 0.18, 0.02), crust) * (0.6 + 0.8 * flow);
          outgoingLight = mix(outgoingLight, lava, lv * 0.92);
        }
        // settlements: warm glow after dark
        float tg = vSurf.w;
        if (tg > 0.001) {
          float night = 1.0 - day;
          float flick = 0.85 + 0.15 * vnoise(p * 30.0 + uTime * 0.7);
          float far = smoothstep(2.5, 45.0, length(uCamPos - vWorldPos));
          outgoingLight += vec3(1.0, 0.55, 0.22) * tg * night * mix(0.012, 0.2, far) * flick;
        }
        // magic: ley lines and rune cracks pulse, brighter at night
        float mg = dot(vMagic, vec3(0.33));
        if (mg > 0.001) {
          float pulse = 0.55 + 0.45 * sin(uTime * 1.6 - length(p) * 0.0 + vnoise(p * 6.0 + uTime * 0.2) * 9.0);
          float farK = smoothstep(8.0, 120.0, length(uCamPos - vWorldPos));
          outgoingLight += vMagic * (0.12 + 1.0 * (1.0 - day)) * pulse * mix(1.4, 0.8, farK);
        }
      }`,
  });
}

class Node {
  constructor(face, level, ix, iy, parent) {
    this.face = face; this.level = level; this.ix = ix; this.iy = iy; this.parent = parent;
    this.key = `${face}/${level}/${ix}/${iy}`;
    this.children = null;
    this.mesh = null;
    this.state = 0; // 0 none, 1 pending, 2 ready
    this.lastUsed = 0;
    const size = 2 / (1 << level);
    const u = -1 + (ix + 0.5) * size, v = -1 + (iy + 0.5) * size;
    this.dir = new THREE.Vector3(...faceUVToDir(face, u, v));
    this.arc = (Math.PI / 2 * R) / (1 << level);
    // Corner directions bound the angular radius.
    let maxAng = 0;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const c = new THREE.Vector3(...faceUVToDir(face, u + a * size / 2, v + b * size / 2));
      maxAng = Math.max(maxAng, c.angleTo(this.dir));
    }
    this.angRadius = maxAng;
    this.minH = -4; this.maxH = 8;
  }
}

export class Terrain {
  constructor(scene, features, opts = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.material = makeTerrainMaterial();
    this.oceanMaterial = makeOceanMaterial();
    this.index = new THREE.BufferAttribute(chunkIndex(CHUNK_N), 1);
    this.roots = [];
    for (let f = 0; f < 6; f++) this.roots.push(new Node(f, 0, 0, 0, null));
    this.pool = opts.pool;
    this.pending = new Map();
    this.queue = [];
    this.frame = 0;
    this.maxInFlight = opts.maxInFlight || 8;
    this.readyCount = 0;
    this.visibleCount = 0;
    this.nodes = new Map();
    for (const r of this.roots) this.nodes.set(r.key, r);
    this._camDir = new THREE.Vector3();
    this.maxLevel = MAX_LEVEL;
  }

  // Coarse levels loaded up front so the globe never shows holes.
  preload(level = 2) {
    const req = [];
    const walk = (n) => {
      if (n.level === level) { req.push(n); return; }
      this.ensureChildren(n);
      n.children.forEach(walk);
    };
    this.roots.forEach(walk);
    this.roots.forEach(r => req.push(r));
    for (const n of req) this.request(n, n.level);
  }

  ensureChildren(n) {
    if (n.children) return;
    n.children = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const c = new Node(n.face, n.level + 1, n.ix * 2 + i, n.iy * 2 + j, n);
      c.minH = n.minH; c.maxH = n.maxH;
      n.children.push(c);
      this.nodes.set(c.key, c);
    }
  }

  request(n, priority) {
    if (n.state !== 0) return;
    n.state = 1;
    n.priority = priority;
    this.queue.push(n);
  }

  pump() {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.queue.length && this.pending.size < this.maxInFlight) {
      const n = this.queue.shift();
      if (n.state !== 1 || n.disposed) continue;
      if (this._now - n.lastUsed > 1500) { n.state = 0; continue; }
      this.pending.set(n.key, n);
      this.pool.run({ type: 'chunk', face: n.face, level: n.level, ix: n.ix, iy: n.iy }).then(data => {
        this.pending.delete(n.key);
        this.onChunk(n, data);
      });
    }
  }

  onChunk(n, d) {
    if (n.disposed) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    g.setAttribute('aSurf', new THREE.BufferAttribute(d.surf, 4));
    g.setAttribute('aMagic', new THREE.BufferAttribute(d.magic, 3));
    g.setAttribute('aFarm', new THREE.BufferAttribute(d.farm, 4));
    g.setAttribute('aRoad', new THREE.BufferAttribute(d.road, 4));
    g.setAttribute('aRiver', new THREE.BufferAttribute(d.river, 4));
    g.setIndex(this.index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), d.radius);
    const m = new THREE.Mesh(g, this.material);
    m.position.set(d.center[0], d.center[1], d.center[2]);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.receiveShadow = true;
    m.castShadow = n.level >= 5;
    m.visible = false;
    if (d.minH < 0.12) {
      const w = new THREE.Mesh(buildWaterPatch(n.face, n.level, n.ix, n.iy, d.center), this.oceanMaterial);
      w.matrixAutoUpdate = false;
      w.renderOrder = 1;
      m.add(w);
      m.water = w;
    }
    n.mesh = m;
    n.minH = d.minH; n.maxH = d.maxH;
    n.state = 2;
    this.group.add(m);
    this.readyCount++;
  }

  isOccluded(n, camPos, camLen) {
    // Horizon test against a sphere slightly below the lowest terrain.
    const occR = R - 4.5;
    if (camLen <= occR) return false;
    const camHorizon = Math.acos(occR / camLen);
    const top = R + Math.max(n.maxH, 0.5) + 1;
    const nodeHorizon = Math.acos(occR / top);
    this._camDir.copy(camPos).divideScalar(camLen);
    const ang = this._camDir.angleTo(n.dir);
    return ang > camHorizon + nodeHorizon + n.angRadius;
  }

  update(camera, now) {
    this.frame++;
    const camPos = camera.position;
    const camLen = camPos.length();
    this.visibleCount = 0;
    this._now = now;
    for (const r of this.roots) this.visit(r, camPos, camLen);
    this.pump();
    if (this.frame % 60 === 0) this.prune(now);
  }

  distTo(n, camPos) {
    // Distance from camera to the node's surface patch (bounding cap).
    const camLen = camPos.length();
    const ang = Math.max(0, this._camDir.copy(camPos).divideScalar(camLen).angleTo(n.dir) - n.angRadius);
    const surfR = R + Math.min(Math.max(camLen - R, n.minH), n.maxH);
    // Law of cosines between camera and the nearest point of the cap.
    return Math.sqrt(Math.max(0, camLen * camLen + surfR * surfR - 2 * camLen * surfR * Math.cos(ang)));
  }

  visit(n, camPos, camLen) {
    n.lastUsed = this._now;
    const occluded = this.isOccluded(n, camPos, camLen);
    const dist = this.distTo(n, camPos);
    const wantSplit = !occluded && n.level < this.maxLevel && dist < SPLIT_K * n.arc && (n.level < 2 || n.maxH > -3.5 || dist < n.arc * 0.8);
    if (wantSplit) {
      this.ensureChildren(n);
      let all = true;
      for (const c of n.children) if (!this.visit(c, camPos, camLen)) all = false;
      if (all) { this.show(n, false); return true; }
      for (const c of n.children) this.hideSubtree(c);
      if (n.state === 2) { this.show(n, !occluded); return true; }
      this.request(n, n.level * 100 + dist / n.arc);
      return false;
    }
    if (n.state === 2) {
      this.show(n, !occluded);
      if (n.children) for (const c of n.children) this.hideSubtree(c);
      return true;
    }
    this.request(n, n.level * 100 + dist / n.arc);
    if (n.children) {
      let all = true;
      for (const c of n.children) if (!this.coverExisting(c, occluded)) all = false;
      if (!all) for (const c of n.children) this.hideSubtree(c);
      return all;
    }
    return false;
  }

  coverExisting(n, occluded) {
    n.lastUsed = this._now;
    if (n.state === 2) { this.show(n, !occluded); if (n.children) for (const c of n.children) this.hideSubtree(c); return true; }
    if (!n.children) return false;
    let all = true;
    for (const c of n.children) if (!this.coverExisting(c, occluded)) all = false;
    return all;
  }

  show(n, v) {
    if (n.mesh) { n.mesh.visible = v; if (v) this.visibleCount++; }
  }

  hideSubtree(n) {
    if (n.mesh) n.mesh.visible = false;
    if (n.children) for (const c of n.children) this.hideSubtree(c);
  }

  prune(now) {
    // Drop whole child sets (level >= 3) that have not been visited for a while.
    for (const n of Array.from(this.nodes.values())) {
      if (!n.children || n.level < 2 || n.disposed) continue;
      if (n.children.every(c => now - c.lastUsed > 8000 && c.state !== 1 && !this.busy(c))) {
        for (const c of n.children) this.disposeSubtree(c);
        n.children = null;
      }
    }
  }

  busy(n) {
    if (this.pending.has(n.key)) return true;
    return !!(n.children && n.children.some(c => this.busy(c)));
  }

  disposeSubtree(n) {
    if (n.children) for (const c of n.children) this.disposeSubtree(c);
    if (n.mesh) {
      this.group.remove(n.mesh);
      n.mesh.geometry.dispose();
      if (n.mesh.water) n.mesh.water.geometry.dispose();
      n.mesh = null;
    }
    n.state = 0;
    n.disposed = true;
    this.nodes.delete(n.key);
  }

  // Highest-detail loaded chunk under a direction (for debugging only).
  get stats() {
    return { ready: this.readyCount, visible: this.visibleCount, queue: this.queue.length, inflight: this.pending.size, nodes: this.nodes.size };
  }
}

export { chunkSpacing };
