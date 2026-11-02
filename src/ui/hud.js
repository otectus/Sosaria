// HUD: plaque, time controls, map labels, hover cards, selection and follow, the Atlas, and the
// panel controller. Selection opens the inspector; following is a separate, explicit action.

import * as THREE from 'three';
import { PLANET_RADIUS, dirToLatLon, latLonToDir } from '../core/sphere.js';
import { timeOfDayName } from '../render/sky.js';
import { REGIONS } from '../world/atlas.js';
import { localDateAt } from '../sim/clock.js';
import { Panels } from './panels.js';
import { Inspector } from './inspector.js';
import { Chronicle } from './chronicle.js';
import { WorldPanel } from './world-panel.js';
import { escapeHTML as e, capital } from './text.js';

const R = PLANET_RADIUS;

export const ICONS = {
  dragon: '<path d="M3 13c2-1 3-3 3-5 1 1 2 1 3 0-1-1-1-3 1-4 1 2 3 2 5 1-1 2-3 3-4 5 1 1 3 1 4 0-1 3-4 4-7 4-2 0-4 0-5-1z"/>',
  flame: '<path d="M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-5 0-7z"/>',
  coin: '<circle cx="8" cy="8" r="6"/><path d="M8 4v8M6 6h3.5a1.5 1.5 0 0 1 0 3H6.5a1.5 1.5 0 0 0 0 3H10" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  rumor: '<path d="M2 3h12v8H7l-3 3v-3H2z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5.5" cy="7" r="1"/><circle cx="8" cy="7" r="1"/><circle cx="10.5" cy="7" r="1"/>',
  beast: '<circle cx="8" cy="11" r="3"/><circle cx="3.5" cy="7" r="1.6"/><circle cx="6.5" cy="4" r="1.6"/><circle cx="9.5" cy="4" r="1.6"/><circle cx="12.5" cy="7" r="1.6"/>',
  castle: '<path d="M2 14V6h2v2h2V6h1V3l1-1 1 1v3h1v2h2V6h2v8H9v-3H7v3z"/>',
  star: '<path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z"/>',
  eye: '<path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2"/>',
  skull: '<path d="M8 1a6 6 0 0 0-6 6c0 2 1 3 2 4v3h2v-2h1v2h2v-2h1v2h2v-3c1-1 2-2 2-4a6 6 0 0 0-6-6zM5.5 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>',
  crown: '<path d="M2 12l1-7 3 3 2-5 2 5 3-3 1 7z"/>',
  wave: '<path d="M1 10c2-2 3-2 4.5 0S8 12 10 10s3-2 5 0v3H1z"/>',
  gear: '<path d="M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-1-4h2l.4 2 1.6.7 1.7-1.2 1.4 1.4-1.2 1.7.7 1.6 2 .4v2l-2 .4-.7 1.6 1.2 1.7-1.4 1.4-1.7-1.2-1.6.7-.4 2H7l-.4-2-1.6-.7-1.7 1.2-1.4-1.4 1.2-1.7-.7-1.6-2-.4V7l2-.4.7-1.6-1.2-1.7 1.4-1.4 1.7 1.2 1.6-.7z"/>',
};
export const icon = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 16 16" aria-hidden="true">${ICONS[k] || ICONS.star}</svg>`;

const SEAS = [
  { name: 'The Sapphire Sea', lat: 8, lon: -30 }, { name: 'The Ashen Deep', lat: -5, lon: 70 }, { name: 'Sea of Whispers', lat: 5, lon: -140 },
  { name: 'The Drowned Expanse', lat: -45, lon: -60 }, { name: 'Wyrmwater', lat: 30, lon: 115 }, { name: 'The Pale Gulf', lat: -50, lon: 100 },
];
export const CULTURE_WORD = { human: 'Human', elf: 'Elven', dwarf: 'Dwarven', fae: 'Faeborne', beast: 'Beastfolk', draconic: 'Dragonkin', undead: 'Undead', ruin: 'Ruined' };
export const KIND_WORD = { capital: 'capital', city: 'city', port: 'port', town: 'town', village: 'village', hamlet: 'hamlet', castle: 'castle', fort: 'fort', hold: 'mountain hold',
  mine: 'mine', enclave: 'enclave', glade: 'glade', circle: 'sacred circle', camp: 'war-camp', temple: 'temple-city', necropolis: 'necropolis', barrow: 'barrow', monastery: 'abbey', ruin: 'ruin', stilts: 'stilt village', lighthouse: 'lighthouse' };
const OBSERVER_KEY = 'sosaria-observer';

