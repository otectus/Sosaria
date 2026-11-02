// Prose for the interface, generated from structured facts. Templates only restate what an event
// records: they never invent participants, cargo, progress or outcomes.
import { GOODS } from '../content/goods.js';
import { RECIPES } from '../content/recipes.js';
import { durationText, stamp } from '../sim/clock.js';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const capital = s => s ? s[0].toUpperCase() + s.slice(1) : '';

export function goodsText(goods) {
  const parts = Object.entries(goods || {}).filter(([, n]) => n > 0).map(([g, n]) => `${n} ${GOODS[g]?.name || g}`);
  return parts.length ? list(parts) : 'nothing';
}
export const unitText = (g, n) => `${n} ${n === 1 ? GOODS[g].unit : GOODS[g].unit === 'loaf' ? 'loaves' : `${GOODS[g].unit}s`}`;
export const list = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const name = (ctx, id) => ctx.catalog.byId[id]?.name || ctx.state.residents[id]?.name || id;
const who = (ctx, ids) => list((ids || []).map(id => ctx.state.residents[id]?.name).filter(Boolean).slice(0, 3));
const building = (ctx, id) => {
  const site = ctx.catalog.buildingSite[id], def = site && ctx.catalog.byId[site].byBuilding[id];
  const use = ctx.state.buildings[id]?.use || def?.use;
  return `${({ granary: 'the granary', home: 'a home', farmstead: 'a farmstead', barn: 'a barn', mill: 'a mill', bakery: 'the bakery', tavern: 'the tavern', stable: 'the stables', watchtower: 'the watchtower', construction: 'the tower site', keep: 'the keep' })[use] || `the ${use || 'building'}`}`;
};
const OUTCOME = { extinguished: 'was put out', burned_out: 'burned itself out', destroyed: 'destroyed the building', abandoned: 'was left to burn' };
const ROLE = { buckets: 'passed buckets', water: 'drew water', guard: 'kept the crowd back', salvage: 'carried out stores', protect: 'got their family clear', shelter: 'sheltered', watch: 'watched', witness: 'saw it', carrier: 'carried it', builder: 'built it', displaced: 'lost their home to it', hungry: 'went hungry', relief: 'brought relief', received_relief: 'received the relief', 'salvage_halted': 'waited for the flames to drop' };
export const roleText = r => ROLE[r] || r;

