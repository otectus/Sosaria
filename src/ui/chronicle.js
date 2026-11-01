// The Chronicle: a live feed and a searchable archive of committed history, with pinned threads.
// Observed events, carried reports, rumours and legends are labelled in words and style. Repeated
// updates group into an incident's few milestones; routine records stay out of the live feed.
import { resolve } from '../sim/history.js';
import { stamp } from '../sim/clock.js';
import { escapeHTML as e, eventText, eventKind, ICON } from './text.js';
import { icon } from './hud.js';

const ROUTINE = new Set(['harvest', 'goods_returned', 'traveller_departed', 'traveller_arrived', 'contract_agreed', 'project_resumed', 'dues_paid', 'report_received']);
const CATEGORY = { fire: /fire|ignition/, trade: /shipment|contract|journey|cannot|relief_agreed|dues/, people: /household|migration|hungry|ration|relief_requested|relief_unavailable|relief_refused/, building: /project|repair/, news: /report|legend|legacy|intervention|migration/ };

export class Chronicle {
  constructor(hud) {
    this.hud = hud; this.app = hud.app; this.el = document.getElementById('chronicle');
    this.filters = { q: '', kind: '', cat: '', site: '', routine: false, archive: false };
    this.lastEvent = 0; this.shown = 0;
    this.el.innerHTML = `
      <div class="panel-head"><h2 id="chron-title" tabindex="-1">Chronicle</h2><span class="panel-sub">What the world has recorded</span><button class="panel-close" data-close="chronicle" aria-label="Close Chronicle">×</button></div>
      <div class="chron-tools">
        <label class="sr-only" for="chron-q">Search the Chronicle</label><input id="chron-q" type="search" placeholder="Search history" autocomplete="off" data-autofocus>
        <div class="atlas-filters">
          <label class="sr-only" for="chron-kind">Kind of account</label><select id="chron-kind"><option value="">All accounts</option><option value="observed">Observed</option><option value="report">Reports</option><option value="rumor">Rumours</option><option value="legend">Legends</option><option value="intervention">Interventions</option></select>
          <label class="sr-only" for="chron-cat">Subject</label><select id="chron-cat"><option value="">All subjects</option><option value="fire">Fires</option><option value="trade">Trade and journeys</option><option value="people">Households and food</option><option value="building">Building</option><option value="news">News and lore</option></select>
          <label class="sr-only" for="chron-site">Place</label><select id="chron-site"><option value="">Everywhere</option>${this.app.sites.map(s => `<option value="${e(s.s.id)}">${e(s.s.name)}</option>`).join('')}</select>
        </div>
        <label class="check"><input type="checkbox" id="chron-routine"> Include routine records</label>
        <label class="check"><input type="checkbox" id="chron-archive"> Search the archive</label>
      </div>
      <div id="chron-pins"></div>
      <ol class="chron-list" id="chron-list"></ol>
      <p class="world-caption chron-foot" id="chron-foot"></p>`;
    const bind = (id, key, prop = 'value') => document.getElementById(id).addEventListener('input', ev => { this.filters[key] = ev.target[prop]; this.render(true); });
    bind('chron-q', 'q'); bind('chron-kind', 'kind'); bind('chron-cat', 'cat'); bind('chron-site', 'site'); bind('chron-routine', 'routine', 'checked'); bind('chron-archive', 'archive', 'checked');
    this.el.addEventListener('click', ev => { const b = ev.target.closest('[data-event]'); if (b) this.hud.select({ kind: 'event', id: b.dataset.event }); });
    this.render(true);
  }
  get ctx() { const { state, catalog } = this.app.sim; return { state, catalog, resolve: id => resolve(state, id) }; }
  reset() { this.lastEvent = 0; this.render(true); }

  matches(ctx, ev) {
    const f = this.filters, kind = eventKind(ev);
    if (!f.routine && (ROUTINE.has(ev.k) || ev.i === 0) && !f.q) return false;
    if (f.kind && kind !== f.kind && !(f.kind === 'intervention' && ev.k === 'intervention')) return false;
    if (f.cat && !CATEGORY[f.cat].test(ev.k)) return false;
    if (f.site && ev.w !== f.site) return false;
    if (f.q && !eventText(ctx, ev).toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  }

  entry(ctx, ev) {
    const kind = eventKind(ev);
    return `<li class="chron in ${kind !== 'observed' ? 'rumor' : ''}"><button class="chron-btn" data-event="${e(ev.id)}">${icon(ICON(ev.k), 'cico')}<span class="chron-text">${e(eventText(ctx, ev))}</span><span class="chron-when"><span class="badge badge-${kind}">${e(kind)}</span> ${e(stamp(ev.t, ctx.catalog.byId[ev.w]?.lon))} · ${e(ctx.catalog.byId[ev.w]?.name || '')}</span></button></li>`;
  }

  // Newest first; only the first page is built, so long histories stay cheap.
  render(force = false) {
    const ctx = this.ctx, s = ctx.state;
    const pins = this.hud.pins().map(id => resolve(s, id)).filter(Boolean);
    const pinsEl = document.getElementById('chron-pins');
    const pinsHtml = pins.length ? `<h3 class="chron-h">Pinned threads</h3><ol class="chron-list pinned">${pins.map(ev => this.entry(ctx, ev)).join('')}</ol>` : '';
    if (pinsEl._html !== pinsHtml) { pinsEl.innerHTML = pinsHtml; pinsEl._html = pinsHtml; }
    const source = this.filters.archive ? [...s.archive, ...s.events] : s.events;
    const out = [];
    for (let i = source.length - 1; i >= 0 && out.length < 60; i--) if (this.matches(ctx, source[i])) out.push(source[i]);
    const html = out.map(ev => this.entry(ctx, ev)).join('') || '<li class="world-empty">Nothing matches yet. History accumulates as the world runs.</li>';
    const list = document.getElementById('chron-list');
    if (force || list._html !== html) {
      const focused = list.contains(document.activeElement) ? document.activeElement.dataset.event : null;
      list.innerHTML = html; list._html = html;
      if (focused) list.querySelector(`[data-event="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    }
    document.getElementById('chron-foot').textContent = `${s.events.length} recent records · ${s.archive.length} archived · ${Object.values(s.summaries).reduce((n, k) => n + k, 0)} routine records summarized`;
  }

  update() {
    const s = this.app.sim.state;
    const latest = s.events.at(-1);
    const n = latest ? +latest.id.split(':')[1] : 0;
    if (n === this.lastEvent) return;
    // Major new events are announced politely, never assertively, and only if enabled.
    for (let i = s.events.length - 1; i >= 0 && +s.events[i].id.split(':')[1] > this.lastEvent; i--) {
      const ev = s.events[i];
      if (ev.i >= 2 && this.lastEvent) this.hud.announce(eventText(this.ctx, ev));
    }
    this.lastEvent = n;
    if (this.hud.panels.isOpen('chronicle')) this.render();
    else document.getElementById('btn-chron').classList.add('ping');
  }
}