export class HUD {
  constructor(app) {
    this.app = app;
    const root = this.root = document.getElementById('ui');
    root.innerHTML = `
      <div class="labels" id="labels"></div>
      <header class="plaque" id="plaque">
        <div class="plaque-title">Sosaria</div>
        <div class="plaque-row"><span id="dial" class="dial" aria-hidden="true"></span><span id="when">Day 1</span></div>
        <div class="plaque-where" id="where">The Wilds</div>
        <div class="world-caption" id="sim-status" aria-live="off"></div>
      </header>
      <nav class="toolbar" aria-label="Time and panels">
        <button class="tbtn" id="pause" title="Pause or resume time (Space)" aria-label="Pause time" aria-pressed="false">${pauseIcon()}</button>
        <div class="speeds" role="group" aria-label="Time speed">
          ${[1, 4, 16, 64].map((v, i) => `<button class="sbtn" data-speed="${v}" id="speed-${v}" aria-pressed="false" title="${v}× speed (${i + 1})">${v}×</button>`).join('')}
        </div>
        <span class="clock-sep"></span>
        <button class="tbtn text" id="btn-atlas" title="Atlas (M)">Atlas</button>
        <button class="tbtn text" id="btn-chron" title="Chronicle (C)">Chronicle</button>
        <button class="tbtn text" id="btn-world" title="World and saves (O)">World</button>
        <button class="tbtn" id="btn-settings" title="Settings" aria-label="Settings">${icon('gear')}</button>
      </nav>
      <aside class="panel atlas" id="atlas" aria-labelledby="atlas-title" tabindex="-1">
        <div class="panel-head"><h2 id="atlas-title" tabindex="-1">Atlas</h2><span class="panel-sub">Places, wonders and wyrms</span><button class="panel-close" data-close="atlas" aria-label="Close Atlas">×</button></div>
        <div class="atlas-tools">
          <label class="sr-only" for="atlas-search">Search places</label><input id="atlas-search" type="search" placeholder="Search places" autocomplete="off" data-autofocus>
          <div class="atlas-filters">
            <label class="sr-only" for="atlas-culture">Culture</label><select id="atlas-culture"><option value="">All cultures</option>${Object.entries(CULTURE_WORD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
            <label class="sr-only" for="atlas-type">Type</label><select id="atlas-type"><option value="">Everything</option><option value="place">Settlements</option><option value="wonder">Wonders</option><option value="dragon">Dragons</option><option value="beast">Great beasts</option><option value="fav">Favourites</option></select>
          </div>
        </div>
        <div class="atlas-body" id="atlas-body"></div>
      </aside>
      <aside class="panel chronicle" id="chronicle" aria-labelledby="chron-title" tabindex="-1"></aside>
      <aside class="panel inspector" id="inspector" aria-labelledby="insp-title" tabindex="-1"></aside>
      <aside class="panel world" id="world-panel" aria-labelledby="world-title" tabindex="-1"></aside>
      <aside class="panel settings" id="settings" aria-labelledby="settings-title" tabindex="-1">
        <div class="panel-head"><h2 id="settings-title" tabindex="-1">Settings</h2><span class="panel-sub">Comfort and quality</span><button class="panel-close" data-close="settings" aria-label="Close settings">×</button></div>
        <div class="world-body">
          <label class="world-label" for="render-quality">Visual quality</label>
          <select id="render-quality"><option value="auto">Auto · adapts to your device</option><option value="performance">Performance</option><option value="balanced">Balanced</option><option value="cinematic">Cinematic</option></select>
          <label class="world-label" for="motion">Motion</label>
          <select id="motion"><option value="system">Follow system setting</option><option value="on">Reduce motion</option><option value="off">Full motion</option></select>
          <label class="check"><input type="checkbox" id="calm"> Calm effects (no flashing, softer glow)</label>
          <label class="check"><input type="checkbox" id="announce"> Announce major events to assistive technology</label>
          <p class="world-caption">Keys: Space pause · 1–4 speed · M Atlas · C Chronicle · O World · I inspector · G follow · H overview · B back · N north · Esc close. Camera: W A S D or arrows move, Q E turn, R F tilt, + − zoom.</p>
        </div>
      </aside>
      <div class="card" id="card" hidden></div>
      <div class="chooser" id="chooser" hidden role="dialog" aria-label="Choose what to inspect"></div>
      <div class="follow" id="follow" hidden></div>
      <div class="hint" id="hint">Drag to turn the world · Scroll to descend · Right-drag to tilt · Click anything to inspect it</div>
      <button class="compass" id="compass" title="Face north (N)" aria-label="Face north"><span class="needle" id="needle"></span><span aria-hidden="true">N</span></button>
      <p class="sr-only" id="announcer" aria-live="polite"></p>
    `;
    this.labelsEl = document.getElementById('labels');
    this.cardEl = document.getElementById('card');
    this.followEl = document.getElementById('follow');
    this.labels = [];
    this.observer = this.loadObserver();
    this.frame = 0; this.selection = null; this.followTarget = null; this.views = [];
    this.panels = new Panels({ reducedMotion: () => app.controls.reducedMotion });
    this.panels.register('atlas', { panel: document.getElementById('atlas'), button: document.getElementById('btn-atlas'), group: 'left' });
    this.panels.register('settings', { panel: document.getElementById('settings'), button: document.getElementById('btn-settings'), group: 'left' });
    this.chronicle = new Chronicle(this);
    this.inspector = new Inspector(this);
    this.worldPanel = new WorldPanel(this);
    this.panels.register('chronicle', { panel: document.getElementById('chronicle'), button: document.getElementById('btn-chron'), group: 'right', onOpen: () => this.chronicle.render(true) });
    this.panels.register('inspector', { panel: document.getElementById('inspector'), group: 'right' });
    this.panels.register('world', { panel: document.getElementById('world-panel'), button: document.getElementById('btn-world'), group: 'right', onOpen: () => this.worldPanel.render(true) });
    root.addEventListener('click', ev => { const c = ev.target.closest('[data-close]'); if (c) this.panels.close(c.dataset.close); });
    this.buildLabels();
    this.buildAtlas();
    this.bind();
    this.setSpeed(1);
    if (window.innerWidth >= 1100) this.panels.open('chronicle', null, { focus: false });
    this.onResize = () => this.panels.relayout();
    window.addEventListener('resize', this.onResize);
  }

