// HUD: world plaque, time controls, Chronicle, Atlas, map labels, hover cards and follow mode.

import * as THREE from 'three';
import { PLANET_RADIUS, dirToLatLon, latLonToDir } from '../core/sphere.js';
import { timeOfDayName } from '../render/sky.js';
import { REGIONS } from '../world/atlas.js';
import { DOING } from '../life/people.js';

const R = PLANET_RADIUS;

const ICONS = {
  dragon: '<path d="M3 13c2-1 3-3 3-5 1 1 2 1 3 0-1-1-1-3 1-4 1 2 3 2 5 1-1 2-3 3-4 5 1 1 3 1 4 0-1 3-4 4-7 4-2 0-4 0-5-1z"/>',
  flame: '<path d="M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-5 0-7z"/>',
  sword: '<path d="M12 1l3 0 0 3-7 7 1 1-1 1-1-1-2 2 1 1-1 1-3-3 1-1 1 1 2-2-1-1 1-1 1 1z"/>',
  coin: '<circle cx="8" cy="8" r="6"/><path d="M8 4v8M6 6h3.5a1.5 1.5 0 0 1 0 3H6.5a1.5 1.5 0 0 0 0 3H10" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  music: '<path d="M6 3l8-2v9a2.5 2.5 0 1 1-1.5-2.3V4l-5 1.2v7a2.5 2.5 0 1 1-1.5-2.3z"/>',
  rune: '<path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  skull: '<path d="M8 1a6 6 0 0 0-6 6c0 2 1 3 2 4v3h2v-2h1v2h2v-2h1v2h2v-3c1-1 2-2 2-4a6 6 0 0 0-6-6zM5.5 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>',
  crown: '<path d="M2 12l1-7 3 3 2-5 2 5 3-3 1 7z"/>',
  wave: '<path d="M1 10c2-2 3-2 4.5 0S8 12 10 10s3-2 5 0v3H1z"/>',
  rumor: '<path d="M2 3h12v8H7l-3 3v-3H2z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5.5" cy="7" r="1"/><circle cx="8" cy="7" r="1"/><circle cx="10.5" cy="7" r="1"/>',
  beast: '<circle cx="8" cy="11" r="3"/><circle cx="3.5" cy="7" r="1.6"/><circle cx="6.5" cy="4" r="1.6"/><circle cx="9.5" cy="4" r="1.6"/><circle cx="12.5" cy="7" r="1.6"/>',
  castle: '<path d="M2 14V6h2v2h2V6h1V3l1-1 1 1v3h1v2h2V6h2v8H9v-3H7v3z"/>',
  star: '<path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z"/>',
  eye: '<path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2"/>',
};
const icon = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 16 16" aria-hidden="true">${ICONS[k] || ICONS.star}</svg>`;

const SEAS = [
  { name: 'The Sapphire Sea', lat: 8, lon: -30 }, { name: 'The Ashen Deep', lat: -5, lon: 70 }, { name: 'Sea of Whispers', lat: 5, lon: -140 },
  { name: 'The Drowned Expanse', lat: -45, lon: -60 }, { name: 'Wyrmwater', lat: 30, lon: 115 }, { name: 'The Pale Gulf', lat: -50, lon: 100 },
];

const CULTURE_WORD = { human: 'Human', elf: 'Elven', dwarf: 'Dwarven', fae: 'Faeborne', beast: 'Beastfolk', draconic: 'Dragonkin', undead: 'Undead', ruin: 'Ruined' };
const KIND_WORD = { capital: 'capital', city: 'city', port: 'port', town: 'town', village: 'village', hamlet: 'hamlet', castle: 'castle', fort: 'fort', hold: 'mountain hold',
  mine: 'mine', enclave: 'enclave', glade: 'glade', circle: 'sacred circle', camp: 'war-camp', temple: 'temple-city', necropolis: 'necropolis', barrow: 'barrow', monastery: 'abbey', ruin: 'ruin', stilts: 'stilt village', lighthouse: 'lighthouse' };

