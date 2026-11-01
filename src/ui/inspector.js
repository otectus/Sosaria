// The entity inspector: a stable panel for whatever is selected, resolved by ID on every refresh.
// Plain language first; numbers and the calculation behind them on expansion.
import { GOODS } from '../content/goods.js';
import { RECIPES, PROJECTS } from '../content/recipes.js';
import { personView, buildingView, settlementView, shipmentView, incidentView } from '../sim/explain.js';
import { resolve, causeChain, effectsOf } from '../sim/history.js';
import { durationText, stamp } from '../sim/clock.js';
import { escapeHTML as e, capital, eventText, eventKind, whyText, blockedText, goodsText, roleText, list } from './text.js';

const USE = { granary: 'Granary', home: 'Home', farmstead: 'Farmstead', barn: 'Barn', mill: 'Windmill', bakery: 'Bakery', tavern: 'Tavern', smithy: 'Smithy', temple: 'Temple', keep: 'Keep', stable: 'Stables',
  guardpost: 'Guard tower', gate: 'Gatehouse', construction: 'Tower under construction', watchtower: 'Watchtower', workshop: 'Workshop', mine: 'Mine', lighthouse: 'Lighthouse' };
const btn = (action, label, attrs = '') => `<button class="world-button" data-act="${action}" ${attrs}>${label}</button>`;
const link = (kind, id, label) => `<button class="linklike" data-kind="${kind}" data-id="${e(id)}">${e(label)}</button>`;
const meter = (label, value, max = 100) => `<div class="meter-row"><span>${e(label)}</span><meter min="0" max="${max}" value="${Math.max(0, Math.min(max, value))}" aria-label="${e(label)}: ${Math.round(value)} of ${max}"></meter><span class="num">${Math.round(value)}</span></div>`;
const goodsTable = goods => { const rows = Object.entries(goods || {}).filter(([, n]) => n > 0); return rows.length ? `<dl class="stock-grid">${rows.map(([g, n]) => `<div><dt>${e(GOODS[g]?.name || g)}</dt><dd>${n}</dd></div>`).join('')}</dl>` : '<p class="world-caption">Empty.</p>'; };

export class Inspector {
  constructor(hud) {
    this.hud = hud; this.app = hud.app; this.sel = null; this.el = document.getElementById('inspector'); this.html = '';
    this.el.addEventListener('click', ev => this.click(ev));
  }
  get ctx() { const { state, catalog } = this.app.sim; return { state, catalog, resolve: id => resolve(state, id) }; }
  show(sel) { this.sel = sel; this.render(true); }
  update() { if (this.sel && this.hud.panels.isOpen('inspector')) this.render(); }

  headline(sel) {
    const ctx = this.ctx, { state, catalog } = ctx;
    switch (sel?.kind) {
      case 'person': { const p = state.residents[sel.id]; if (!p) return { title: 'Someone who has left', sub: '' }; const v = personView(state, catalog, sel.id);
        return { title: p.name, sub: `${v.speciesName} ${v.occupationName} of ${catalog.byId[p.site].name}`, doing: whyText(ctx, v).replace(/\..*$/, '') }; }
      case 'building': { const site = catalog.buildingSite[sel.id]; const b = buildingView(state, catalog, sel.id); return { title: `${USE[b.use] || capital(b.use)} · ${catalog.byId[site].name}`, sub: `${b.cond}% condition${b.incident ? ' · on fire' : ''}`, doing: b.project ? `${b.project.stageName}` : '' }; }
      case 'settlement': { const p = catalog.byId[sel.id]; return { title: p.name, sub: `${p.culture} ${p.kind}`, doing: '' }; }
      case 'shipment': { const s = shipmentView(state, catalog, sel.id); if (!s) return { title: 'A finished journey', sub: '' }; return { title: `${s.carrierName || 'A carrier'}'s ${s.vehicle === 'ship' ? 'ship' : s.kind === 'contract' ? 'wagon' : 'journey'}`, sub: `${catalog.byId[s.from].name} → ${catalog.byId[s.to].name}`, doing: goodsText(s.cargo) }; }
      case 'incident': { const x = state.incidents[sel.id]; return { title: 'Fire', sub: x ? `${catalog.byId[x.site].name} · ${x.status}` : 'resolved', doing: '' }; }
      case 'event': { const ev = resolve(state, sel.id); return { title: eventText(ctx, ev).slice(0, 80), sub: ev ? stamp(ev.t, catalog.byId[ev.w]?.lon) : '', doing: '' }; }
      case 'dragon': { const d = sel.ref; return { title: d.name, sub: 'Dragon', doing: d.breathing > 0 ? 'breathing fire (a display; no committed effect)' : d.def.behavior === 'voyage' ? 'on its endless circuit of the world' : 'on the wing' }; }
      case 'beast': return { title: sel.ref.name, sub: 'Wild creature · presentation only', doing: sel.ref.S?.prowl ? 'on the prowl' : sel.ref.S?.fly ? 'riding the thermals' : 'wandering its range' };
      case 'traffic': return { title: ambientName(sel.ref), sub: 'Ambient traveller · no tracked cargo', doing: sel.ref.kind === 'sea' ? (sel.ref.supernatural ? 'sailing a supernatural route' : 'under sail') : 'on the road' };
      default: return { title: '', sub: '' };
    }
  }

