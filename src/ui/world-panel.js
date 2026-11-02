// World and saves: save slots, rotating autosaves, export and import, new histories, world rules,
// experiment branches and diagnostics. Experiments run only in an explicit branch.
import { stamp } from '../sim/clock.js';
import { stateHash } from '../sim/snapshot.js';
import { balance } from '../sim/inventory.js';
import { escapeHTML as e } from './text.js';

const btn = (act, label, attrs = '') => `<button class="world-button" data-act="${act}" ${attrs}>${label}</button>`;

export class WorldPanel {
  constructor(hud) {
    this.hud = hud; this.app = hud.app; this.el = document.getElementById('world-panel'); this.slots = []; this.msg = '';
    this.el.addEventListener('click', ev => { const b = ev.target.closest('[data-act]'); if (b) this.action(b); });
    this.render(true);
  }
  message(text) { this.msg = text; const m = document.getElementById('world-message'); if (m) m.textContent = text; }
  async refreshSlots() { try { this.slots = await this.app.saves.list(); } catch (err) { this.slots = []; this.message(err.message); } this.render(true); }

  render(force = false) {
    if (!force && this.el.contains(document.activeElement) && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
    const app = this.app, s = app.sim.state, rules = s.rules;
    if (force && !this.loaded) { this.loaded = true; this.refreshSlots(); }
    const slotRow = m => `<li><span><strong>${e(m.name)}</strong> · ${e(m.date)}${m.altered ? ' · altered rules' : ''}${m.branch ? ' · experiment' : ''}${m.migratedFrom ? ' · migrated' : ''}<br><span class="world-caption">${e(m.slot)} · ${(m.bytes / 1024).toFixed(0)} KB · rev ${m.revision}${m.schemaVersion > s.schemaVersion ? ' · newer version, untouched' : ''}</span></span>
      ${btn('load', 'Load', `data-slot="${e(m.slot)}"`)}${m.previousOf ? '' : btn('delete', 'Delete', `data-slot="${e(m.slot)}" aria-label="Delete ${e(m.name)}"`)}</li>`;
    const manual = this.slots.filter(m => m.kind !== 'auto' && !m.previousOf), autos = this.slots.filter(m => m.kind === 'auto' && !m.previousOf), previous = this.slots.filter(m => m.previousOf);
    const off = Object.entries(balance(s)).filter(([, n]) => n);
    const opened = new Set([...this.el.querySelectorAll('details[open]')].map(d => d.dataset.key));
    this.el.innerHTML = `<div class="panel-head"><h2 id="world-title" tabindex="-1">World</h2><span class="panel-sub">Saves, rules and experiments</span><button class="panel-close" data-close="world" aria-label="Close World panel">×</button></div>
      <div class="world-body">
        <p id="world-message" class="world-message" role="status">${e(this.msg || app.saveStatus)}</p>
        <p class="world-caption">History seed <strong>${e(s.seed)}</strong> · ${e(stamp(s.tick))} · minute ${s.tick}${s.branch ? ` · experiment “${e(s.branch.label)}” from ${e(s.branch.origin.slot || 'an unsaved world')} at minute ${s.branch.origin.tick}` : ''}${s.interventions.length ? ` · ${s.interventions.length} interventions recorded` : ''}${app.readOnly ? ' · read-only tab' : ''}</p>
        <div class="world-actions">${btn('save', 'Save')}${btn('saveas', 'Save as new slot')}${btn('export', 'Export to file')}${btn('import', 'Import from file')}</div>
        <label class="world-label" for="slot-name">Name for a new slot</label><input id="slot-name" maxlength="60" placeholder="My world">
        <input id="world-file" class="sr-only" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true">
        <h3>Saved worlds</h3><ul class="world-list slots">${manual.map(slotRow).join('') || '<li class="world-caption">No manual saves yet.</li>'}</ul>
        <h3>Autosaves</h3><p class="world-caption">Every minute, and when you leave the tab. Three rotate; the oldest is replaced.</p><ul class="world-list slots">${autos.map(slotRow).join('') || '<li class="world-caption">None yet.</li>'}</ul>
        ${previous.length ? `<details data-key="previous"><summary>Previous snapshots (${previous.length})</summary><ul class="world-list slots">${previous.map(slotRow).join('')}</ul></details>` : ''}
        <h3>Begin another history</h3><label class="world-label" for="world-seed">History seed</label><input id="world-seed" maxlength="80" value="${e(s.seed)}">
        <p class="world-caption">The authored globe stays the same; the seed sets names, appearances and chance. Save first to keep this world.</p>${btn('new', 'Begin new world')}
        <h3>World rules</h3>
        <label class="check"><input type="checkbox" id="rule-destructive" ${rules.destructiveIncidents ? 'checked' : ''}> Destructive emergencies (fires)</label>
        <label class="world-label" for="rule-ignition">Natural fire frequency</label><select id="rule-ignition">${[0, 50, 100, 200].map(v => `<option value="${v}" ${rules.ignition === v ? 'selected' : ''}>${v}%</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="rule-relief" ${rules.relief ? 'checked' : ''}> Neighbours send relief in a shortage</label>
        ${btn('rules', 'Apply rules')}<p class="world-caption">Production and trade continue whatever these rules say. Changing them is recorded in this world's history.</p>
        <h3>Experiments</h3>
        ${s.branch ? `<p class="world-caption">This is an experiment branch. Interventions are recorded and shown in the Chronicle.</p>
          <label class="world-label" for="exp-town">Town</label><select id="exp-town">${app.catalog.places.filter(p => p.economy === 'detailed').map(p => `<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</select>
          <div class="world-actions">${btn('exp-fire', 'Fire at the granary')}${btn('exp-drought', 'Ten days of drought')}${btn('exp-relief', 'Request relief now')}</div>
          <label class="world-label" for="exp-route">Road or bridge</label><select id="exp-route">${app.catalog.edges.filter(x => x.mode === 'road').map(x => `<option value="${e(x.id)}">${e(app.catalog.byId[x.a]?.name || x.a)} – ${e(app.catalog.byId[x.b]?.name || x.b)}</option>`).join('')}${app.catalog.bridges.filter(b => b.road).map(b => `<option value="${e(b.id)}">Bridge over the ${e(b.river)} (${e(b.road.split(':').slice(1).map(id => app.catalog.byId[id]?.name || id).join(' – '))})</option>`).join('')}</select>
          ${btn('exp-close', 'Close it for a day')}`
        : `<p class="world-caption">Experiments (test fires, droughts, closures) run in a separate branch that keeps a link to this world. ${btn('branch', 'Start an experiment branch')}</p>`}
        <details class="world-diagnostics" data-key="diagnostics"><summary>Performance and reproducibility</summary><p id="world-diagnostics"></p>
          <p class="world-caption">Resource ledger: ${off.length ? `out of balance (${e(off.map(([g, n]) => `${g} ${n}`).join(', '))})` : 'balanced for every good'}.</p>
          <p class="world-caption">Sea routes: ${app.world.seaReport.filter(r => r.valid).length} of ${app.world.seaReport.length} validated in navigable water${app.world.seaReport.some(r => r.supernatural) ? ' (the ghost ship sails a supernatural route)' : ''}.</p>
          ${btn('hash', 'Compute state hash')}<p class="world-caption" id="world-hash"></p></details>
      </div>`;
    for (const d of this.el.querySelectorAll('details[data-key]')) if (opened.has(d.dataset.key)) d.open = true;
  }

  update() {
    const d = document.getElementById('world-diagnostics');
    if (d && this.hud.panels.isOpen('world')) {
      const s = this.app.stats;
      d.textContent = `Frame ${(s.frameMs || 0).toFixed(1)} ms · rules ${(s.simMs || 0).toFixed(2)} ms · ${s.calls || 0} draw calls · ${this.app.people.count} figures drawn · ${s.achieved ? s.achieved.toFixed(1) : '–'}× achieved · heap ${s.heapMB ? s.heapMB.toFixed(1) + ' MB' : 'unavailable'}`;
    }
  }

  async experiment(type, params) {
    const app = this.app;
    if (!app.sim.state.branch) {
      if (!window.confirm('Experiments run in a new branch so your world stays as it is. Start a branch and continue?')) return;
      await app.branch(type === 'ignite' ? 'Fire experiment' : 'Experiment');
    }
    const r = app.sim.command({ type, ...params });
    this.message(r.message);
    this.render(true); this.hud.inspector.render(true);
    return r;
  }

  async action(b) {
    const app = this.app, act = b.dataset.act;
    if (act === 'save') { await app.save(); this.message(app.saveStatus); await this.refreshSlots(); }
    else if (act === 'saveas') { const name = document.getElementById('slot-name').value.trim() || 'Saved world'; await app.save(`manual-${Date.now().toString(36)}`, { name }); this.message(app.saveStatus); await this.refreshSlots(); }
    else if (act === 'export') { this.hud.download(app.exportWorld(), `sosaria-${app.sim.state.seed.replace(/[^a-z0-9-]/gi, '_')}-${app.sim.state.tick}.json`); this.message('World exported. Keep the file as an independent backup.'); }
    else if (act === 'import') {
      const input = document.getElementById('world-file');
      input.onchange = async () => {
        const file = input.files[0]; input.value = '';
        if (!file) return;
        try { if (file.size > 16_000_000) throw new Error('World save is too large.'); await app.importWorld(await file.text()); this.message('World imported. Save it to keep it in this browser.'); }
        catch (err) { this.message(`Import rejected: ${err.message} The running world was not changed.`); }
        this.render(true);
      };
      input.click();
    } else if (act === 'load') {
      try { await app.loadSlot(b.dataset.slot); this.message(app.saveStatus); } catch (err) { this.message(`Could not load: ${err.message}`); }
      this.render(true);
    } else if (act === 'delete') {
      if (!window.confirm('Delete this save? This cannot be undone.')) return;
      try { await app.saves.remove(b.dataset.slot); this.message('Deleted.'); } catch (err) { this.message(err.message); }
      await this.refreshSlots();
    } else if (act === 'new') {
      const seed = document.getElementById('world-seed').value.trim();
      if (!seed) return this.message('Enter a history seed.');
      if (window.confirm('Begin a new history? The current world stays in its save slots, but unsaved changes are lost.')) { app.newWorld(seed); this.message(app.saveStatus); this.render(true); }
    } else if (act === 'rules') {
      const r = app.sim.command({ type: 'set_rules', destructiveIncidents: document.getElementById('rule-destructive').checked, ignition: +document.getElementById('rule-ignition').value, relief: document.getElementById('rule-relief').checked });
      this.message(r.message); this.render(true);
    } else if (act === 'branch') { await app.branch('Experiment'); this.message('Experiment branch started and saved.'); await this.refreshSlots(); }
    else if (act.startsWith('exp-')) {
      const site = document.getElementById('exp-town')?.value;
      const place = app.catalog.byId[site];
      if (act === 'exp-fire') { const granary = place.granaries[0] || place.barns[0]; if (granary) await this.experiment('ignite', { building: granary }); }
      if (act === 'exp-drought') await this.experiment('drought', { site, days: 10 });
      if (act === 'exp-relief') await this.experiment('request_relief', { site });
      if (act === 'exp-close') await this.experiment('close_route', { route: document.getElementById('exp-route').value, hours: 24 });
    } else if (act === 'hash') document.getElementById('world-hash').textContent = `State hash ${stateHash(app.sim.state)} at minute ${app.sim.state.tick}.`;
  }
}