// One line for any event.
export function eventText(ctx, e) {
  if (!e) return 'An event that is no longer recorded.';
  const d = e.d || {}, at = name(ctx, e.w);
  switch (e.k) {
    case 'legend': return d.text;
    case 'legacy': return d.text;
    case 'summarized': return 'A routine record, now kept only as a count in the yearly summary.';
    case 'fire_started': return `Fire broke out in ${building(ctx, d.building)} at ${at}${d.origin === 'command' ? ' (a test fire started by the observer)' : d.origin === 'spread' ? ', spread from a neighbouring fire' : ''}.`;
    case 'ignition': return `A spark from a working hearth caught in ${building(ctx, d.building)} at ${at} (dryness ${d.dryness}%, wind ${d.wind}%).`;
    case 'fire_alarm': return `The alarm sounded in ${at}: ${building(ctx, d.building)} is burning. It was noticed after ${durationText(d.delay)}.`;
    case 'fire_abandoned': return `With no one left at the bucket line, ${at} let the fire in ${building(ctx, d.building)} burn.`;
    case 'fire_resolved': return `The fire in ${building(ctx, d.building)} at ${at} ${OUTCOME[d.outcome] || d.outcome} after ${durationText(d.duration)}. ${d.responders} people fought it with ${d.water} buckets. Lost: ${goodsText(d.lost)}${Object.keys(d.saved || {}).length ? `; saved: ${goodsText(d.saved)}` : ''}. Condition ${d.cond}%.`;
    case 'repair_planned': return `${at} planned the repair of ${building(ctx, d.building)} (${d.cond}% sound): ${d.stages.length} stages.`;
    case 'project_stage': return `${capital(d.stage)} finished on ${building(ctx, d.building)} at ${at}${Object.keys(d.materials || {}).length ? `, using ${goodsText(d.materials)}` : ''}.`;
    case 'project_completed': return d.kind === 'repair' ? `${capital(building(ctx, d.building))} at ${at} is repaired and back in use.` : `The ${d.kind} at ${at} is complete and in use.`;
    case 'project_blocked': return `Work on ${building(ctx, d.building)} at ${at} stopped: it needs ${goodsText(d.missing)} that the town does not have.`;
    case 'project_resumed': return `Materials arrived and work resumed on ${building(ctx, d.building)} at ${at}.`;
    case 'household_displaced': return `A household of ${d.members} in ${at} lost its home to the fire and is sheltering elsewhere.`;
    case 'household_rehoused': return `A displaced household in ${at} moved back into its repaired home.`;
    case 'household_hungry': return `A household of ${d.members} in ${at} has gone hungry for two days.`;
    case 'household_left': return `A hungry household left ${at} for ${name(ctx, d.to)}.`;
    case 'household_arrived': return `A household from ${name(ctx, d.from)} settled in ${at}.`;
    case 'household_returned': return `A household that had left in hard times came home to ${at} from ${name(ctx, d.from)}.`;
    case 'migration_completed': return `Migrants from ${name(ctx, d.from)} reached ${at}.`;
    case 'harvest': return `${who(ctx, e.a) || 'A farmer'} harvested ${d.grain} measures of grain at ${at}.`;
    case 'contract_agreed': return `${at} agreed to ${d.kind === 'relief' ? `send relief to ${name(ctx, d.buyer)} (${d.terms})` : `sell ${goodsText(d.goods)} to ${name(ctx, d.buyer)}${d.price ? ` for ${d.price} pennies` : ''}`}.`;
    case 'contract_failed': return `An order for ${goodsText(d.goods)} from ${name(ctx, d.seller)} to ${at} fell through (${({ no_carrier: 'no carrier was free', goods_missing: 'the goods were gone' })[d.reason] || d.reason}).`;
    case 'cannot_afford': return `${at} cannot afford ${d.good} from ${name(ctx, d.seller)} (${d.price} pennies).`;
    case 'shipment_departed': return `${who(ctx, e.a) || 'A carrier'} left ${at} for ${name(ctx, d.to)} with ${goodsText(d.cargo)}${d.vehicle === 'ship' ? ' by sea' : ''}.`;
    case 'shipment_delivered': return `${who(ctx, e.a) || 'A carrier'} delivered ${goodsText(d.cargo)} from ${name(ctx, d.from)} to ${at}${d.kind === 'relief' ? ` as ${d.terms === 'gift' ? 'a gift of' : d.terms === 'credit' ? 'relief on credit' : 'paid'} relief` : ''}.`;
    case 'traveller_departed': return `${who(ctx, e.a) || 'A traveller'} set out from ${at} for ${name(ctx, d.to)}.`;
    case 'traveller_arrived': return `${who(ctx, e.a) || 'A traveller'} arrived in ${at} from ${name(ctx, d.from)}.`;
    case 'journey_waiting': return `${who(ctx, e.a) || 'A carrier'} is waiting at ${at}: ${({ bridge_closed: 'the bridge ahead is closed', route_closed: 'the road ahead is closed', storm: 'a storm closes the passage', no_open_route: 'no open route leads there' })[d.reason] || d.reason}.`;
    case 'journey_rerouted': return `${who(ctx, e.a) || 'A carrier'} turned onto a longer way through ${list(d.via.map(v => name(ctx, v)))}.`;
    case 'report_received': return `${who(ctx, e.a) || 'A traveller'} brought ${d.kind === 'rumor' ? 'a rumour' : d.kind === 'legend' ? 'an old tale' : 'word'} from ${name(ctx, d.from)}: ${eventText(ctx, ctx.resolve(d.about))}`;
    case 'ration_policy': return d.to === 'normal' ? `${at} ended rationing: ${d.days} days of food on hand.` : `${at} began ${d.to === 'emergency' ? 'emergency rationing' : 'rationing'}: ${d.days} days of food for ${d.need} people.`;
    case 'relief_requested': return `${at} asked its neighbours for food relief${d.candidates?.length ? '' : ', but none could send any'}.`;
    case 'relief_agreed': return `${at} will send ${goodsText(d.goods)} to ${name(ctx, d.buyer)} as ${d.terms === 'gift' ? 'a gift' : d.terms === 'credit' ? 'relief on credit' : `a sale for ${d.price} pennies`} (trust ${d.trust}).`;
    case 'relief_refused': return `${at} refused relief to ${name(ctx, d.buyer)}: it cannot pay.`;
    case 'relief_unavailable': return `No neighbour of ${at} has food to spare or a free carrier; households must adapt.`;
    case 'grant_paid': return `${at} granted ${d.coin} pennies from the realm treasury to ${name(ctx, d.to)}.`;
    case 'dues_paid': return `${at} paid ${d.coin} pennies in dues to ${name(ctx, d.to)}.`;
    case 'goods_returned': return `Unfinished work in ${at} was put away: ${goodsText(d.goods)} went back to store.`;
    case 'intervention': return `Observer intervention: ${({ ignite: 'a test fire', close_route: 'a closure', set_rules: 'changed world rules', drought: `a drought for ${d.days} days`, request_relief: 'a relief request', fund_repair: 'ordered repair materials', send_report: 'sent a courier' })[d.type] || d.type}${d.experiment ? ' (experiment)' : ''}.`;
    case 'migration': return `This world was carried over from an earlier version of Sosaria (schema ${d.from} to ${d.to}). ${d.notes.join(' ')}`;
    default: return `${capital(e.k.replace(/_/g, ' '))} at ${at}.`;
  }
}