  render(force = false) {
    const sel = this.sel, ctx = this.ctx;
    let body = '';
    if (!sel) body = '<p>Select a person, building, town, journey or event to inspect it.</p>';
    else if (sel.kind === 'person') body = this.person(ctx, sel.id);
    else if (sel.kind === 'building') body = this.building(ctx, sel.id);
    else if (sel.kind === 'settlement') body = this.settlement(ctx, sel.id);
    else if (sel.kind === 'shipment') body = this.shipment(ctx, sel.id);
    else if (sel.kind === 'incident') body = this.incident(ctx, sel.id);
    else if (sel.kind === 'event') body = this.event(ctx, sel.id);
    else body = this.ambient(sel);
    const h = this.headline(sel);
    const html = `<div class="panel-head"><h2 id="insp-title" tabindex="-1">${e(h.title || 'Inspector')}</h2><span class="panel-sub">${e(h.sub || '')}</span><button class="panel-close" data-close="inspector" aria-label="Close inspector">×</button></div>
      <div class="world-body insp-body">${body}</div>`;
    if (!force && html === this.html) return;
    const focused = this.el.contains(document.activeElement) ? document.activeElement : null;
    const key = focused?.dataset?.act ? `[data-act="${focused.dataset.act}"]` : focused?.dataset?.id ? `[data-id="${CSS.escape(focused.dataset.id)}"]` : null;
    const scroll = this.el.querySelector('.insp-body')?.scrollTop || 0;
    // Expanded sections stay expanded across refreshes.
    const opened = new Set([...this.el.querySelectorAll('details[open]')].map(d => d.dataset.key));
    this.el.innerHTML = html; this.html = html;
    for (const d of this.el.querySelectorAll('details[data-key]')) if (opened.has(d.dataset.key)) d.open = true;
    const bodyEl = this.el.querySelector('.insp-body'); if (bodyEl) bodyEl.scrollTop = scroll;
    if (key) this.el.querySelector(key)?.focus({ preventScroll: true });
    else if (focused && !this.el.contains(document.activeElement)) this.el.querySelector('h2')?.focus({ preventScroll: true });
  }

  actions(list) { return `<div class="world-actions">${list.join('')}</div>`; }

