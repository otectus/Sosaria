// Shared instanced crowds for everything with a rig. Systems push instances each frame.

import { Crowd, RIG } from '../render/rig.js';
import { buildHumanoid, buildQuadruped, buildSpider, buildFlyer, buildSerpent, buildTreant } from '../models/characters.js';
import { buildVehicle } from '../models/vehicles.js';

export class Crowds {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    for (const race of ['human', 'elf', 'dwarf', 'fae', 'beast', 'undead', 'draconic']) this.add(race, buildHumanoid(race), RIG.biped, 64);
    for (const q of ['horse', 'deer', 'sheep', 'cow', 'wolf', 'boar', 'makka', 'bear', 'mammoth', 'unicorn', 'tortoise', 'goat']) this.add(q, buildQuadruped(q), RIG.quad, 16);
    this.add('spider', buildSpider(1), RIG.spider, 16);
    this.add('bird', buildFlyer('bird'), RIG.flyer, 64, false);
    this.add('wyvern', buildFlyer('wyvern'), RIG.flyer, 8);
    this.add('griffin', buildFlyer('griffin'), RIG.flyer, 8);
    this.add('serpent', buildSerpent(), RIG.serpent, 4);
    this.add('treant', buildTreant(), RIG.biped, 8);
    for (const v of ['wagon', 'cart', 'orecart', 'cog', 'warship', 'ghostship', 'pirate', 'fishboat', 'rowboat', 'canoe', 'swanboat', 'raft']) this.add(v, buildVehicle(v), RIG.vehicle, 8);
  }
  add(name, geo, rig, cap, shadow = true) { this.map.set(name, new Crowd(this.scene, geo, rig, 'c-' + name, cap, { castShadow: shadow })); }
  get(name) { return this.map.get(name); }
  begin() { for (const c of this.map.values()) c.begin(); }
  end() { for (const c of this.map.values()) c.end(); }
  get total() { let n = 0; for (const c of this.map.values()) n += c.count; return n; }
}
