// Inspectable town registers, manifests and source trails over the authoritative world.
import { GOODS, residentSchedule } from '../sim/state.js';
import { stamp } from '../sim/time.js';
import { weatherAt } from '../sim/incidents.js';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const e = escapeHTML;
const button = (action, label, attrs = '') => `<button class="world-button" data-action="${action}" ${attrs}>${label}</button>`;

export class LivingWorldUI {
  constructor(hud) {
    this.hud = hud; this.app = hud.app; this.selected = 'highmoor'; this.tab = 'town'; this.filter = 'all'; this.last = 0; this.factId = null;
    document.querySelector('.toolbar').insertAdjacentHTML('beforeend', '<button class="tbtn text" id="btn-world" aria-expanded="false">World</button>');
    document.querySelector('.plaque').insertAdjacentHTML('beforeend', '<span id="sim-status" class="world-caption"></span>');
    hud.root.insertAdjacentHTML('beforeend', `
      <aside class="panel living-world" id="living-world" aria-label="Living world" inert>
        <div class="panel-head"><h2>Living world</h2><span class="panel-sub">Lives, journeys and lasting consequences</span><button id="close-world" aria-label="Close living world">×</button></div>
        <label class="world-label" for="world-site">Settlement</label>
        <select id="world-site">${this.app.sites.map(s => `<option value="${e(s.s.id)}">${e(s.s.name)}</option>`).join('')}</select>
        <nav class="world-tabs" aria-label="World records">${['town', 'journeys', 'save'].map(t => `<button data-tab="${t}" aria-pressed="${t === 'town'}">${t === 'save' ? 'World & saves' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</nav>
        <div id="world-body" class="world-body"></div>
        <p id="world-message" class="world-message" role="status"></p>
      </aside>`);
    this.panel = document.getElementById('living-world'); this.body = document.getElementById('world-body');
    const select = document.getElementById('world-site'); select.value = this.selected;
    select.onchange = () => this.openTown(select.value);
    document.getElementById('btn-world').onclick = () => this.toggle();
    document.getElementById('close-world').onclick = () => this.toggle(false);
    this.panel.addEventListener('keydown', event => { if (event.key === 'Escape') this.toggle(false); event.stopPropagation(); });
    this.panel.onclick = event => {
      const tab = event.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; this.factId = null; this.render(true); return; }
      const b = event.target.closest('[data-action]');
      if (b) this.action(b);
    };
    const chronHead = document.querySelector('#chronicle .panel-head');
    chronHead.querySelector('.panel-sub').textContent = 'Accounts learned in visited towns';
    chronHead.insertAdjacentHTML('beforeend', '<label class="sr-only" for="chron-filter">Filter Chronicle</label><select id="chron-filter"><option value="all">All known accounts</option><option value="records">Local records</option><option value="reported">Carried reports</option><option value="legend">Legends · unverified</option></select>');
    document.getElementById('chron-filter').onchange = event => { this.filter = event.target.value; this.renderChronicle(); };
    hud.chronList.onclick = event => { const b = event.target.closest('[data-fact]'); if (b) this.inspectFact(b.dataset.fact); };
    this.renderChronicle();
  }
  toggle(force) {
    const open = force ?? !this.panel.classList.contains('open');
    this.panel.classList.toggle('open', open); this.panel.inert = !open;
    document.getElementById('btn-world').setAttribute('aria-expanded', String(open));
    document.getElementById('btn-world').classList.toggle('on', open);
    if (open) { this.hud.togglePanel('chronicle', false); if (window.innerWidth < 760) this.hud.togglePanel('atlas', false); this.render(true); }
  }
  openTown(id, fly = true) {
    if (!this.app.sim.catalog.byId[id]) return;
    this.selected = id; this.tab = 'town'; this.factId = null;
    this.previousVisit = this.app.events.visits[id] || null;
    document.getElementById('world-site').value = id;
    this.toggle(true);
    if (fly) this.hud.flyToSite(this.app.sites.find(s => s.s.id === id));
  }
  inspectFact(id) {
    if (!this.app.events.known.has(id)) return;
    this.factId = id; this.tab = 'history'; this.toggle(true);
  }
  message(text) { document.getElementById('world-message').textContent = text; }
  update() {
    const now = performance.now();
    if (now - this.last < 500) return;
    this.last = now;
    const { sim, clock } = this.app;
    document.getElementById('sim-status').textContent = clock.paused ? 'World paused' : sim.time.limited ? 'Catching up · all systems share this clock' : `World second ${sim.state.tick} · ${clock.speed}×`;
    const signature = `${sim.state.tick}:${this.app.events.revision}:${this.filter}`;
    if (signature !== this.chronSignature) { this.renderChronicle(); this.chronSignature = signature; }
    if (this.panel.classList.contains('open')) this.render();
    const diagnostics = document.getElementById('world-diagnostics');
    if (diagnostics) {
      const s = this.app.stats;
      diagnostics.textContent = `Frame ${(s.frameMs || 0).toFixed(1)} ms · rules ${(s.simMs || 0).toFixed(2)} ms · ${s.calls || 0} draw calls · ${this.app.people.count} local figures · heap ${s.heapMB ? s.heapMB.toFixed(1) + ' MB' : 'unavailable'}`;
    }
    const save = document.getElementById('save-status'); if (save) save.textContent = this.app.saveStatus;
    if (this.pendingPerson) {
      const person = this.app.sim.state.residents[this.pendingPerson];
      const local = person && this.app.people.active.get(person.site);
      const ag = local?.agents.find(a => a.personId === this.pendingPerson);
      if (ag) { this.hud.follow({ kind: 'person', ref: ag, sim: local }); this.pendingPerson = null; }
    }
  }
  replaceHTML(target, html) {
    if (target._html === html) return;
    const focused = target.contains(document.activeElement) ? document.activeElement : null;
    const key = focused?.getAttribute('data-key');
    target.innerHTML = html; target._html = html;
    if (key) target.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }
  renderChronicle() {
    const entries = this.app.events.log.filter(f => this.filter === 'all' || this.filter === 'records' && !['reported', 'legend'].includes(f.status) || f.status === this.filter);
    this.replaceHTML(this.hud.chronList, entries.slice(0, 40).map(f => `<li class="chron in ${f.rumor ? 'rumor' : ''}"><button class="chron-btn" data-key="${e(f.id)}" data-fact="${e(f.id)}"><span class="chron-text">${e(f.text)}</span><span class="chron-when">${e(f.stamp)} · ${e(f.status)}</span></button></li>`).join('') || '<li class="world-empty">Visit a town to read its records. Reports need time to travel.</li>');
  }
  render(force = false) {
    this.panel.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === this.tab)));
    if (this.tab === 'save' && !force && this.body.dataset.view === 'save') return;
    this.body.dataset.view = this.tab;
    const html = this.tab === 'town' ? this.townHTML() : this.tab === 'journeys' ? this.journeysHTML() : this.tab === 'history' ? this.historyHTML() : this.saveHTML();
    this.replaceHTML(this.body, html);
  }
  townHTML() {
    const { state, catalog } = this.app.sim, p = catalog.byId[this.selected], town = state.settlements[this.selected];
    const site = this.app.sites.find(s => s.s.id === p.id);
    const near = this.app.controls.alt < 9 && site.centerWorld.distanceTo(this.app.controls.surfacePoint) < site.s.radius + 1.5;
    const intro = `<h3>${e(p.name)}</h3><p class="world-caption">${e(p.culture)} settlement · ${weatherAt(state, p.id, catalog) === 'dry' ? 'Dry weather' : 'Rain'}</p>`;
    if (!near) return `${intro}<p>Visit ${e(p.name)} to consult current stocks, residents and repairs.</p>${button('visit', 'Visit town')}`;
    const delta = this.previousVisit ? Math.max(0, town.outcomes - this.previousVisit.outcomes) : 0;
    this.app.events.visits[p.id] = { tick: state.tick, outcomes: town.outcomes };
    const people = Object.values(state.residents).filter(r => r.site === p.id);
    const buildings = Object.values(state.buildings).filter(b => b.site === p.id);
    const history = town.history.filter(id => this.app.events.known.has(id)).slice(-6).reverse();
    return `${intro}<p class="world-summary">${town.population} inhabitants · ${town.shortage ? 'Bread is scarce. River fish keep households fed while flour is sought.' : p.culture === 'undead' ? 'The dead keep their own obligations; ordinary meals are not consumed.' : 'The town has a food reserve.'} ${this.previousVisit ? `${delta} recorded changes since your last visit.` : 'Your first visit to the town register.'}</p>
      <h4>Town reserves</h4><dl class="stock-grid">${GOODS.map(g => `<div><dt>${g}</dt><dd>${town.stocks[g]}</dd></div>`).join('')}</dl>
      <h4>People to know</h4><ul class="world-list">${people.map(r => {
        const trip = state.trips.find(t => t.carrier === r.id && t.status === 'travelling');
        const doing = trip ? `travelling to ${catalog.byId[trip.to].name}` : r.location !== r.site ? `visiting ${catalog.byId[r.location].name}` : residentSchedule(state, r, catalog).activity;
        return `<li>${button('person', e(r.name), `data-person="${e(r.id)}" data-key="${e(r.id)}"`)}<span>${e(r.role)} · ${e(doing)}</span></li>`;
      }).join('')}</ul>
      <h4>Buildings & recovery</h4>${buildings.length ? buildings.map(b => `<article class="world-record"><p>${e(b.status)} · ${b.condition}% condition</p>${button('building', 'Inspect home', `data-building="${e(b.id)}" data-key="inspect-${e(b.id)}"`)} ${b.status === 'damaged' ? button('repair', 'Fund repair · 12 coin', `data-building="${e(b.id)}" data-key="repair-${e(b.id)}"`) : ''}<p class="world-caption">${b.status === 'damaged' ? 'Uses 6 timber and 1 tool. Completes in 90 world seconds; otherwise the town schedules its own repair.' : b.status === 'repairing' ? `Roof due in ${Math.max(0, b.repairAt - state.tick)} world seconds.` : b.status === 'burning' ? 'The bucket line is drawing water from the well.' : 'The repaired roof and its history persist.'}</p></article>`).join('') : '<p class="world-caption">No damaged buildings in the register.</p>'}
      <h4>Recent town history</h4>${history.map(id => { const f = state.facts.find(f => f.id === id); return f ? button('fact', e(f.text), `data-fact="${e(id)}" data-key="town-${e(id)}"`) : ''; }).join('')}
      <h4>Road watch</h4><p class="world-caption">An inspection closes a road for 90 world seconds and costs this town 2 coin. Cargo and reports wait together.</p>${catalog.edges.filter(r => r.a === p.id || r.b === p.id).map(r => button('close_route', `${e(catalog.byId[r.a === p.id ? r.b : r.a].name)} · ${state.routes[r.id].closedUntil > state.tick ? 'closed' : 'inspect road'}`, `data-route="${e(r.id)}" data-key="${e(r.id)}"`)).join('')}`;
  }
  journeysHTML() {
    const { state, catalog } = this.app.sim;
    const known = this.app.events.known;
    const trips = state.trips.filter(t => (t.from === this.selected || t.to === this.selected) &&
      (known.has(t.fact) || state.facts.some(f => f.trip === t.id && known.has(f.id)))).slice(-12).reverse();
    return `<h3>Journeys through ${e(catalog.byId[this.selected].name)}</h3><p class="world-caption">Manifested cargo leaves the origin's reserves at departure. Road inspections delay the cargo and its reports together.</p>${trips.map(t => `<article class="world-record"><h4>${e(catalog.byId[t.from].name)} → ${e(catalog.byId[t.to].name)}</h4><p>${e(state.residents[t.carrier].name)} · ${e(t.status)}</p><p>${Object.entries(t.cargo).map(([g, n]) => `${n} ${g}`).join(', ') || 'Courier · no cargo'} · ${t.reports.length} accounts carried</p><progress max="${t.duration}" value="${t.progress}" aria-label="Journey progress"></progress><p class="world-caption">${t.status === 'travelling' ? `${Math.max(0, t.etaTick - state.tick)} world seconds to arrival` : stamp(t.completed)}</p>${t.status === 'travelling' ? button('trip', 'Follow journey', `data-trip="${e(t.id)}" data-key="${e(t.id)}"`) : ''}</article>`).join('') || '<p>No recent journeys. Traders depart when a linked town needs supplies.</p>'}`;
  }
  historyHTML() {
    const { state, catalog } = this.app.sim;
    const f = state.facts.find(f => f.id === this.factId);
    if (!f || !this.app.events.known.has(f.id)) return '<p>This account is no longer in the recent archive.</p>';
    const report = f.report && state.reports.find(r => r.id === f.report);
    const witness = state.residents[f.witness];
    const parents = f.causeIds.map(id => state.facts.find(f => f.id === id)).filter(Boolean);
    const town = state.settlements[f.where];
    return `<h3>${e(catalog.byId[f.where].name)} · ${e(f.status)}</h3><p class="world-caption">${stamp(f.tick, catalog.byId[f.where].lon)} · ${e(f.id)}</p><p>${e(f.text)}</p><p class="world-caption">${f.status === 'legend' ? 'Unverified tradition. This account is not evidence of a world event.' : report ? `Carried by ${e(state.residents[report.carrier]?.name)} from ${e(catalog.byId[report.from].name)}; sent at ${report.sent}s, received at ${report.received}s.` : witness ? `Town record: ${e(witness.name)}, ${e(witness.role)}.` : 'Recorded in the town ledger.'}</p>
      ${button('event-place', 'Visit the place', `data-site="${e(f.where)}"`)}
      <h4>Causes & source trail</h4>${parents.length ? parents.map(p => this.app.events.known.has(p.id) || report?.factId === p.id ? button('source', e(p.text), `data-fact="${e(p.id)}" data-key="cause-${e(p.id)}"`) : '<p class="world-caption">A linked cause has not yet reached your records. Visit the origin or await a report.</p>').join('') : '<p class="world-caption">This is the start of the available account.</p>'}${f.archivedCauses ? '<p class="world-caption">Earlier causes have moved out of the recent archive.</p>' : ''}
      <h4>Ask a merchant to carry this account</h4><p class="world-caption">The merchant must be available and the connecting road open. The recipient learns the account only on arrival.</p>${town.known.includes(f.id) ? catalog.edges.filter(r => r.a === f.where || r.b === f.where).map(r => { const to = r.a === f.where ? r.b : r.a; return button('send_report', e(catalog.byId[to].name), `data-site="${e(f.where)}" data-to="${e(to)}" data-fact="${e(f.id)}" data-key="send-${e(r.id)}"`); }).join('') : ''}`;
  }
  saveHTML() {
    return `<h3>Keep this world</h3><p>Time pauses while this tab is hidden. Autosave runs every 30 seconds and when you leave. A previous snapshot is kept for recovery.</p><p id="save-status" role="status">${e(this.app.saveStatus)}</p>
      <div class="world-actions">${button('save', 'Save now')}${button('export', 'Export world')}${button('import', 'Import world')}</div>
      <input id="world-file" class="sr-only" type="file" accept="application/json,.json" tabindex="-1">
      <h4>Begin another history</h4><label for="world-seed">History seed</label><input id="world-seed" maxlength="80" value="${e(this.app.sim.state.seed)}"><p class="world-caption">The authored globe stays the same. A seed determines names and incident choices. Export first if you want to keep several histories.</p>${button('new', 'Begin new world')}
      <details class="world-diagnostics"><summary>Performance & reproducibility</summary><p>Default seed: sosaria-living-1. One day is 420 world seconds. Compare orbit, Highmoor streets, and the first fire after world second 90.</p><p id="world-diagnostics"></p></details>`;
  }
  action(b) {
    const app = this.app, d = b.dataset, type = d.action;
    if (type === 'visit') return this.hud.flyToSite(app.sites.find(s => s.s.id === this.selected));
    if (type === 'event-place') return this.openTown(d.site);
    if (type === 'fact') return this.inspectFact(d.fact);
    if (type === 'source') { app.events.known.add(d.fact); app.events.revision++; return this.inspectFact(d.fact); }
    if (type === 'person') {
      const person = app.sim.state.residents[d.person];
      const trip = app.sim.state.trips.find(t => t.carrier === d.person && t.status === 'travelling');
      if (trip) return this.followTrip(trip.id);
      this.hud.flyTo(app.sites.find(s => s.s.id === person.site).centerWorld, 2.5); this.pendingPerson = person.id;
      this.message(`${person.name}'s itinerary and memories are retained when you leave.`); return;
    }
    if (type === 'trip') return this.followTrip(d.trip);
    if (type === 'building') {
      const rec = app.structures.byBuilding.get(d.building);
      if (rec) { this.hud.stopFollow(); app.controls.flyTo(new app.THREE.Vector3().setFromMatrixPosition(rec.matrix).normalize(), 1.8, { tilt: -0.35 }); }
      return;
    }
    if (['repair', 'close_route', 'send_report'].includes(type)) {
      const result = app.sim.command({ type, site: d.site || this.selected, building: d.building, route: d.route, fact: d.fact, to: d.to });
      if (result.ok) app.save(); this.message(result.message); this.render(true); return;
    }
    if (type === 'save') { app.save(); this.message(app.saveStatus); return; }
    if (type === 'export') {
      const url = URL.createObjectURL(new Blob([app.exportWorld()], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `sosaria-day-${Math.floor(app.sim.state.tick / 420) + 1}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); this.message('World exported.'); return;
    }
    if (type === 'import') {
      const input = document.getElementById('world-file');
      input.onchange = async () => {
        const file = input.files[0]; if (!file) return;
        try { if (file.size > 4_000_000) throw new Error('World save is too large.'); app.importWorld(await file.text()); this.message('World imported.'); this.render(true); }
        catch (error) { this.message(`Import rejected: ${error.message}`); }
      }; input.click(); return;
    }
    if (type === 'new') {
      const seed = document.getElementById('world-seed').value.trim();
      if (!seed) return this.message('Enter a history seed.');
      if (window.confirm('Begin a new history? Export first to keep a separate copy. The previous snapshot slot is temporary and rotates on later saves.')) {
        app.newWorld(seed); this.message('A new history has begun.'); this.previousVisit = null; this.render(true);
      }
    }
  }
  followTrip(id) {
    const g = this.app.traffic.shipments.get(id);
    if (g) this.hud.follow({ kind: 'traffic', ref: g });
    else this.message('This journey has ended. Its result is in the town register.');
  }
}