  person(ctx, id) {
    const v = personView(ctx.state, ctx.catalog, id);
    if (!v) return '<p>This person is no longer in the world records.</p>';
    const site = ctx.catalog.byId[v.at];
    const job = v.job;
    const h = v.household;
    return `<p class="world-summary">${e(whyText(ctx, v))}</p>
      ${v.journey ? `<p>${link('shipment', v.journey.id, `Travelling ${ctx.catalog.byId[v.journey.from].name} → ${ctx.catalog.byId[v.journey.to].name}`)}${v.journey.remaining !== null ? ` · arrives in ${durationText(v.journey.remaining)}` : ''}</p>` : `<p class="world-caption">${v.away ? `Visiting ${e(site.name)}` : `In ${e(site.name)}`}${v.task?.k && v.task.arr > ctx.state.tick ? ` · walking, ${durationText(v.task.arr - ctx.state.tick)} to go` : ''}.</p>`}
      ${Object.keys(v.carrying).length ? `<p>Carrying ${e(goodsText(v.carrying))}.</p>` : ''}
      ${job ? `<details data-key="why"><summary>Why this task?</summary><p>${e(RECIPES[job.recipe]?.name || capital(job.recipe))}, step "${e(job.step)}", ${job.labor}/${job.need} worker-minutes. ${job.building ? link('building', job.building, 'Workplace') : ''}${job.project ? ' · project work' : ''}</p><p class="world-caption">${e(occupationRule(v.occupation))}</p></details>` : ''}
      <h3>Household</h3>${h ? `<p>${h.members.map(m => m.id === id ? `<strong>${e(m.name)}</strong>` : link('person', m.id, m.name)).join(', ')}</p><p class="world-caption">${h.home ? `${link('building', h.home, h.displaced ? 'Their damaged home' : 'Home')} · ` : 'No fixed home · '}${h.pantry} rations in the pantry${h.hungryDays ? ` · hungry for ${h.hungryDays} days` : ''}</p>` : '<p>No household.</p>'}
      <h3>Needs</h3>${meter('Food', v.needs.food)}${meter('Rest', v.needs.rest)}${meter('Company', v.needs.social)}${meter('Warmth', v.needs.warmth)}${meter('Safety', v.needs.safety)}
      <p class="world-caption">${e(capital(v.speciesName))}, ${e(v.age)}, skill ${v.skill}${v.traits.length ? `, ${e(v.traits.join(', '))}` : ''} · health: ${e(v.health)} · citizen of ${e(v.faction)}</p>
      <h3>Remembers</h3>${v.memories.length ? `<ul class="world-list">${v.memories.map(m => `<li>${link('event', m.e, eventText(ctx, m.event).slice(0, 110))}<span>${e(roleText(m.r))}</span></li>`).join('')}</ul>` : '<p class="world-caption">Nothing remarkable yet.</p>'}
      ${v.ties.length ? `<h3>Knows</h3><p>${v.ties.map(t => link('person', t.id, `${t.name} (${t.kind})`)).join(', ')}</p>` : ''}
      ${this.actions([btn('follow', 'Follow'), btn('show', 'Show on map'), btn('town', `Visit ${e(ctx.catalog.byId[v.site].name)}`, `data-site="${e(v.site)}"`)])}`;
  }

