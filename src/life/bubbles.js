// Little speech and emote bubbles over townsfolk: chatter, alarm, music, rumor and sleep.

import * as THREE from 'three';
import { ACT } from '../render/rig.js';

const GLYPHS = ['talk', 'alarm', 'music', 'rumor', 'heart', 'coin'];
const MAX = 64;

function atlasTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = S * GLYPHS.length; cv.height = S;
  const g = cv.getContext('2d');
  GLYPHS.forEach((name, i) => {
    const x0 = i * S;
    g.save();
    g.translate(x0, 0);
    // Parchment speech bubble with an ink outline and a tail.
    g.fillStyle = '#f3ead6'; g.strokeStyle = '#2a2018'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(14, 8); g.lineTo(50, 8); g.quadraticCurveTo(58, 8, 58, 16); g.lineTo(58, 36); g.quadraticCurveTo(58, 44, 50, 44);
    g.lineTo(30, 44); g.lineTo(20, 56); g.lineTo(22, 44); g.lineTo(14, 44); g.quadraticCurveTo(6, 44, 6, 36); g.lineTo(6, 16); g.quadraticCurveTo(6, 8, 14, 8);
    g.fill(); g.stroke();
    g.fillStyle = '#2a2018';
    g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (name === 'talk') { for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(20 + k * 12, 26, 3.5, 0, Math.PI * 2); g.fill(); } }
    else if (name === 'alarm') { g.fillStyle = '#b3342a'; g.fillText('!', 32, 27); }
    else if (name === 'music') { g.fillText('♪', 32, 28); }
    else if (name === 'rumor') { g.fillStyle = '#1f5f8a'; g.fillText('?', 32, 28); }
    else if (name === 'heart') { g.fillStyle = '#c0395a'; g.fillText('♥', 32, 28); }
    else if (name === 'coin') { g.fillStyle = '#b98a2a'; g.beginPath(); g.arc(32, 26, 10, 0, Math.PI * 2); g.fill(); }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Bubbles {
  constructor(scene) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.glyph = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iGlyph', this.glyph);
    g.instanceCount = 0;
    this.g = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { tAtlas: { value: atlasTexture() }, uCount: { value: GLYPHS.length } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec4 iPos; attribute vec2 iGlyph; varying vec2 vUv; varying float vA;
        uniform float uCount;
        void main() {
          vUv = vec2((uv.x + iGlyph.x) / uCount, uv.y); vA = iGlyph.y;
          vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
          mv.xy += position.xy * iPos.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tAtlas; varying vec2 vUv; varying float vA;
        void main() { vec4 c = texture2D(tAtlas, vUv); if (c.a < 0.05) discard; gl_FragColor = vec4(pow(c.rgb, vec3(2.2)) * 1.4, c.a * vA); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
  }

  update(people, camera, t) {
    let n = 0;
    const cam = camera.position;
    const add = (p, glyph, alpha, dist) => {
      if (n >= MAX) return;
      const up = p.clone().normalize();
      const q = p.clone().addScaledVector(up, 0.085 + 0.004 * Math.sin(t * 3 + n));
      const s = 0.034 + dist * 0.004;
      this.pos.array.set([q.x, q.y, q.z, s], n * 4);
      this.glyph.array[n * 2] = glyph; this.glyph.array[n * 2 + 1] = alpha;
      n++;
    };
    for (const sim of people.active.values()) {
      const alarm = sim.alarm && sim.alarm.until > people.time ? sim.alarm : null;
      const rumor = sim.rumorUntil && sim.rumorUntil > people.time;
      for (const ag of sim.agents) {
        if (ag.inside || !ag.world) continue;
        const dist = ag.world.distanceTo(cam);
        if (dist > 3.5) continue;
        let glyph = -1;
        const cyc = (t * 0.35 + ag.id * 0.137) % 1;
        if (alarm) { if ((alarm.kind === 'festival' && (ag.act === ACT.dance || ag.act === ACT.cheer)) && cyc < 0.3) glyph = 2; else if (alarm.kind !== 'festival' && cyc < 0.45 && ag.id % 2) glyph = 1; }
        else if (ag.act === ACT.talk && cyc < (rumor ? 0.5 : 0.22)) glyph = rumor && ag.id % 2 ? 3 : ag.role === 'merchant' ? 5 : 0;
        else if ((ag.act === ACT.dance || ag.act === ACT.cheer) && cyc < 0.3) glyph = 2;
        else if (ag.race === 'fae' && ag.act === ACT.dance && cyc < 0.2) glyph = 4;
        if (glyph < 0) continue;
        const fade = Math.min(1, cyc * 12, (0.3 - Math.min(0.3, cyc)) * 12 + 0.2) * (1 - Math.max(0, (dist - 2.5)));
        add(ag.world, glyph, Math.max(0, Math.min(1, fade)), dist);
      }
    }
    this.g.instanceCount = n;
    this.pos.needsUpdate = true; this.glyph.needsUpdate = true;
  }
}