export class HUD {
  constructor(app) {
    this.app = app;
    const root = document.getElementById('ui');
    this.root = root;
    root.innerHTML = `
      <div class="labels" id="labels"></div>
      <header class="plaque" id="plaque">
        <div class="plaque-title">Sosaria</div>
        <div class="plaque-row"><span id="dial" class="dial" aria-hidden="true"></span><span id="when">Day 1</span></div>
        <div class="plaque-where" id="where">The Wilds</div>
      </header>
      <details class="graphics" id="graphics">
        <summary>Graphics</summary>
        <label for="render-quality">Visual quality</label>
        <select id="render-quality">
          <option value="auto">Auto · adapts to your device</option>
          <option value="performance">Performance</option>
          <option value="balanced">Balanced</option>
          <option value="cinematic">Cinematic</option>
        </select>
        <p>Auto balances detail and smoothness as you explore.</p>
      </details>
      <nav class="toolbar" aria-label="Time">
        <button class="tbtn" id="pause" title="Pause or resume time (Space)" aria-label="Pause time">${pauseIcon()}</button>
        <div class="speeds" role="group" aria-label="Time speed">
          ${[1, 4, 16, 64].map(v => `<button class="sbtn" data-speed="${v}" id="speed-${v}">${v}×</button>`).join('')}
        </div>
        <span class="clock-sep"></span>
        <button class="tbtn text" id="btn-atlas" aria-expanded="false">Atlas</button>
        <button class="tbtn text" id="btn-chron" aria-expanded="true">Chronicle</button>
      </nav>
      <aside class="panel chronicle open" id="chronicle" aria-label="Chronicle">
        <div class="panel-head"><h2>Chronicle</h2><span class="panel-sub">What the world is up to</span></div>
        <ol class="chron-list" id="chron-list"></ol>
      </aside>
      <aside class="panel atlas" id="atlas" aria-label="Atlas">
        <div class="panel-head"><h2>Atlas</h2><span class="panel-sub">Places, wonders and wyrms</span></div>
        <div class="atlas-body" id="atlas-body"></div>
      </aside>
      <div class="card" id="card" hidden></div>
      <div class="follow" id="follow" hidden></div>
      <div class="hint" id="hint">Drag to turn the world · Scroll to descend · Right-drag to tilt · Double-click to dive · Click anything alive to follow it</div>
      <div class="compass" id="compass" title="Face north" role="button" tabindex="0"><div class="needle" id="needle"></div><span>N</span></div>
    `;
    this.labelsEl = document.getElementById('labels');
    this.cardEl = document.getElementById('card');
    this.followEl = document.getElementById('follow');
    this.chronList = document.getElementById('chron-list');
    this.labels = [];
    this.buildLabels();
    this.buildAtlas();
    this.bind();
    this.hover = null;
    this.followTarget = null;
    this.frame = 0;
    app.events.on(e => this.addEntry(e));
    for (const e of app.events.log.slice().reverse()) this.addEntry(e);
    this.setSpeed(1);
    if (window.innerWidth < 1100) this.togglePanel('chronicle', false);
  }