  building(ctx, id) {
    const b = buildingView(ctx.state, ctx.catalog, id);
    if (!b) return '<p>Unknown building.</p>';
    const pr = b.project, x = b.incident;
    const idle = b.idle ? `<p>${e(blockedText(ctx, b.idle))}</p>` : '';
    return `<p class="world-summary">${b.functional ? 'In use.' : b.stage === 'construction' ? 'Under construction.' : x ? 'On fire.' : 'Out of use until it is repaired.'} ${b.cond}% sound.</p>
      ${x ? `<h3>Fire</h3>${meter('Intensity', x.intensity / 10)}<p>${Object.entries(x.roles).map(([r, n]) => `${n} ${roleText(r)}`).join(' · ') || 'No one is fighting it yet.'}</p><p class="world-caption">${x.buckets} buckets this minute · well at ${x.wellLevel}. Lost so far: ${e(goodsText(x.lost))}.</p>${link('incident', x.id, 'Inspect the incident')}` : ''}
      ${b.workers.length ? `<h3>At work</h3><ul class="world-list">${b.workers.map(w => `<li>${link('person', w.worker, w.name || 'Someone')}<span>${e(RECIPES[w.recipe]?.name || capital(w.recipe))}, ${e(w.step)}</span></li>`).join('')}</ul>` : idle}
      ${pr ? `<h3>${e(PROJECTS[pr.kind]?.name || 'Project')}: ${e(pr.stageName)} (${pr.stage + 1} of ${pr.stages.length})</h3>${meter('Labor', pr.labor, pr.laborNeed)}
        <p>Needs ${e(goodsText(pr.materials))}; delivered ${e(goodsText(pr.delivered))}${Object.keys(pr.inbound).length ? `; on the way ${e(goodsText(pr.inbound))}` : ''}.</p>
        ${pr.blocked ? `<p class="warn">Stopped: waiting for ${e(goodsText(pr.blocked.missing))}. ${btn('order', 'Order the materials', `data-building="${e(id)}"`)}</p>` : ''}
        ${pr.cause ? `<p class="world-caption">Because: ${link('event', pr.cause.id, eventText(ctx, pr.cause).slice(0, 100))}</p>` : ''}` : ''}
      <h3>Stored here</h3>${goodsTable(b.stock)}
      ${b.households.length ? `<p class="world-caption">${b.households.map(h => `${h.members} people${h.displaced ? ' (displaced)' : ''}`).join(' · ')} live here.</p>` : ''}
      ${b.lastIncident ? `<p class="world-caption">History: ${link('event', b.lastIncident.id, eventText(ctx, b.lastIncident).slice(0, 100))}</p>` : ''}
      ${this.actions([btn('show', 'Show on map'), btn('town', `${e(ctx.catalog.byId[b.site].name)}`, `data-site="${e(b.site)}"`), b.combustible && !x ? btn('testfire', 'Test fire (experiment)', `data-building="${e(id)}"`) : ''])}`;
  }

