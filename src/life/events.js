// The world's happenings: sightings, fires, thieves, raids, festivals, rituals and arrivals.
// Events touch the townsfolk when you are near, and every one of them lands in the Chronicle,
// followed later by rumors that travel to other towns (and grow in the telling).

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { PLANET_RADIUS, dirToLatLon } from '../core/sphere.js';
import { timeOfDayName } from '../render/sky.js';

const R = PLANET_RADIUS;

const RUMOR_TELLS = [
  (s) => `In ${s}, they swear it happened twice.`,
  (s) => `Travellers at ${s} tell it with more teeth each time.`,
  (s) => `The fishwives of ${s} have already made a song of it.`,
  (s) => `A drunk in ${s} claims he saw the whole thing.`,
  (s) => `At ${s} the priests are calling it an omen.`,
];

const IDLE_RUMORS = [
  ['rune', 'They say the Drifting Spire sinks a finger-width every winter, and rises again by spring.', 'floatisle'],
  ['rune', 'Shepherds near Hollowstones hear humming on moonless nights.', 'hollowstones'],
  ['sword', 'A knight of Highmoor rode for the Runeblade of Aurelion. Nobody has heard from her since.', 'runeblade'],
  ['skull', 'The Maw Reef took another ship. The sea serpent was seen feeding near it.', 'wreck'],
  ['dragon', 'Old Aurum has not landed in living memory. The monks at Hollowmere think it never will.', 'aurum'],
  ['coin', 'Dwarven silver from Deepdelve is fetching a king\'s price in Saltmere.', 'deepdelve'],
  ['rune', 'The Moonwell showed a stranger\'s face at noon. The elves are not saying whose.', 'moonwell'],
  ['skull', 'Fishermen off Duskmere net lanterns, still lit, from the bottom of the Blackwater.', 'duskmere'],
  ['crown', 'The King of Valdren has doubled the watch on the Ironpeak road.', 'highmoor'],
  ['wave', 'Pirates out of Blackfin Cove took a cog bound for Cinderhold.', 'blackfin'],
  ['flame', 'The Ash God\'s Brazier burned blue for an hour. The dragon-priests fasted.', 'ashbrazier'],
  ['beast', 'The Great Tortoise changed course. The boar-folk read it as a sign to move camp.', 'tortoise'],
  ['rune', 'A glowing crack opened in the Sundered Vale. It closed before anyone could name it.', 'floatisle'],
  ['sword', 'Adventurers returned from Old Varrow with a map drawn on skin.', 'oldvarrow'],
  ['beast', 'A griffin stole a lamb at Gryphon\'s Perch and brought it back, unharmed, the next day.', 'gryphonperch'],
];

export class Events {
  constructor(app) {
    this.app = app;
    this.log = [];
    this.listeners = [];
    this.rnd = mulberry32(99);
    this.nextEvent = 8;
    this.nextRumor = 25;
    this.pendingRumors = [];
    this.dragonCooldown = new Map();
    this.fires = [];
    this.thieves = [];
    this.t = 0;
    this.siteById = new Map(app.sites.map(s => [s.s.id, s]));
    // Open the Chronicle with the world already in motion.
    const start = [IDLE_RUMORS[0], IDLE_RUMORS[4], IDLE_RUMORS[8]];
    for (const [icon, text, ref] of start) this.post({ icon, rumor: true, text: 'Rumor: ' + text, pos: this.refPos(ref), follow: ref === 'aurum' ? 'dragon:aurum' : null });
    this.post({ icon: 'crown', text: 'Morning bells over Highmoor. The market square is filling.', site: 'highmoor', pos: this.siteById.get('highmoor').centerWorld.clone() });
  }

  on(fn) { this.listeners.push(fn); }

  post(entry) {
    const c = this.app.clock;
    const lon = entry.pos ? dirToLatLon([entry.pos.x, entry.pos.y, entry.pos.z].map(v => v / (entry.pos.length() || 1)))[1] : 0;
    const hour = c.hourAt(lon);
    entry.stamp = `Day ${c.localDay(lon)}, ${timeOfDayName(hour).toLowerCase()}`;
    entry.id = this.log.length + 1;
    this.log.unshift(entry);
    if (this.log.length > 60) this.log.pop();
    for (const fn of this.listeners) fn(entry);
    if (entry.site && !entry.rumor && this.rnd() < 0.75) {
      this.pendingRumors.push({ at: this.t + 30 + this.rnd() * 60, about: entry });
    }
  }