  bind() {
    const app = this.app;
    const quality = document.getElementById('render-quality');
    quality.value = app.quality.mode;
    quality.onchange = () => app.setQuality(quality.value);
    document.getElementById('graphics').addEventListener('keydown', e => e.stopPropagation());
    document.getElementById('pause').onclick = () => this.togglePause();
    for (const b of this.root.querySelectorAll('.sbtn')) b.onclick = () => this.setSpeed(+b.dataset.speed);
    document.getElementById('btn-atlas').onclick = () => this.togglePanel('atlas');
    document.getElementById('btn-chron').onclick = () => this.togglePanel('chronicle');
    const compass = document.getElementById('compass');
    compass.onclick = () => app.controls.resetForward(0);
    compass.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') app.controls.resetForward(0); };
    window.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
      if (e.key === 'Escape') this.stopFollow();
    });
    const canvas = app.renderer.domElement;
    let lastMove = 0;
    canvas.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (now - lastMove < 60) return;
      lastMove = now;
      if (app.controls.pointers.size) { this.setHover(null); return; }
      this.setHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerleave', () => this.setHover(null));
    app.controls.onClick = (x, y) => {
      const hit = this.pick(x, y);
      if (hit) this.activate(hit);
    };
    app.controls.onUserInput = () => {
      document.getElementById('hint').classList.add('gone');
      if (!app.controls.followFn && this.followTarget) this.stopFollow(true);
    };
  }

  togglePause() {
    const c = this.app.clock;
    c.paused = !c.paused;
    document.getElementById('pause').innerHTML = c.paused ? playIcon() : pauseIcon();
    document.getElementById('pause').setAttribute('aria-label', c.paused ? 'Resume time' : 'Pause time');
  }

  setSpeed(v) {
    this.app.clock.speed = v;
    for (const b of this.root.querySelectorAll('.sbtn')) b.classList.toggle('on', +b.dataset.speed === v);
  }

  togglePanel(id, force) {
    const el = document.getElementById(id);
    const open = force ?? !el.classList.contains('open');
    el.classList.toggle('open', open);
    const btn = document.getElementById(id === 'atlas' ? 'btn-atlas' : 'btn-chron');
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('on', open);
    if (open && window.innerWidth < 760) {
      const other = id === 'atlas' ? 'chronicle' : 'atlas';
      document.getElementById(other).classList.remove('open');
      document.getElementById(other === 'atlas' ? 'btn-atlas' : 'btn-chron').classList.remove('on');
    }
  }

  // ---------- Labels ----------
  buildLabels() {
    const app = this.app;
    const add = (text, pos, cls, minAlt, maxAlt, extra = {}) => {
      const el = document.createElement('div');
      el.className = 'label ' + cls;
      el.innerHTML = text;
      this.labelsEl.appendChild(el);
      this.labels.push({ el, pos, minAlt, maxAlt, visible: false, ...extra });
      return el;
    };
    for (const r of REGIONS) {
      if (!r.center || r.id === 'sundered') continue;
      const d = latLonToDir(r.center[0], r.center[1]);
      add(r.name, new THREE.Vector3(...d).multiplyScalar(R + 4), 'realm', 45, 1000);
    }
    for (const s of SEAS) add(s.name, new THREE.Vector3(...latLonToDir(s.lat, s.lon)).multiplyScalar(R + 0.5), 'sea', 60, 1000);
    for (const site of app.sites) {
      const s = site.s;
      const big = ['capital', 'city', 'port', 'temple', 'hold', 'enclave', 'necropolis'].includes(s.kind);
      const el = add(`<span class="lname">${s.name}</span>`, site.centerWorld.clone().addScaledVector(site.centerWorld.clone().normalize(), 0.9), 'place' + (s.kind === 'capital' ? ' capital' : ''), big ? 3.5 : 2.6, big ? 110 : 48,
        { onclick: () => this.flyToSite(site) });
      el.onclick = () => this.flyToSite(site);
    }
    for (const l of app.world.landmarks) {
      if (!l.world || l.model === 'none') continue;
      const el = add(`${icon('star', 'lico')}<span class="lname">${l.name}</span>`, l.world.clone().addScaledVector(l.world.clone().normalize(), 1.2), 'wonder', 2.5, 30);
      el.onclick = () => this.flyTo(l.world, 3);
    }
    for (const d of app.dragons.list) {
      const el = add(`${icon('dragon', 'lico')}<span class="lname">${d.name}</span>`, d.pos, 'dragon', 0, 260, { dragon: d });
      el.onclick = () => this.follow({ kind: 'dragon', ref: d });
    }
  }

  updateLabels() {
    const app = this.app;
    const cam = app.camera;
    const alt = app.controls.alt;
    const w = window.innerWidth, h = window.innerHeight;
    const camPos = cam.position;
    const camLen = camPos.length();
    const v = new THREE.Vector3();
    for (const L of this.labels) {
      let show = alt >= L.minAlt && alt <= L.maxAlt;
      const pos = L.dragon ? L.dragon.pos.clone().addScaledVector(L.dragon.pos.clone().normalize(), 1.4) : L.pos;
      if (show) {
        // Hidden behind the planet?
        const toP = v.copy(pos).sub(camPos);
        const dist = toP.length();
        const b = camPos.dot(toP) / dist;
        const c = camLen * camLen - (R - 1) * (R - 1);
        const disc = b * b - c;
        if (disc > 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < dist - 0.5) show = false; }
        if (L.dragon && dist > 90) show = false;
      }
      if (show) {
        v.copy(pos).project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) show = false;
        else {
          const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
          L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
          let fade = Math.min(1, (alt - L.minAlt) / Math.max(0.5, L.minAlt * 0.4 + 0.5), (L.maxAlt - alt) / (L.maxAlt * 0.25));
          // Fade labels that sit near the planet's limb.
          if (!L.dragon) {
            const nx = pos.x, ny = pos.y, nz = pos.z, nl = Math.hypot(nx, ny, nz);
            const tx = camPos.x - pos.x, ty = camPos.y - pos.y, tz = camPos.z - pos.z, tl = Math.hypot(tx, ty, tz);
            const facing = (nx * tx + ny * ty + nz * tz) / (nl * tl);
            fade *= Math.min(1, Math.max(0, (facing - 0.35) / 0.25));
          }
          L.el.style.opacity = String(Math.max(0, Math.min(1, fade)));
        }
      }
      if (show !== L.visible) { L.el.classList.toggle('on', show); L.visible = show; }
    }
  }

  // ---------- Atlas ----------
  buildAtlas() {
    const app = this.app;
    const body = document.getElementById('atlas-body');
    const byRealm = new Map();
    for (const site of app.sites) {
      const realm = REGIONS.find(r => r.id === site.s.realm)?.name || 'The Wilds';
      if (!byRealm.has(realm)) byRealm.set(realm, []);
      byRealm.get(realm).push(site);
    }
    let html = '';
    html += `<section class="atlas-sec"><h3>Dragons</h3><ul>${app.dragons.list.map((d, i) => `<li><button class="alink" data-dragon="${i}">${icon('dragon')}<span>${d.name}</span></button></li>`).join('')}</ul></section>`;
    for (const [realm, list] of byRealm) {
      html += `<section class="atlas-sec"><h3>${realm}</h3><ul>${list.map(s => `<li><button class="alink" data-site="${s.s.id}">${icon(s.s.culture === 'undead' ? 'skull' : s.s.kind === 'capital' ? 'crown' : 'castle')}<span>${s.s.name}</span><em>${CULTURE_WORD[s.s.culture] || ''} ${KIND_WORD[s.s.kind] || s.s.kind}</em></button></li>`).join('')}</ul></section>`;
    }
    const wonders = app.world.landmarks.filter(l => l.model !== 'none');
    html += `<section class="atlas-sec"><h3>Wonders and ruins</h3><ul>${wonders.map(l => `<li><button class="alink" data-wonder="${l.id}">${icon('star')}<span>${l.name}</span></button></li>`).join('')}</ul></section>`;
    html += `<section class="atlas-sec"><h3>Great beasts</h3><ul>
      <li><button class="alink" data-beast="tortoise">${icon('beast')}<span>The Great Tortoise</span></button></li>
      <li><button class="alink" data-beast="serpent">${icon('wave')}<span>A sea serpent</span></button></li>
      <li><button class="alink" data-beast="whitestag">${icon('beast')}<span>The White Stag</span></button></li>
    </ul></section>`;
    body.innerHTML = html;
    body.onclick = (e) => {
      const b = e.target.closest('.alink');
      if (!b) return;
      if (b.dataset.dragon) this.follow({ kind: 'dragon', ref: app.dragons.list[+b.dataset.dragon] });
      else if (b.dataset.site) this.flyToSite(app.sites.find(s => s.s.id === b.dataset.site));
      else if (b.dataset.wonder) { const l = app.world.landmarks.find(x => x.id === b.dataset.wonder); this.flyTo(l.world, l.model === 'floatisle' || l.model === 'runeblade' || l.model === 'titan' ? 5 : 2.4); }
      else if (b.dataset.beast) {
        const g = app.wildlife.groups.find(x => x.key === b.dataset.beast);
        if (g) { this.flyTo(g.center, b.dataset.beast === 'tortoise' ? 3 : 2); setTimeout(() => this.follow({ kind: 'beast', ref: g }), 2500); }
      }
      if (window.innerWidth < 760) this.togglePanel('atlas', false);
    };
  }

  flyToSite(site) {
    const alt = { capital: 7, city: 5.5, port: 4.5, town: 3.8, village: 2.8 }[site.s.kind] || 2.6;
    this.stopFollow(true);
    this.app.controls.flyTo(site.centerWorld.clone().normalize(), alt);
  }
  flyTo(pos, alt) {
    this.stopFollow(true);
    this.app.controls.flyTo(pos.clone().normalize(), alt);
  }

  // ---------- Chronicle ----------
  addEntry(e) {
    const li = document.createElement('li');
    li.className = 'chron' + (e.rumor ? ' rumor' : '');
    li.innerHTML = `<button class="chron-btn">${icon(e.icon || 'star', 'cico')}<span class="chron-text">${e.text}</span><span class="chron-when">${e.stamp}</span></button>`;
    li.querySelector('button').onclick = () => {
      if (e.follow && e.follow.startsWith('dragon:')) { const d = this.app.dragons.list.find(x => x.def.id === e.follow.slice(7)); if (d) { this.follow({ kind: 'dragon', ref: d }); return; } }
      if (e.follow && e.follow.startsWith('ship:')) { const g = this.app.traffic.groups[+e.follow.slice(5)]; if (g && g.pos) { this.flyTo(g.pos, 3); setTimeout(() => this.follow({ kind: 'traffic', ref: g }), 2400); return; } }
      if (e.follow === 'tortoise') { const g = this.app.wildlife.groups.find(x => x.key === 'tortoise'); if (g) { this.flyTo(g.center, 3); return; } }
      if (e.pos) this.flyTo(e.pos, e.site ? 1.6 : 3);
    };
    this.chronList.prepend(li);
    requestAnimationFrame(() => li.classList.add('in'));
    while (this.chronList.children.length > 40) this.chronList.lastChild.remove();
    const btn = document.getElementById('btn-chron');
    if (!document.getElementById('chronicle').classList.contains('open')) btn.classList.add('ping');
  }

  // ---------- Picking ----------
  pick(x, y) {
    const app = this.app;
    const cam = app.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    let best = null, bd = 26;
    const camPos = cam.position;
    const consider = (pos, item, radiusPx = 0) => {
      v.copy(pos).project(cam);
      if (v.z > 1) return;
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const d = Math.hypot(sx - x, sy - y) - radiusPx;
      if (d < bd) {
        // Occlusion by the planet body
        const toP = pos.clone().sub(camPos);
        const dist = toP.length();
        const b = camPos.dot(toP) / dist, c = camPos.lengthSq() - (R - 0.5) * (R - 0.5), disc = b * b - c;
        if (disc > 0 && -b - Math.sqrt(disc) > 0 && -b - Math.sqrt(disc) < dist - 0.3) return;
        bd = d; best = item;
      }
    };
    const pxPerUnit = (pos) => h / (2 * Math.tan(cam.fov * Math.PI / 360) * Math.max(0.1, pos.distanceTo(camPos)));
    for (const d of app.dragons.list) consider(d.pos, { kind: 'dragon', ref: d }, 1.2 * pxPerUnit(d.pos));
    const alt = app.controls.alt;
    if (alt < 12) {
      for (const { ag, sim } of app.people.visibleAgents()) consider(ag.world.clone().addScaledVector(ag.world.clone().normalize(), 0.03), { kind: 'person', ref: ag, sim });
      for (const g of app.traffic.visible) if (g.pos) consider(g.pos, { kind: 'traffic', ref: g });
    }
    if (alt < 40) for (const g of app.wildlife.visible) if (g.pos && g.pos.lengthSq() > 1) consider(g.pos, { kind: 'beast', ref: g }, 0.2 * pxPerUnit(g.pos) * (g.key === 'tortoise' ? 4 : 1));
    return best;
  }

  describe(hit) {
    const app = this.app;
    if (hit.kind === 'dragon') {
      const d = hit.ref;
      const [lat, lon] = dirToLatLon([d.pos.x, d.pos.y, d.pos.z].map(q => q / d.pos.length()));
      const doing = d.breathing > 0 ? 'breathing fire' : d.def.behavior === 'voyage' ? 'on its endless circuit of the world' : 'on the wing';
      return { title: d.name, sub: 'Dragon', doing };
    }
    if (hit.kind === 'person') return app.people.describe(hit.ref, hit.sim.site);
    if (hit.kind === 'traffic') {
      const g = hit.ref;
      const names = { wagon: 'Merchant wagon', rider: 'Courier on horseback', walkers: 'Travellers on foot', patrol: 'Road patrol', party: 'A band of adventurers', caravan: 'Trade caravan',
        hunters: 'Hunting party', boarriders: 'Boar-riders', orecart: 'Dwarven ore cart', porters: 'Kobold porters', cog: 'Merchant cog', warship: 'Valdren warship', ghostship: 'A ghost ship',
        pirate: 'Pirate brigantine', fishboat: 'Fishing boat', rowboat: 'Rowboat', canoe: 'Dugout canoe', swanboat: 'Elven swan-boat', raft: 'Hide raft' };
      const where = g.kind === 'road' ? `on the road between ${siteName(app, g.name.split('→')[0])} and ${siteName(app, g.name.split('→')[1])}` : g.kind === 'river' ? 'on the river' : 'at sea';
      return { title: names[g.type] || 'Travellers', sub: where, doing: g.kind === 'road' ? 'bound for market' : 'under sail' };
    }
    if (hit.kind === 'beast') return { title: hit.ref.name, sub: 'Wild creature', doing: hit.ref.S.prowl ? 'on the prowl' : hit.ref.S.fly ? 'riding the thermals' : 'wandering its range' };
    return null;
  }

  setHover(hit, x, y) {
    this.hover = hit;
    const card = this.cardEl;
    if (!hit) { card.hidden = true; this.app.renderer.domElement.style.cursor = ''; return; }
    const info = this.describe(hit);
    if (!info) { card.hidden = true; return; }
    card.innerHTML = `<div class="card-title">${info.title}</div><div class="card-sub">${info.sub}</div><div class="card-doing">${capital(info.doing)}</div><div class="card-hint">Click to follow</div>`;
    card.hidden = false;
    const cw = 240;
    card.style.transform = `translate(${Math.min(window.innerWidth - cw - 12, x + 16)}px, ${Math.max(12, y - 20)}px)`;
    this.app.renderer.domElement.style.cursor = 'pointer';
  }

  activate(hit) { this.follow(hit); }

  follow(hit) {
    const app = this.app;
    this.followTarget = hit;
    const getPos = () => {
      if (hit.kind === 'dragon') return hit.ref.pos;
      if (hit.kind === 'person') return hit.ref.inside ? null : hit.ref.world;
      if (hit.kind === 'traffic') return hit.ref.pos;
      if (hit.kind === 'beast') return hit.ref.pos && hit.ref.pos.lengthSq() > 1 ? hit.ref.pos : hit.ref.center;
      return null;
    };
    const alt = hit.kind === 'dragon' ? 5 * hit.ref.def.size : hit.kind === 'person' ? 0.35 : hit.kind === 'traffic' ? (hit.ref.kind === 'sea' ? 1.6 : 0.6) : hit.ref.key === 'tortoise' ? 2.5 : 1;
    app.controls.follow(() => { const p = getPos(); return p ? p.clone() : null; }, alt);
    const info = this.describe(hit);
    this.followEl.innerHTML = `${icon('eye')}<span>Following <strong>${info ? info.title : ''}</strong></span><button id="unfollow" aria-label="Stop following">Esc</button>`;
    this.followEl.hidden = false;
    document.getElementById('unfollow').onclick = () => this.stopFollow();
  }

  stopFollow(keepCamera = false) {
    if (!keepCamera) this.app.controls.followFn = null;
    this.followTarget = null;
    this.followEl.hidden = true;
  }

  // ---------- Per-frame ----------
  update() {
    const app = this.app;
    this.frame++;
    this.updateLabels();
    if (this.followTarget && !app.controls.followFn) this.stopFollow(true);
    if (this.frame % 10 !== 0) return;
    const f = app.controls.focus;
    const [lat, lon] = dirToLatLon([f.x, f.y, f.z]);
    const hour = app.clock.hourAt(lon);
    document.getElementById('when').textContent = `Day ${app.clock.localDay(lon)} · ${timeOfDayName(hour)}`;
    document.getElementById('dial').style.setProperty('--a', `${(hour / 24) * 360}deg`);
    document.getElementById('dial').classList.toggle('night', hour < 6 || hour > 19.5);
    document.getElementById('where').textContent = this.whereText(f);
    const hd = app.controls.heading;
    document.getElementById('needle').style.transform = `rotate(${(-hd * 180 / Math.PI).toFixed(1)}deg)`;
    if (this.followTarget && this.frame % 30 === 0) {
      const info = this.describe(this.followTarget);
      if (info) { const s = this.followEl.querySelector('span'); if (s) s.innerHTML = `Following <strong>${info.title}</strong> · ${info.doing}`; }
    }
  }

  whereText(f) {
    const app = this.app;
    const p = f.clone().multiplyScalar(R);
    let best = null, bd = 1e9;
    for (const s of app.sites) { const d = s.centerWorld.distanceTo(p); if (d < bd) { bd = d; best = s; } }
    const field = app.world.field;
    const h = field.height(f.x, f.y, f.z);
    if (best && bd < best.s.radius + 1.5) return `${best.s.name} · ${CULTURE_WORD[best.s.culture] || ''} ${KIND_WORD[best.s.kind] || ''}`;
    field.regionWeights(f.x, f.y, f.z);
    const W = field.regionW;
    let ri = 0;
    for (let i = 1; i < W.length; i++) if (W[i] > W[ri]) ri = i;
    const realm = field.regions[ri].name;
    if (h < 0) return SEAS.reduce((a, s) => { const d = new THREE.Vector3(...latLonToDir(s.lat, s.lon)).distanceTo(f); return d < a[0] ? [d, s.name] : a; }, [1e9, 'Open sea'])[1];
    return best && bd < 12 ? `${realm} · near ${best.s.name}` : realm;
  }
}

function siteName(app, id) { const s = app.sites.find(x => x.s.id === id); if (s) return s.s.name; const l = app.world.landmarks.find(x => x.id === id); return l ? l.name : id; }
function capital(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function pauseIcon() { return '<svg viewBox="0 0 16 16" class="ico" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>'; }
function playIcon() { return '<svg viewBox="0 0 16 16" class="ico" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>'; }