  settlement(ctx, id) {
    const s = settlementView(ctx.state, ctx.catalog, id);
    if (!s) return '<p>Unknown settlement.</p>';
    const f = s.food;
    const outlookText = !s.population ? 'No one lives here now.' : f.days >= 8 ? `Food is secure: about ${f.days.toFixed(1)} days on hand.` : f.days >= 4 ? `Food is adequate: about ${f.days.toFixed(1)} days on hand.` : `Food is short: about ${f.days.toFixed(1)} days on hand.`;
    const blocked = Object.entries(s.blocked).map(([k, n]) => { const [reason, good] = k.split(':'); return `${n} × ${blockedText(ctx, { reason, good })}`; });
    const fav = this.hud.observer.favorites.includes(id);
    return `<p class="world-summary">${e(s.role || `${capital(s.culture)} ${s.kind}.`)} ${e(outlookText)} ${f.policy !== 'normal' ? `<strong>${f.policy === 'emergency' ? 'Emergency rationing.' : 'Rationing.'}</strong>` : ''}</p>
      <details data-key="food"><summary>How is food counted?</summary><p class="world-caption">${f.rations} rations held by stores and households (every food at its plain value; baking flour into bread would stretch it further), divided by ${f.need} people who eat, gives ${f.days.toFixed(1)} days. ${f.incoming ? `${f.incoming} rations are on the way.` : 'Nothing is on the way.'} This is an estimate; spoilage and new harvests change it.</p></details>
      <p class="world-caption">${s.population} residents${s.away ? ` (${s.away} away)` : ''}${s.visitors ? ` · ${s.visitors} visitors` : ''} · ${s.households} households${s.displaced ? ` · ${s.displaced} displaced` : ''}${s.hungry ? ` · ${s.hungry} hungry` : ''}</p>
      ${s.fires.length ? `<p class="warn">${s.fires.map(x => link('incident', x.id, `Fire at ${USE[x.use] || x.use}`)).join(' ')}</p>` : ''}
      <h3>Stores</h3>${goodsTable(Object.fromEntries(Object.entries(s.stores).filter(([g]) => g !== 'coin')))}<p class="world-caption">Treasury ${s.treasury} pennies${s.escrow ? ` (${s.escrow} promised to sellers)` : ''} · well ${Math.round(100 * s.water.level / Math.max(1, s.water.max))}% · dryness ${s.dryness}% · woodland ${Math.round(100 * s.woodland / Math.max(1, s.woodlandMax))}%</p>
      ${s.economy === 'detailed' ? `<h3>Work</h3><p>${Object.entries(s.jobs).map(([r, n]) => `${n} ${e(RECIPES[r]?.name.toLowerCase() || r)}`).join(' · ') || 'No work in progress.'}</p>${blocked.length ? `<p class="world-caption">${e(blocked.join(' '))}</p>` : ''}${Object.keys(s.fields).length ? `<p class="world-caption">Fields: ${Object.entries(s.fields).map(([k, n]) => `${n} ${k}`).join(', ')}</p>` : ''}` : '<p class="world-caption">This settlement lives by subsistence work (hunting, foraging, herds and gardens) into a shared commons. Its full economy is later work.</p>'}
      ${s.projects.length ? `<h3>Building</h3><ul class="world-list">${s.projects.map(p => `<li>${link('building', ctx.state.projects[p.id]?.building, `${PROJECTS[p.kind]?.name}: ${p.stageName}`)}<span>${p.blocked ? `waiting for ${e(goodsText(p.blocked.missing))}` : `${Math.round(100 * p.labor / p.laborNeed)}%`}</span></li>`).join('')}</ul>` : ''}
      ${s.contracts.length ? `<h3>Trade</h3><ul class="world-list">${s.contracts.map(c => `<li>${e(c.role === 'buying' ? 'Buying' : 'Selling')} ${e(goodsText(c.goods))} ${c.role === 'buying' ? 'from' : 'to'} ${link('settlement', c.partner, ctx.catalog.byId[c.partner].name)}<span>${e(c.kind)} · ${e(c.status)}${c.terms !== 'sale' ? ` · ${e(c.terms)}` : ''}${c.shipment ? ` · ${link('shipment', c.shipment, 'journey')}` : ''}</span></li>`).join('')}</ul>` : ''}
      ${s.steward ? `<p class="world-caption">Steward: ${link('person', s.steward.id, s.steward.name)}</p>` : ''}
      <h3>Recent</h3>${s.recent.length ? `<ul class="world-list">${s.recent.slice(0, 8).map(ev => `<li>${link('event', ev.id, eventText(ctx, ev).slice(0, 110))}</li>`).join('')}</ul>` : '<p class="world-caption">Nothing recorded yet.</p>'}
      <details data-key="people"><summary>People here (${s.present})</summary><ul class="world-list">${Object.values(ctx.state.residents).filter(p => p.at.site === id && !p.journey).sort((a, b) => a.occupation.localeCompare(b.occupation) || a.name.localeCompare(b.name)).map(p => `<li>${link('person', p.id, p.name)}<span>${e(p.occupation)}</span></li>`).join('')}</ul></details>
      ${this.actions([btn('town', 'Visit', `data-site="${e(id)}"`), btn('fav', fav ? '★ Favourite' : '☆ Add to favourites', `aria-pressed="${fav}" data-site="${e(id)}"`), f.policy !== 'normal' && !s.relief ? btn('relief', 'Ask neighbours for relief', `data-site="${e(id)}"`) : ''])}`;
  }

  shipment(ctx, id) {
    const s = shipmentView(ctx.state, ctx.catalog, id);
    if (!s) return '<p>This journey has ended; its result is in the Chronicle and the town records.</p>';
    const names = s.nodes.map(n => ctx.catalog.byId[n]?.name || n);
    const wait = s.wait ? ({ bridge_closed: 'waiting before a closed bridge', route_closed: 'waiting for the road to reopen', storm: 'sheltering from a storm', no_open_route: 'no open route', unloading_queue: 'queued to unload' })[s.wait.reason] || s.wait.reason : null;
    return `<p class="world-summary">${e(capital(s.status))}${wait ? ` · ${e(wait)}` : ''}${s.remaining !== null && s.status === 'travelling' ? ` · arrives in about ${durationText(s.remaining)}` : ''}.</p>
      <p>Carrying ${e(goodsText(s.cargo))}${s.contract ? ` under a ${e(s.contract.kind)} contract (${e(s.contract.terms)}${s.contract.price ? `, ${s.contract.price} pennies held until delivery` : ''})` : ''}.</p>
      <p class="world-caption">Carrier: ${s.carrier ? link('person', s.carrier, s.carrierName) : 'not yet assigned'} · ${e(s.vehicle)} · route ${e(list(names))}</p>
      ${meter('Leg progress', s.progress * 100)}
      <p class="world-caption">The cargo left the seller's store at departure and is held by this journey until it is delivered once, at arrival.</p>
      ${s.departure ? `<p class="world-caption">${link('event', s.departure.id, 'Departure record')}</p>` : ''}
      ${this.actions([btn('follow', 'Follow'), btn('town', `Origin: ${e(ctx.catalog.byId[s.from].name)}`, `data-site="${e(s.from)}"`), btn('town', `Destination: ${e(ctx.catalog.byId[s.to].name)}`, `data-site="${e(s.to)}"`)])}`;
  }