  loadObserver() {
    try { const o = JSON.parse(localStorage.getItem(OBSERVER_KEY) || '{}'); return { favorites: [], recent: [], pins: {}, views: [], announce: false, ...o }; }
    catch { return { favorites: [], recent: [], pins: {}, views: [], announce: false }; }
  }
  saveObserver() { try { localStorage.setItem(OBSERVER_KEY, JSON.stringify(this.observer)); } catch {} }
  pins() { return this.observer.pins[this.app.sim.state.seed] || (this.observer.pins[this.app.sim.state.seed] = []); }

  bind() {
    const app = this.app;
    const quality = document.getElementById('render-quality');
    quality.value = app.quality.mode;
    quality.onchange = () => app.setQuality(quality.value);
    const motion = document.getElementById('motion');
    motion.value = app.settings.reducedMotion; motion.onchange = () => app.setSetting('reducedMotion', motion.value);
    const calm = document.getElementById('calm');
    calm.checked = !!app.settings.calmEffects; calm.onchange = () => app.setSetting('calmEffects', calm.checked);
    const announce = document.getElementById('announce');
    announce.checked = !!this.observer.announce; announce.onchange = () => { this.observer.announce = announce.checked; this.saveObserver(); };
    document.getElementById('pause').onclick = () => this.togglePause();
    for (const b of this.root.querySelectorAll('.sbtn')) b.onclick = () => this.setSpeed(+b.dataset.speed);
    document.getElementById('compass').onclick = () => app.controls.resetForward(0);
    this.onKey = (ev) => {
      const t = ev.target;
      if (t && (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key.toLowerCase();
      if (k === ' ' && !(t && t.tagName === 'BUTTON')) { ev.preventDefault(); this.togglePause(); }
      else if (['1', '2', '3', '4'].includes(k)) this.setSpeed([1, 4, 16, 64][+k - 1]);
      else if (k === 'escape') { if (!document.getElementById('chooser').hidden) this.hideChooser(); else if (!this.panels.closeTop()) this.stopFollow(); }
      // Letters used by the camera (W A S D Q E R F) are left to it.
      else if (k === 'm') this.panels.toggle('atlas');
      else if (k === 'c') this.panels.toggle('chronicle');
      else if (k === 'o') this.panels.toggle('world');
      else if (k === 'i' && this.selection) this.panels.open('inspector');
      else if (k === 'g' && this.selection) this.followSelection();
      else if (k === 'h') this.overview();
      else if (k === 'b') this.back();
      else if (k === 'n') app.controls.resetForward(0);
    };
    window.addEventListener('keydown', this.onKey);
    const canvas = app.renderer.domElement;
    let lastMove = 0;
    canvas.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'touch') return;
      const now = performance.now();
      if (now - lastMove < 60) return;
      lastMove = now;
      if (app.controls.pointers.size) { this.setHover(null); return; }
      this.setHover(this.pick(ev.clientX, ev.clientY)[0] || null, ev.clientX, ev.clientY);
    });
    canvas.addEventListener('pointerleave', () => this.setHover(null));
    app.controls.onClick = (x, y) => {
      const hits = this.pick(x, y);
      if (hits.length > 1 && hits[1].d - hits[0].d < 8) this.showChooser(hits.slice(0, 5), x, y);
      else if (hits[0]) this.select(hits[0].hit);
    };
    app.controls.onUserInput = () => {
      document.getElementById('hint').classList.add('gone');
      if (!app.controls.followFn && this.followTarget) this.stopFollow(true);
    };
  }

  togglePause() {
    const c = this.app.clock;
    c.paused = !c.paused;
    const b = document.getElementById('pause');
    b.innerHTML = c.paused ? playIcon() : pauseIcon();
    b.setAttribute('aria-label', c.paused ? 'Resume time' : 'Pause time');
    b.setAttribute('aria-pressed', String(c.paused));
  }
  setSpeed(v) {
    this.app.clock.speed = v;
    for (const b of this.root.querySelectorAll('.sbtn')) { const on = +b.dataset.speed === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  }

  // ---------- Labels: buttons for pointer users; the Atlas is the accessible list. ----------
  buildLabels() {
    const app = this.app;
    const add = (html, pos, cls, minAlt, maxAlt, extra = {}, onclick = null, title = '') => {
      const el = document.createElement(onclick ? 'button' : 'div');
      el.className = 'label ' + cls;
      el.innerHTML = html;
      if (onclick) { el.type = 'button'; el.tabIndex = -1; el.onclick = onclick; el.setAttribute('aria-label', title); }
      this.labelsEl.appendChild(el);
      this.labels.push({ el, pos, minAlt, maxAlt, visible: false, ...extra });
      return el;
    };
    for (const r of REGIONS) {
      if (!r.center || r.id === 'sundered') continue;
      add(e(r.name), new THREE.Vector3(...latLonToDir(r.center[0], r.center[1])).multiplyScalar(R + 4), 'realm', 45, 1000);
    }
    for (const s of SEAS) add(e(s.name), new THREE.Vector3(...latLonToDir(s.lat, s.lon)).multiplyScalar(R + 0.5), 'sea', 60, 1000);
    for (const site of app.sites) {
      const s = site.s;
      const big = ['capital', 'city', 'port', 'temple', 'hold', 'enclave', 'necropolis'].includes(s.kind);
      add(`<span class="lname">${e(s.name)}</span>`, site.centerWorld.clone().addScaledVector(site.centerWorld.clone().normalize(), 0.9), 'place' + (s.kind === 'capital' ? ' capital' : ''), big ? 3.5 : 2.6, big ? 110 : 48,
        { site: s.id }, () => this.selectSettlement(s.id), `Inspect ${s.name}`);
    }
    for (const l of app.world.landmarks) {
      if (!l.world || l.model === 'none') continue;
      add(`${icon('star', 'lico')}<span class="lname">${e(l.name)}</span>`, l.world.clone().addScaledVector(l.world.clone().normalize(), 1.2), 'wonder', 2.5, 30, {}, () => this.flyTo(l.world, 3), `Visit ${l.name}`);
    }
    for (const d of app.dragons.list) add(`${icon('dragon', 'lico')}<span class="lname">${e(d.name)}</span>`, d.pos, 'dragon', 0, 260, { dragon: d }, () => this.select({ kind: 'dragon', ref: d }), `Inspect ${d.name}`);
  }

  updateLabels() {
    const app = this.app, cam = app.camera, alt = app.controls.alt, w = window.innerWidth, h = window.innerHeight;
    const camPos = cam.position, camLen = camPos.length(), v = new THREE.Vector3();
    // Reserve the selected entity's label first, then larger places, avoiding overlaps.
    const taken = [];
    const selectedSite = this.selection?.kind === 'settlement' ? this.selection.id : null;
    const order = this.labels.slice().sort((a, b) => (b.site === selectedSite) - (a.site === selectedSite) || (b.minAlt - a.minAlt));
    for (const L of order) {
      let show = alt >= L.minAlt && alt <= L.maxAlt;
      const pos = L.dragon ? L.dragon.pos.clone().addScaledVector(L.dragon.pos.clone().normalize(), 1.4) : L.pos;
      if (show) {
        const toP = v.copy(pos).sub(camPos), dist = toP.length();
        const b = camPos.dot(toP) / dist, c = camLen * camLen - (R - 1) * (R - 1), disc = b * b - c;
        if (disc > 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < dist - 0.5) show = false; }
        if (L.dragon && dist > 90) show = false;
      }
      if (show) {
        v.copy(pos).project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) show = false;
        else {
          const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
          const box = [x - 60, y - 22, x + 60, y];
          if (!L.dragon && taken.some(t => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) show = false;
          else {
            taken.push(box);
            L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
            let fade = Math.min(1, (alt - L.minAlt) / Math.max(0.5, L.minAlt * 0.4 + 0.5), (L.maxAlt - alt) / (L.maxAlt * 0.25));
            if (!L.dragon) {
              const tx = camPos.x - pos.x, ty = camPos.y - pos.y, tz = camPos.z - pos.z;
              const facing = (pos.x * tx + pos.y * ty + pos.z * tz) / (pos.length() * Math.hypot(tx, ty, tz));
              fade *= Math.min(1, Math.max(0, (facing - 0.35) / 0.25));
            }
            L.el.style.opacity = String(Math.max(0, Math.min(1, fade)));
          }
        }
      }
      if (show !== L.visible) { L.el.classList.toggle('on', show); L.visible = show; }
    }
  }

  // ---------- Atlas: search, filters, favourites and recent places ----------
  buildAtlas() {
    const app = this.app, body = document.getElementById('atlas-body');
    const draw = () => {
      const q = document.getElementById('atlas-search').value.trim().toLowerCase();
      const culture = document.getElementById('atlas-culture').value, type = document.getElementById('atlas-type').value;
      const fav = new Set(this.observer.favorites);
      const match = name => !q || name.toLowerCase().includes(q);
      let html = '';
      const recent = this.observer.recent.map(id => app.sites.find(s => s.s.id === id)).filter(Boolean).filter(s => match(s.s.name));
      if (!type && !culture && recent.length) html += section('Recent', recent.map(s => placeItem(s, fav)).join(''));
      if (!type || type === 'dragon') { const list = app.dragons.list.filter(d => match(d.name)); if (list.length && !culture) html += section('Dragons', list.map(d => `<li><button class="alink" data-dragon="${app.dragons.list.indexOf(d)}">${icon('dragon')}<span>${e(d.name)}</span></button></li>`).join('')); }
      if (!type || type === 'place' || type === 'fav') {
        const byRealm = new Map();
        for (const site of app.sites) {
          if (culture && site.s.culture !== culture) continue;
          if (type === 'fav' && !fav.has(site.s.id)) continue;
          if (!match(site.s.name)) continue;
          const realm = REGIONS.find(r => r.id === site.s.realm)?.name || 'The Wilds';
          if (!byRealm.has(realm)) byRealm.set(realm, []);
          byRealm.get(realm).push(site);
        }
        for (const [realm, list] of byRealm) html += section(realm, list.map(s => placeItem(s, fav)).join(''));
      }
      if ((!type || type === 'wonder') && !culture) { const w = app.world.landmarks.filter(l => l.model !== 'none' && match(l.name)); if (w.length) html += section('Wonders and ruins', w.map(l => `<li><button class="alink" data-wonder="${e(l.id)}">${icon('star')}<span>${e(l.name)}</span></button></li>`).join('')); }
      if ((!type || type === 'beast') && !culture) {
        const beasts = [['tortoise', 'beast', 'The Great Tortoise'], ['serpent', 'wave', 'A sea serpent'], ['whitestag', 'beast', 'The White Stag']].filter(b => match(b[2]));
        if (beasts.length) html += section('Great beasts', beasts.map(([k, ic, n]) => `<li><button class="alink" data-beast="${k}">${icon(ic)}<span>${e(n)}</span></button></li>`).join(''));
      }
      body.innerHTML = html || '<p class="world-empty">No places match.</p>';
    };
    const section = (title, items) => `<section class="atlas-sec"><h3>${e(title)}</h3><ul>${items}</ul></section>`;
    const placeItem = (s, fav) => `<li class="atlas-row"><button class="alink" data-site="${e(s.s.id)}">${icon(s.s.culture === 'undead' ? 'skull' : s.s.kind === 'capital' ? 'crown' : 'castle')}<span>${e(s.s.name)}</span><em>${CULTURE_WORD[s.s.culture] || ''} ${KIND_WORD[s.s.kind] || s.s.kind}</em></button><button class="fav" data-fav="${e(s.s.id)}" aria-pressed="${fav.has(s.s.id)}" aria-label="${fav.has(s.s.id) ? 'Remove' : 'Add'} ${e(s.s.name)} ${fav.has(s.s.id) ? 'from' : 'to'} favourites">${fav.has(s.s.id) ? '★' : '☆'}</button></li>`;
    this.drawAtlas = draw;
    for (const id of ['atlas-search', 'atlas-culture', 'atlas-type']) document.getElementById(id).addEventListener('input', draw);
    body.onclick = (ev) => {
      const f = ev.target.closest('[data-fav]');
      if (f) { const id = f.dataset.fav, list = this.observer.favorites; const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id); this.saveObserver(); draw(); body.querySelector(`[data-fav="${CSS.escape(id)}"]`)?.focus(); return; }
      const b = ev.target.closest('.alink');
      if (!b) return;
      if (b.dataset.dragon) this.select({ kind: 'dragon', ref: app.dragons.list[+b.dataset.dragon] }, { fly: true });
      else if (b.dataset.site) this.selectSettlement(b.dataset.site, { fly: true });
      else if (b.dataset.wonder) { const l = app.world.landmarks.find(x => x.id === b.dataset.wonder); this.flyTo(l.world, l.model === 'floatisle' || l.model === 'runeblade' || l.model === 'titan' ? 5 : 2.4); }
      else if (b.dataset.beast) { const g = app.wildlife.groups.find(x => x.key === b.dataset.beast); if (g) { this.flyTo(g.center, b.dataset.beast === 'tortoise' ? 3 : 2); this.select({ kind: 'beast', ref: g }); } }
      if (window.innerWidth < 760) this.panels.close('atlas', { restore: false });
    };
    draw();
  }

  remember(id) {
    this.observer.recent = [id, ...this.observer.recent.filter(x => x !== id)].slice(0, 6);
    this.saveObserver();
    this.drawAtlas?.();
  }

  // ---------- Camera helpers ----------
  pushView() {
    const c = this.app.controls;
    this.views.push({ focus: c.focus.clone(), alt: c.alt, heading: c.heading });
    if (this.views.length > 20) this.views.shift();
  }
  back() { const v = this.views.pop(); if (v) { this.stopFollow(true); this.app.controls.flyTo(v.focus, v.alt); } }
  overview() { this.pushView(); this.stopFollow(true); this.app.controls.flyTo(this.app.controls.focus.clone(), 235); }
  flyToSite(site) {
    const alt = { capital: 6, city: 5.5, port: 4.5, town: 3.8, village: 2.8 }[site.s.kind] || 2.6;
    this.pushView(); this.stopFollow(true);
    this.app.controls.flyTo(site.centerWorld.clone().normalize(), alt);
    this.remember(site.s.id);
  }
  flyTo(pos, alt) { this.pushView(); this.stopFollow(true); this.app.controls.flyTo(pos.clone().normalize(), alt); }

  // ---------- Selection, picking and following ----------
  select(sel, { fly = false } = {}) {
    this.selection = sel;
    this.hideChooser();
    this.inspector.show(sel);
    this.panels.open('inspector');
    if (fly) this.showSelection();
  }
  selectSettlement(id, opts = {}) {
    this.select({ kind: 'settlement', id });
    if (opts.fly !== false) { const site = this.app.sites.find(s => s.s.id === id); if (site) this.flyToSite(site); }
  }
  showSelection() {
    const p = this.positionOf(this.selection);
    if (p) this.flyTo(p, this.selection.kind === 'person' ? 0.8 : this.selection.kind === 'building' ? 1.2 : this.selection.kind === 'shipment' ? 1.6 : 3);
  }
  // Positions resolve through stable IDs every time; a stale object reference is never kept.
  positionOf(sel) {
    const app = this.app;
    if (!sel) return null;
    if (sel.kind === 'dragon') return sel.ref.pos;
    if (sel.kind === 'beast') return sel.ref.pos && sel.ref.pos.lengthSq() > 1 ? sel.ref.pos : sel.ref.center;
    if (sel.kind === 'traffic') return sel.ref.pos || null;
    if (sel.kind === 'settlement') return app.sites.find(s => s.s.id === sel.id)?.centerWorld || null;
    if (sel.kind === 'building') { const r = app.structures.byBuilding.get(sel.id); return r ? new THREE.Vector3().setFromMatrixPosition(r.matrix) : null; }
    if (sel.kind === 'incident') { const x = app.sim.state.incidents[sel.id]; return x ? this.positionOf({ kind: 'building', id: x.building }) : null; }
    if (sel.kind === 'shipment') return app.traffic.shipments.get(sel.id)?.pos || null;
    if (sel.kind === 'event') { const ev = app.sim.event(sel.id); return ev?.d?.building ? this.positionOf({ kind: 'building', id: ev.d.building }) : this.positionOf({ kind: 'settlement', id: ev?.w }); }
    if (sel.kind === 'person') {
      const p = app.sim.state.residents[sel.id];
      if (!p) return null;
      if (p.journey) return app.traffic.shipments.get(p.journey)?.pos || null;
      const view = app.people.active.get(p.at.site);
      const ag = view?.agents.get(p.id);
      if (ag && !ag.inside && ag.world.lengthSq() > 1) return ag.world;
      const site = app.sites.find(s => s.s.id === p.at.site), place = app.catalog.byId[p.at.site];
      const n = place.nav.nodes[p.at.node];
      return site.toWorld(n[0], n[1]);
    }
    return null;
  }
  followSelection() {
    const sel = this.selection;
    if (!sel || sel.kind === 'settlement' || sel.kind === 'event') return;
    this.followTarget = sel;
    const alt = sel.kind === 'dragon' ? 5 * sel.ref.def.size : sel.kind === 'person' ? 0.35 : sel.kind === 'shipment' || sel.kind === 'traffic' ? 0.7 : sel.kind === 'beast' ? (sel.ref.key === 'tortoise' ? 2.5 : 1) : 1.2;
    this.pushView();
    this.app.controls.follow(() => { const p = this.positionOf(sel); return p ? p.clone() : null; }, alt);
    this.followEl.hidden = false;
    this.updateFollow();
  }
  updateFollow() {
    if (!this.followTarget) return;
    const info = this.inspector.headline(this.followTarget);
    this.followEl.innerHTML = `${icon('eye')}<span>Following <strong>${e(info.title)}</strong>${info.doing ? ` · ${e(info.doing)}` : ''}</span><button id="unfollow" aria-label="Stop following">Esc</button>`;
    document.getElementById('unfollow').onclick = () => this.stopFollow();
  }
  stopFollow(keepCamera = false) {
    if (!keepCamera) this.app.controls.followFn = null;
    this.followTarget = null;
    this.followEl.hidden = true;
  }

  // Candidates near the pointer, nearest first, excluding anything hidden behind terrain or
  // buildings or behind the camera.
  pick(x, y) {
    const app = this.app, cam = app.camera, w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3(), out = [], camPos = cam.position;
    cam.updateMatrixWorld();
    const occluded = (pos) => {
      if (v.copy(pos).applyMatrix4(cam.matrixWorldInverse).z > 0) return true;
      const steps = 24, q = new THREE.Vector3(), dir = new THREE.Vector3();
      for (let i = 1; i < steps; i++) {
        q.lerpVectors(camPos, pos, i / steps);
        const r = q.length();
        dir.copy(q).divideScalar(r);
        const ground = Math.max(app.field.height(dir.x, dir.y, dir.z), i > steps - 4 ? -Infinity : app.structures.roofAt(dir));
        if (r < R + ground - 0.015) return true;
      }
      return false;
    };
    const consider = (pos, hit, radiusPx = 0) => {
      v.copy(pos).project(cam);
      if (v.z > 1) return;
      const d = Math.hypot((v.x * 0.5 + 0.5) * w - x, (-v.y * 0.5 + 0.5) * h - y) - radiusPx;
      if (d < 26 && !occluded(pos)) out.push({ hit, d });
    };
    const pxPerUnit = (pos) => h / (2 * Math.tan(cam.fov * Math.PI / 360) * Math.max(0.1, pos.distanceTo(camPos)));
    for (const d of app.dragons.list) consider(d.pos, { kind: 'dragon', ref: d }, 1.2 * pxPerUnit(d.pos));
    const alt = app.controls.alt;
    if (alt < 12) {
      for (const { ag } of app.people.visibleAgents()) consider(ag.world.clone().addScaledVector(ag.world.clone().normalize(), 0.03), { kind: 'person', id: ag.personId });
      for (const g of app.traffic.visible) if (g.pos) consider(g.pos, g.shipment ? { kind: 'shipment', id: g.shipment } : { kind: 'traffic', ref: g });
    }
    if (alt < 6) for (const view of app.people.active.values()) for (const b of view.place.buildings) {
      const rec = app.structures.byBuilding.get(b.id);
      if (!rec) continue;
      const p = new THREE.Vector3().setFromMatrixPosition(rec.matrix);
      // Aim at the middle of the building, not its base.
      p.addScaledVector(p.clone().normalize(), Math.max(0, (app.structures.topOf(rec) - (p.length() - R)) * 0.5));
      consider(p, { kind: 'building', id: b.id }, 0.12 * pxPerUnit(p));
    }
    if (alt < 40) for (const g of app.wildlife.visible) if (g.pos && g.pos.lengthSq() > 1) consider(g.pos, { kind: 'beast', ref: g }, 0.2 * pxPerUnit(g.pos) * (g.key === 'tortoise' ? 4 : 1));
    // People and journeys outrank the buildings they stand in front of.
    for (const o of out) o.d += o.hit.kind === 'building' ? 6 : 0;
    return out.sort((a, b) => a.d - b.d);
  }
  showChooser(hits, x, y) {
    const el = document.getElementById('chooser');
    el.innerHTML = `<p class="world-caption">Several things are here:</p>${hits.map((h, i) => `<button class="world-button" data-pick="${i}">${e(this.inspector.headline(h.hit).title)}</button>`).join('')}`;
    el.style.transform = `translate(${Math.min(window.innerWidth - 240, x + 12)}px, ${Math.max(12, y - 20)}px)`;
    el.hidden = false;
    el.onclick = ev => { const b = ev.target.closest('[data-pick]'); if (b) this.select(hits[+b.dataset.pick].hit); };
    el.querySelector('button')?.focus();
  }
  hideChooser() { const el = document.getElementById('chooser'); el.hidden = true; }

  setHover(hit, x, y) {
    const card = this.cardEl;
    if (!hit) { card.hidden = true; this.app.renderer.domElement.style.cursor = ''; return; }
    const info = this.inspector.headline(hit.hit || hit);
    card.innerHTML = `<div class="card-title">${e(info.title)}</div><div class="card-sub">${e(info.sub)}</div>${info.doing ? `<div class="card-doing">${e(capital(info.doing))}</div>` : ''}<div class="card-hint">Click to inspect</div>`;
    card.hidden = false;
    card.style.transform = `translate(${Math.min(window.innerWidth - 252, x + 16)}px, ${Math.max(12, y - 20)}px)`;
    this.app.renderer.domElement.style.cursor = 'pointer';
  }

  download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  announce(text) { if (this.observer.announce) document.getElementById('announcer').textContent = text; }

  reset() {
    this.stopFollow();
    this.selection = null;
    this.inspector.show(null);
    this.panels.close('inspector', { restore: false });
    this.chronicle.reset();
  }

  // ---------- Per-frame ----------
  update() {
    const app = this.app;
    this.frame++;
    this.updateLabels();
    if (this.followTarget && !app.controls.followFn) this.stopFollow(true);
    if (this.frame % 15 === 0) { this.chronicle.update(); this.inspector.update(); this.worldPanel.update(); if (this.followTarget) this.updateFollow(); }
    if (this.frame % 10 !== 0) return;
    const f = app.controls.focus;
    const [, lon] = dirToLatLon([f.x, f.y, f.z]);
    const hour = app.clock.hourAt(lon), date = localDateAt(app.sim.state.tick, lon);
    document.getElementById('when').textContent = `${date.dayOfSeason} ${date.season.name}, Year ${date.year} · ${timeOfDayName(hour)}`;
    document.getElementById('dial').style.setProperty('--a', `${(hour / 24) * 360}deg`);
    document.getElementById('dial').classList.toggle('night', hour < 6 || hour > 19.5);
    document.getElementById('where').textContent = this.whereText(f);
    document.getElementById('needle').style.transform = `rotate(${(-app.controls.heading * 180 / Math.PI).toFixed(1)}deg)`;
    const sim = app.sim, c = app.clock;
    const achieved = sim.clock.achieved;
    document.getElementById('sim-status').textContent = sim.faulted ? 'Simulation stopped' : c.paused ? 'Paused · world time is frozen' :
      achieved && achieved < c.speed * 0.9 ? `${c.speed}× requested · ${achieved.toFixed(1)}× achieved` : `${c.speed}×${app.readOnly ? ' · read-only tab' : ''}`;
  }

  whereText(f) {
    const app = this.app, p = f.clone().multiplyScalar(R);
    let best = null, bd = 1e9;
    for (const s of app.sites) { const d = s.centerWorld.distanceTo(p); if (d < bd) { bd = d; best = s; } }
    const field = app.world.field, h = field.height(f.x, f.y, f.z);
    if (best && bd < best.s.radius + 1.5) return `${best.s.name} · ${CULTURE_WORD[best.s.culture] || ''} ${KIND_WORD[best.s.kind] || ''}`;
    field.regionWeights(f.x, f.y, f.z);
    const W = field.regionW;
    let ri = 0;
    for (let i = 1; i < W.length; i++) if (W[i] > W[ri]) ri = i;
    if (h < 0) return SEAS.reduce((a, s) => { const d = new THREE.Vector3(...latLonToDir(s.lat, s.lon)).distanceTo(f); return d < a[0] ? [d, s.name] : a; }, [1e9, 'Open sea'])[1];
    return best && bd < 12 ? `${field.regions[ri].name} · near ${best.s.name}` : field.regions[ri].name;
  }

  dispose() { window.removeEventListener('keydown', this.onKey); window.removeEventListener('resize', this.onResize); }
}

function pauseIcon() { return '<svg viewBox="0 0 16 16" class="ico" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>'; }
function playIcon() { return '<svg viewBox="0 0 16 16" class="ico" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>'; }