  siteCenter(site) { return site.centerWorld.clone(); }

  pickSite(filter) {
    const list = this.app.sites.filter(filter);
    return list.length ? list[Math.floor(this.rnd() * list.length)] : null;
  }

  // Prefer the settlement under the camera so events are often witnessed.
  pickSiteNear(filter) {
    const cam = this.app.camera.position;
    const list = this.app.sites.filter(filter);
    if (!list.length) return null;
    if (this.rnd() < 0.55) {
      list.sort((a, b) => a.centerWorld.distanceTo(cam) - b.centerWorld.distanceTo(cam));
      return list[Math.floor(this.rnd() * Math.min(3, list.length))];
    }
    return list[Math.floor(this.rnd() * list.length)];
  }

  alarm(site, kind, x, y, dur) {
    const sim = this.app.people.simFor(site);
    if (sim) sim.alarm = { kind, x, y, until: this.app.people.time + dur };
    site.pendingAlarm = { kind, x, y, until: this.t + dur };
  }

  update(dt) {
    this.t += dt;
    const app = this.app;
    // Re-apply alarms to settlements that woke up mid-event.
    for (const site of app.sites) {
      const pa = site.pendingAlarm;
      if (!pa) continue;
      if (pa.until < this.t) { site.pendingAlarm = null; continue; }
      const sim = app.people.simFor(site);
      if (sim && (!sim.alarm || sim.alarm.until < app.people.time)) sim.alarm = { kind: pa.kind, x: pa.x, y: pa.y, until: app.people.time + (pa.until - this.t) };
    }
    // Dragons over settlements
    for (const d of app.dragons.list) {
      for (const site of app.sites) {
        const dist = site.centerWorld.distanceTo(d.pos);
        if (dist < 7 + site.s.radius) {
          const key = d.def.id + site.s.id;
          const cd = this.dragonCooldown.get(key) || 0;
          if (this.t > cd) {
            this.dragonCooldown.set(key, this.t + 240);
            const local = toLocal(site, d.pos);
            this.alarm(site, 'dragon', local.x, local.y, 25);
            const verbs = ['swept low over', 'circled above', 'passed over', 'cast its shadow across', 'roared above'];
            this.post({ icon: 'dragon', text: `${d.name} ${verbs[Math.floor(this.rnd() * verbs.length)]} ${site.s.name}.`, site: site.s.id, pos: d.pos.clone(), follow: 'dragon:' + d.def.id });
          }
        }
      }
    }
    // Scheduled happenings
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = 22 + this.rnd() * 28;
      this.spawnEvent();
    }
    // Rumors
    for (let i = this.pendingRumors.length - 1; i >= 0; i--) {
      const r = this.pendingRumors[i];
      if (this.t < r.at) continue;
      this.pendingRumors.splice(i, 1);
      const other = this.pickSite(s => s.s.id !== r.about.site && s.s.culture !== 'ruin' && s.s.kind !== 'barrow');
      if (!other) continue;
      const tell = RUMOR_TELLS[Math.floor(this.rnd() * RUMOR_TELLS.length)](other.s.name);
      this.post({ icon: 'rumor', rumor: true, text: `Rumor: ${r.about.text.replace(/\.$/, '')}. ${tell}`, site: other.s.id, pos: this.siteCenter(other), rumorOf: r.about.id });
      const sim = app.people.simFor(other);
      if (sim) sim.rumorUntil = app.people.time + 40;
    }
    this.nextRumor -= dt;
    if (this.nextRumor <= 0) {
      this.nextRumor = 70 + this.rnd() * 80;
      const [icon, text, ref] = IDLE_RUMORS[Math.floor(this.rnd() * IDLE_RUMORS.length)];
      this.post({ icon, rumor: true, text: 'Rumor: ' + text, pos: this.refPos(ref), follow: ref === 'aurum' ? 'dragon:aurum' : ref === 'tortoise' ? 'tortoise' : null });
    }
    // Ongoing fires
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.left -= dt;
      if (f.left <= 0) { this.fires.splice(i, 1); continue; }
      const k = Math.min(1, f.left / 20);
      if (this.rnd() < 0.8) app.fx.emit('fire', f.pos, f.up.clone().multiplyScalar(0.12), 2, 0.05, 0.04 * k + 0.01, 0.9);
      if (this.rnd() < 0.35) app.fx.emit('smoke', f.pos.clone().addScaledVector(f.up, 0.08), f.up.clone().multiplyScalar(0.06), 1, 0.03, 0.06, 5);
    }
  }

  refPos(ref) {
    const app = this.app;
    const s = this.siteById.get(ref);
    if (s) return s.centerWorld.clone();
    const l = app.world.landmarks.find(l => l.id === ref);
    if (l && l.world) return l.world.clone();
    const d = app.dragons.list.find(d => d.def.id === ref);
    if (d) return d.pos.clone();
    if (ref === 'tortoise') { const g = app.wildlife.groups.find(g => g.key === 'tortoise'); if (g) return g.center.clone(); }
    return null;
  }

  spawnEvent() {
    const app = this.app;
    const r = this.rnd();
    const humanTown = (s) => s.s.culture === 'human' && ['capital', 'city', 'town', 'port', 'village', 'hamlet'].includes(s.s.kind);
    if (r < 0.2) {
      const site = this.pickSiteNear(humanTown);
      if (!site) return;
      const houses = site.records.filter(rc => rc.model.startsWith('house') || rc.model.startsWith('cottage'));
      if (!houses.length) return;
      const rec = houses[Math.floor(this.rnd() * houses.length)];
      const pos = new THREE.Vector3().setFromMatrixPosition(rec.matrix);
      const up = pos.clone().normalize();
      const top = pos.clone().addScaledVector(up, 0.22);
      this.fires.push({ pos: top, up, left: 70 });
      const local = toLocal(site, pos);
      this.alarm(site, 'fire', local.x, local.y, 70);
      const what = rec.model.startsWith('cottage') ? 'a thatched cottage' : 'a house';
      this.post({ icon: 'flame', text: `Fire in ${site.s.name}! Neighbours are passing buckets from the well to ${what}.`, site: site.s.id, pos: top });
    } else if (r < 0.38) {
      const site = this.pickSiteNear(s => humanTown(s) || s.s.culture === 'fae' || s.s.culture === 'beast' || s.s.culture === 'elf');
      if (!site) return;
      const p = site.plaza;
      this.alarm(site, 'festival', p[0], p[1], 110);
      const kinds = {
        human: [`A harvest festival fills the square in ${site.s.name}.`, `Bells ring in ${site.s.name} for a wedding.`, `A travelling troupe draws a crowd in ${site.s.name}.`],
        fae: [`The faeborne of ${site.s.name} dance until the lanterns gutter.`],
        beast: [`Drums at ${site.s.name}: the clans celebrate a great hunt.`],
        elf: [`The elves of ${site.s.name} sing the old star-songs.`],
      }[site.s.culture] || [`A celebration in ${site.s.name}.`];
      this.post({ icon: 'music', text: kinds[Math.floor(this.rnd() * kinds.length)], site: site.s.id, pos: site.plazaWorld.clone() });
    } else if (r < 0.52) {
      const site = this.pickSiteNear(s => humanTown(s) && s.s.kind !== 'hamlet');
      if (!site) return;
      const p = site.plaza;
      this.alarm(site, 'thief', p[0], p[1], 35);
      this.post({ icon: 'coin', text: `A cutpurse is loose in the ${site.s.name} market. The watch gives chase.`, site: site.s.id, pos: site.plazaWorld.clone() });
    } else if (r < 0.64) {
      const site = this.pickSiteNear(s => ['village', 'hamlet', 'town', 'camp', 'castle', 'fort'].includes(s.s.kind));
      if (!site) return;
      const a = this.rnd() * Math.PI * 2, rr = site.s.radius * 1.05;
      this.alarm(site, 'monster', Math.sin(a) * rr, Math.cos(a) * rr, 45);
      const foes = site.s.realm === 'frostreach' ? 'A yeti' : site.s.realm === 'thornsteppe' ? 'Raptors' : site.s.culture === 'dwarf' ? 'A hill troll' : 'Wolves';
      const key = site.s.realm === 'frostreach' ? 'yeti' : site.s.realm === 'thornsteppe' ? 'raptor' : site.s.culture === 'dwarf' ? 'troll' : 'wolf';
      const p = site.dir(Math.sin(a) * rr * 1.15, Math.cos(a) * rr * 1.15);
      app.wildlife.spawnRaid(key, p, 45 * 4, app.simTime ? app.simTime() : 0);
      this.post({ icon: 'sword', text: `${foes} at the edge of ${site.s.name}! The guards turn out with spears.`, site: site.s.id, pos: this.siteCenter(site) });
    } else if (r < 0.74) {
      const site = this.pickSite(s => ['fae', 'elf'].includes(s.s.culture) || s.s.kind === 'circle');
      if (!site) return;
      const c = this.siteCenter(site);
      const up = c.clone().normalize();
      for (let i = 0; i < 40; i++) app.fx.emit('magic', c.clone().addScaledVector(up, 0.1), up.clone().multiplyScalar(0.3), 1, 0.4, 0.03, 4, site.s.culture === 'fae' ? [2.2, 0.8, 2.0] : [0.4, 1.8, 2.4]);
      this.alarm(site, 'festival', site.plaza[0], site.plaza[1], 60);
      this.post({ icon: 'rune', text: site.s.culture === 'fae' ? `The ${site.s.name} hums; the faeborne answer with a dance.` : `Runes flare along the spires of ${site.s.name}.`, site: site.s.id, pos: c });
    } else if (r < 0.8) {
      const site = this.pickSite(s => s.s.culture === 'undead');
      if (!site) return;
      const c = this.siteCenter(site), up = c.clone().normalize();
      for (let i = 0; i < 30; i++) app.fx.emit('magic', c.clone().addScaledVector(up, 0.05), up.clone().multiplyScalar(0.2), 1, 0.6, 0.03, 5, [0.4, 2.2, 1.0]);
      this.post({ icon: 'skull', text: `Green lights rise from ${site.s.name}. The dead are restless tonight.`, site: site.s.id, pos: c });
    } else if (r < 0.86) {
      const c = this.refPos('ashbrazier') || new THREE.Vector3();
      this.post({ icon: 'flame', text: 'Mount Cindermaw rumbles. Ash falls on Ashfall like black snow.', site: 'ashfall', pos: c });
    } else if (r < 0.92) {
      const site = this.pickSite(s => s.s.kind === 'capital');
      if (site) this.post({ icon: 'crown', text: 'Masons in Highmoor raised another course of the new tower.', site: site.s.id, pos: this.siteCenter(site) });
    } else {
      const lane = app.traffic.groups.filter(g => g.kind === 'sea' && g.type === 'cog');
      if (lane.length) {
        const g = lane[Math.floor(this.rnd() * lane.length)];
        const from = ['Tuskport', 'Cinderhold', 'Saltmere', 'Stormwatch'][Math.floor(this.rnd() * 4)];
        const cargo = ['spice and hides', 'dwarven silver', 'dragon-glass', 'salt fish', 'elven wine', 'wool and tin'][Math.floor(this.rnd() * 6)];
        this.post({ icon: 'wave', text: `A cog out of ${from} is under sail with ${cargo}.`, pos: g.pos ? g.pos.clone() : null, follow: 'ship:' + app.traffic.groups.indexOf(g) });
      }
    }
  }
}

export function toLocal(site, p) {
  const q = p.clone().normalize();
  const dx = q.x - site.d[0], dy = q.y - site.d[1], dz = q.z - site.d[2];
  return { x: (dx * site.e[0] + dy * site.e[1] + dz * site.e[2]) * R, y: (dx * site.n[0] + dy * site.n[1] + dz * site.n[2]) * R };
}