  incident(ctx, id) {
    const x = incidentView(ctx.state, ctx.catalog, id);
    if (!x) return '<p>This incident has been resolved and archived; its record remains in the Chronicle.</p>';
    const t = ctx.state.tick;
    return `<p class="world-summary">${x.ended ? `Ended: ${e(x.outcome.replace('_', ' '))} after ${durationText(x.ended - x.ignited)}.` : `${x.status === 'abandoned' ? 'Left to burn' : 'Burning'} for ${durationText(t - x.ignited)}.`}</p>
      ${meter('Intensity', x.intensity / 10)}${meter('Fuel left', 100 * x.fuel / Math.max(1, x.fuel0))}
      <p>${link('building', x.building, USE[x.use] || x.use)} · noticed ${x.detected === null ? 'not yet' : `after ${durationText(x.detected - x.ignited)}`}.</p>
      <p>${Object.entries(x.roles).map(([r, n]) => `${n} ${roleText(r)}`).join(' · ') || 'No responders.'}</p>
      <p class="world-caption">${x.water} buckets used · damage ${x.damage} · lost ${e(goodsText(x.lost))}${Object.keys(x.saved).length ? ` · saved ${e(goodsText(x.saved))}` : ''}</p>
      <h3>How it started</h3><p>${link('event', x.cause.id, eventText(ctx, x.cause))}</p>
      ${this.actions([btn('show', 'Show on map')])}`;
  }

  event(ctx, id) {
    const ev = resolve(ctx.state, id);
    if (!ev) return '<p>No such record.</p>';
    const kind = eventKind(ev);
    const causes = causeChain(ctx.state, id, 5).slice(1);
    const effects = effectsOf(ctx.state, id);
    const pins = this.hud.pins(), pinned = pins.includes(id);
    const actors = (ev.a || []).filter(a => ctx.state.residents[a]);
    return `<p><span class="badge badge-${kind}">${e(kind)}</span> ${e(eventText(ctx, ev))}</p>
      <p class="world-caption">${e(stamp(ev.t, ctx.catalog.byId[ev.w]?.lon))} · ${e(ctx.catalog.byId[ev.w]?.name || ev.w)} · ${e(ev.id)}${ev.archived ? ' · archived' : ''}</p>
      ${kind === 'legend' ? '<p class="world-caption">An unverified traditional account. It is not evidence of a world event.</p>' : kind === 'rumor' ? '<p class="world-caption">A second-hand account: it has passed through more than one town, and confidence falls with each telling. The source event is linked below.</p>' : ''}
      ${actors.length ? `<p>Involved: ${actors.map(a => link('person', a, ctx.state.residents[a].name)).join(', ')}</p>` : ''}
      <h3>Why did this happen?</h3>${causes.length ? `<ul class="world-list">${causes.map(c => `<li>${link('event', c.id, eventText(ctx, c).slice(0, 120))}</li>`).join('')}</ul>` : '<p class="world-caption">No earlier cause is recorded; this is where the account begins.</p>'}
      <h3>What changed?</h3>${effects.length ? `<ul class="world-list">${effects.map(c => `<li>${link('event', c.id, eventText(ctx, c).slice(0, 120))}</li>`).join('')}</ul>` : '<p class="world-caption">No later record names this as a cause yet.</p>'}
      <details data-key="facts"><summary>Recorded facts</summary><pre class="facts">${e(JSON.stringify(ev.d, null, 1))}</pre></details>
      ${this.actions([btn('show', 'Show on map'), btn('pin', pinned ? 'Unpin thread' : 'Pin thread', `aria-pressed="${pinned}"`), ev.d?.building ? link('building', ev.d.building, 'The building') : '', ev.d?.shipment ? link('shipment', ev.d.shipment, 'The journey') : ''])}`;
  }