export const KIND = {
  legend: 'legend', legacy: 'record', report_received: 'report', intervention: 'intervention', migration: 'record',
};
export function eventKind(e) {
  if (e.k === 'report_received') return e.d.kind === 'rumor' ? 'rumor' : e.d.kind === 'legend' ? 'legend' : 'report';
  return KIND[e.k] || 'observed';
}
export const ICON = k => /fire|ignition/.test(k) ? 'flame' : /shipment|contract|journey|traveller|cannot/.test(k) ? 'coin' : /report|legend|legacy/.test(k) ? 'rumor' : /project|repair/.test(k) ? 'castle' : /relief|ration|hungry|household|migration/.test(k) ? 'crown' : 'star';

// Why a person is doing what they are doing, in plain language.
export function whyText(ctx, p) {
  const t = p.task, w = t?.why;
  if (!w) return 'Deciding what to do next.';
  const s = ctx.state, place = ctx.catalog.byId[p.at];
  const store = id => id?.startsWith('inv:building:') ? building(ctx, id.slice(4)) : id?.startsWith('inv:yard:') ? 'the yard' : 'the market';
  switch (w.key) {
    case 'sleep': return w.displaced ? 'Sleeping in shelter: their home is too damaged to live in.' : 'Asleep at home; it is night.';
    case 'meal': return `Eating supper at home (${GOODS[w.food]?.name}). Their household's pantry is filled by the town each dawn.`;
    case 'no_food': return `Hungry: the household pantry is empty and the town is ${w.policy === 'normal' ? 'not rationing yet' : w.policy === 'rationing' ? 'rationing food' : 'in emergency rationing'}.`;
    case 'work': {
      const r = RECIPES[w.recipe];
      const pct = w.need ? Math.round(100 * w.done / w.need) : 0;
      return `${r ? r.name : w.project ? 'Building' : 'Working'}: ${w.project ? `project work, ${pct}% of this shift's share done` : `${pct}% done`}.${r?.note ? ` ${r.note}` : ''}`;
    }
    case 'fetch': return `Fetching ${goodsText(w.goods)} for ${RECIPES[w.recipe]?.name.toLowerCase() || 'work'}; the goods are reserved for this job.`;
    case 'deliver': return `Carrying ${goodsText(w.goods)} to store.`;
    case 'blocked': return blockedText(ctx, w);
    case 'duty': return ({ watch: 'On watch. Guards on duty shorten the time before a fire is noticed.', stall: 'Keeping a market stall.', service: 'Leading a service at the temple.', tavern: 'Keeping the tavern.', music: 'Playing at the tavern.', court: 'Holding court.', counsel: 'Sitting with neighbours.', repairs: 'Mending tools; the town has enough.', keeping_stores: 'Keeping the stores in order.', vigil: 'Keeping vigil; the dead have no daily bread to earn.', rest_day: 'The commons is full, so there is time for other things.' })[w.duty] || 'On duty.';
    case 'respond': return `Responding to the fire: ${roleText(w.role)}. Their role was assigned when the alarm sounded.`;
    case 'load': return 'Loading a wagon for a delivery.';
    case 'journey': return 'Travelling between towns.';
    case 'unreachable': return 'Waiting: the way there is blocked, so they will not walk through walls to get there.';
    case 'social': return `Spending the evening in company (company need ${w.need}%).`;
    case 'play': return 'Playing near home.';
    case 'errand': return 'Running an errand.';
    case 'home': return 'At home.';
    case 'cold': return 'Sheltering from the cold.';
    default: return capital(w.key.replace(/_/g, ' '));
  }
}

export function blockedText(ctx, w) {
  switch (w.reason) {
    case 'calm': return `Idle: the mill sails need wind, and the air is still (${w.wind}%).`;
    case 'enough': return `Idle: the town already holds enough ${GOODS[w.good]?.name}.`;
    case 'no_input': return `Idle: there is no ${GOODS[w.good]?.name} to work with.`;
    case 'mill_busy': return 'Waiting: every mill is in use.';
    case 'oven_busy': return 'Waiting: the oven is in use.';
    case 'no_mill': return 'No working mill in this town.';
    case 'no_bakery': return 'No working bakery in this town.';
    case 'no_fish': return 'The fishing grounds are depleted for now.';
    case 'no_worker': return 'Nobody is working here at the moment.';
    default: return `Idle (${w.reason}).`;
  }
}

export const when = (ctx, tick, site) => stamp(tick, ctx.catalog.byId[site]?.lon);