  ambient(sel) {
    const h = this.headline(sel);
    return `<p class="world-summary">${e(capital(h.doing || ''))}.</p><p class="world-caption">${sel.kind === 'dragon' ? 'Dragon flights are presentation in this release: they keep their routes and do not yet act on the world.' : 'This is ambient presentation. It does not carry tracked goods or change the world.'}</p>${this.actions([btn('follow', 'Follow'), btn('show', 'Show on map')])}`;
  }

  click(ev) {
    const t = ev.target.closest('[data-kind],[data-act]');
    if (!t) return;
    const app = this.app, hud = this.hud;
    if (t.dataset.kind) { hud.select({ kind: t.dataset.kind, id: t.dataset.id }); return; }
    const act = t.dataset.act;
    if (act === 'follow') hud.followSelection();
    else if (act === 'show') hud.showSelection();
    else if (act === 'town') hud.selectSettlement(t.dataset.site);
    else if (act === 'fav') { const list = hud.observer.favorites, i = list.indexOf(t.dataset.site); if (i >= 0) list.splice(i, 1); else list.push(t.dataset.site); hud.saveObserver(); hud.drawAtlas?.(); this.render(true); }
    else if (act === 'pin') { const pins = hud.pins(), i = pins.indexOf(this.sel.id); if (i >= 0) pins.splice(i, 1); else pins.push(this.sel.id); hud.saveObserver(); this.render(true); hud.chronicle.render(true); }
    else if (act === 'relief') { const r = app.sim.command({ type: 'request_relief', site: t.dataset.site }); hud.worldPanel.message(r.message); this.render(true); }
    else if (act === 'order') { const r = app.sim.command({ type: 'fund_repair', building: t.dataset.building }); hud.worldPanel.message(r.message); this.render(true); }
    else if (act === 'testfire') hud.worldPanel.experiment('ignite', { building: t.dataset.building });
  }
}

function ambientName(g) {
  const names = { wagon: 'Merchant wagon', rider: 'Courier on horseback', walkers: 'Travellers on foot', patrol: 'Road patrol', party: 'A band of adventurers', caravan: 'Trade caravan',
    hunters: 'Hunting party', boarriders: 'Boar-riders', orecart: 'Dwarven ore cart', porters: 'Kobold porters', cog: 'Merchant cog', warship: 'Valdren warship', ghostship: 'A ghost ship',
    pirate: 'Pirate brigantine', fishboat: 'Fishing boat', rowboat: 'Rowboat', canoe: 'Dugout canoe', swanboat: 'Elven swan-boat', raft: 'Hide raft' };
  return names[g.type] || 'Travellers';
}

function occupationRule(o) {
  return ({ farmer: 'Farmers harvest ripe plots first, then sow fallow ones in a sowing season (spring or autumn), then tend growing plots once a day.',
    miller: 'Millers grind 40 measures at a time when a windmill is free, there is wind, and the town is short of flour.',
    baker: 'Bakers bake when the market is short of bread, fetching 40 measures of flour from the granary and firewood from the yard for 60 loaves.',
    builder: 'Masons carry missing materials to a project, then build once every material for the stage is on site.',
    woodcutter: 'Woodcutters fell wood while the yard is short of timber or firewood and the woodland can bear it.',
    storekeeper: 'Storekeepers move reserve stock into the granary when it runs low, and lead salvage in a fire.',
    laborer: 'Labourers help where work is waiting: building projects, ripe fields, woodcutting, and foraging in a shortage.' })[o] || 'Duties follow the town and the hour.';
}
