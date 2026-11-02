# Sosaria: a living world worth returning to

**Research and implementation blueprint · 27 September 2026**  
**Repository:** [otectus/Sosaria](https://github.com/otectus/Sosaria)  
**Reviewed revision:** [`3e75e4dc3cd6a77331f556810c770a42e15a3f89`](https://github.com/otectus/Sosaria/commit/3e75e4dc3cd6a77331f556810c770a42e15a3f89) (`main` at review time)

> **North star:** A traveller can leave Highmoor, spend a week with the dwarves, and return to find that a shortage they heard about has altered the market, the people, and the streets. Every account has a discoverable cause. A small intervention can change the outcome, and the world remembers it.

This is a research-led design and coding brief, **not a claim that these features already exist**. The repository was inspected at the pinned revision. There was no README or issue backlog at that revision; observations below come from code inspection, not a browser playtest or performance profile. Values labelled **initial tuning target** are hypotheses for implementation, not measured benchmarks.

## 1. What Sosaria has today

Sosaria is a browser-based Three.js fantasy globe with a great deal of authored identity. The [atlas](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/atlas.js) declares **36 settlements, 25 landmarks, 29 road links, eight sea lanes, nine rivers, seven lakes and five dragons**. Its cultures include humans, elves, dwarves, fae, beastfolk, dragonkin and the undead. The [world builder](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/build.js) lays roads over a cube-sphere grid; [settlement layouts](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/settlements.js) provide streets, doors, work spots, architecture and farms. Terrain is generated in [workers](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/terrain/pool.js), and the [rendering stack](https://github.com/otectus/Sosaria/tree/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render) already has quality scaling, skies, water, clouds, particles and instanced actors.

| Existing strength | Evidence | Opportunity |
| --- | --- | --- |
| Local townsfolk have roles, homes, work locations, schedules and alarm reactions. | [`life/people.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/people.js#L125-L405) | Make their identities, households, needs and outcomes persist when the camera leaves. |
| Wagons, travellers, river boats and ships follow authored routes. | [`life/traffic.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/traffic.js#L82-L175) | Give selected journeys actual origins, destinations, passengers, cargo and consequences. |
| Fires, raids, festivals, thefts, rituals and dragon sightings create Chronicle entries and local alarms. | [`life/events.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/events.js#L93-L249) | Derive incidents from conditions; let responses change state; retain aftereffects. |
| The Atlas, Chronicle, hover cards, follow camera and 1×/4×/16×/64× controls make a strong observer interface. | [`ui/hud.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/ui/hud.js#L38-L135) | Add place histories, causal links, a timeline and light-touch choices. |
| Seasons are visually suggestive: a globe-wide sun, two moons, storms and local time. | [`render/sky.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/sky.js#L9-L42), [`render/clouds.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/clouds.js) | Make seasonal and weather conditions affect travel, food and daily life. |

### Structural gaps that change the order of work

1. **Places wake up as new simulations.** [`People.update`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/people.js#L449-L469) retains at most three nearby `SiteSim`s; deleting an active site and later constructing another recreates agents from its seed. [`AGENT_ID`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/people.js#L123-L137) increments globally, so recreated characters receive different IDs. Their daily appearance is convincing, but their lived history is not persistent.
2. **Different systems experience different time.** [`main.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/main.js#L150-L194) advances the solar clock at the selected speed, caps `people`/`events`/`dragons` to 4×, and samples traffic from `clock.day * dayLength * 0.25`. At 16× and 64× the town, ships and sun cannot describe the same elapsed world time. Resolve this before adding harvests or production chains.
3. **Many events describe change without recording it.** The fire expires without durable damage, the thief chase has no recorded theft or verdict, the reported tower progress does not alter construction, and merchant cargo is composed for a headline rather than taken from a manifest. See [`events.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/events.js#L174-L249). The authored rumours remain valuable flavour, provided they are presented as legends, hearsay or false claims rather than system-verified events.
4. **Rumours teleport.** [`Events.update`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/events.js#L133-L150) selects any unrelated settlement after a short delay. The core truth, who knew it, and how the news travelled are not tracked. [`post`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/events.js#L60-L71) also uses `log.length + 1` as an ID, which repeats once the 60-entry buffer fills.
5. **No world-state save path is apparent.** [`main.js`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/main.js#L106-L121) uses `localStorage` for graphic quality, while authored atlas and generated geometry are rebuilt at startup. Preserve mutable world state separately from reproducible terrain.
6. **The current tests protect rendering, not simulation.** The six tests in [`tests/render.test.mjs`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/tests/render.test.mjs) cover quality, geometry, crowds, effects, postprocessing and shadows. New simulation work needs a small set of deterministic scenario and invariant tests.

## 2. What comparable projects teach us

These are **design analogies**, not claims that Sosaria should duplicate another game's scope or mechanics. Sources are developer sites, developer-authored materials, official project documentation and publisher-hosted game pages. The recommendation in the last column is my inference.

| Project and primary reference | Useful demonstrated idea | Specific Sosaria transfer |
| --- | --- | --- |
| [Dwarf Fortress — features](https://www.bay12games.com/dwarves/features.html) and [developer discussion of abstract populations](https://bay12games.com/media/df_talk_9_transcript_2.html) | Persistent world histories, places and historical figures, with ordinary populations represented more cheaply. | Track a few named lives and consequential events per settlement; use cohorts for the rest. Make the Chronicle navigable by person, place and cause. |
| [Veloren — real-time simulation architecture](https://docs.veloren.net/veloren_rtsim/index.html), [persistent travellers](https://veloren.net/blog/devblog-111/) and [report model](https://docs.veloren.net/src/veloren_rtsim/data/report.rs.html) | A light world model continues off-screen, then local entities represent it at higher fidelity; information is an explicit object passed between actors and sites. | A persistent strategic layer beneath Sosaria's excellent local render and actor system; carry reports on actual travellers. The architecture is particularly relevant because Veloren also models a large fantasy world. |
| [RimWorld — official overview](https://rimworldgame.com/) | An incident director paces threats, respite and opportunity around colonists with needs, wounds and relationships. | Use a restrained **story pacing layer** to select among eligible, causal events. It may make a storm more likely, but a village must actually have fuel, rain and people before a fire or famine becomes news. |
| [Foundation — official wiki](https://wiki.polymorph.games/foundation/Foundation), [needs](https://wiki.polymorph.games/foundation/Needs) | Organic medieval layout, building access and routines motivated by water, market, shelter, faith and entertainment. | Exploit Sosaria's existing doors, street graph and work anchors so daily routes reveal what each place provides or lacks. |
| [Manor Lords — official overview](https://wiki.hoodedhorse.com/Manor_Lords/Manor_Lords) | Seasons, terrain and roads affect settlement form; farming, processing, transport and environmental pressure connect. | Make Millbrook's harvest, Brightwater's mill and Saltmere's harbour parts of one observable material chain. Limit ecological effects to explicit, legible changes. |
| [Clanfolk — official overview](https://wiki.hoodedhorse.com/Clanfolk/Clanfolk) | Family skills pass between generations; weather changes food, warmth, work and animal care. | Introduce households and apprenticeships sparingly; every season needs a few visible behaviours and practical consequences. |
| [Norland — official description](https://wiki.hoodedhorse.com/Norland/Norland) and [Crusader Kings III — official features](https://www.paradoxinteractive.com/games/crusader-kings-iii/about) | Needs, class tension, character ambitions, succession and faction relationships generate politics through people. | Give realms a small cast of agents with concrete goals. Support trade disputes, local succession or sanctuary before continent-spanning dynastic mechanics. |
| [Kenshi — developer world states](https://lofigames.com/blog-25-kenshi-at-tokyo-game-show/) | Removing a leader or supply point can change patrols, town control and nearby settlements. | Let a lost watchtower, blocked pass or recovered mine change actual routes, security and town appearance. Use thresholds with recovery paths. |
| [WorldBox — developer changelog](https://www.superworldbox.com/changelog) | Long-lived units, cultures, towns and clans have inspectable historical records and links. | A simple place history and past-name ledger makes the globe understandable at every zoom level; a restrained intervention palette gives agency to observers. |
| [Shadows of Doubt — developer simulation notes](https://colepowered.com/shadows-of-doubt-devblog-8-simulating-a-city/) and [gameplay loop](https://colepowered.com/shadows-of-doubt-devblog-10-gameplay-loop/) | Citizens have preplanned routines but deviate under pressure; sightings and memories turn activity into discoverable evidence. | Preplan ordinary local trips, recompute only exceptions, and let a player investigate an event through witnesses, manifests and physical traces. Add failsafes so a meaningful incident is discoverable. |

**Synthesis:** Veloren gives the most relevant technical shape; Dwarf Fortress gives history; Foundation and Manor Lords give believable medieval causality; Shadows of Doubt gives readable evidence; RimWorld gives pacing; Norland and Kenshi give consequences at political scale. Sosaria can combine these without turning its quiet observational experience into a compulsory colony manager.

## 3. The proposed experience

### Design rules

1. **One cause, several views.** A grain shortage changes stock, queue length, food prices, traveller behaviour, guard duty, dialogue and the Chronicle. Each view reads the same committed world fact.
2. **People belong somewhere.** A named smith has a persistent identity, household, forge, contacts and a recent history. Most background villagers need only a settlement cohort and a local visual representation.
3. **The world acts outside the frame.** Off-screen places advance cheaply. Zooming in reveals consistent consequences, rather than spawning a fresh narrative.
4. **Distance delays knowledge.** The global simulation knows what happened; citizens and the player know what they saw, inferred, or learned by letter, bell or caravan. Give rumours a source and confidence.
5. **Change has a visible residue.** Burn marks, empty stalls, repaired roofs, busy granaries, a new memorial and altered patrol routes make history observable without reading a log.
6. **Maintain a gentle observer mode.** Watch, follow, inspect and time travel through the record. Optional actions should be limited, intelligible nudges—warn a guard, carry news, fund repairs, commission supplies—each with costs and uncertain outcomes.
7. **Authored fantasy stays distinctive.** The Moonwell, the Runeblade, the Drifting Spire, Duskmere and the dragons should have location-specific rules. Supernatural events have a consistent lore logic even when their effects are mysterious to inhabitants.

### A single emergent story as a design test

1. A late storm wets Millbrook's wheat; harvest output drops. Farmers shelter, wet sheaves appear, and the harvest board records the yield.
2. A merchant at Brightwater sees the shortfall and buys an import contract. A named wagon loads grain for Highmoor, with an actual manifest and arrival time.
3. A damaged bridge diverts the wagon by King's Rest. Its route and ETA change. An innkeeper hears the driver's account; a rumour reaches Highmoor a day before the grain.
4. The capital's granary falls below reserve. Bakers make less bread; the market line grows; a councillor approves emergency purchases or a festival is postponed. A family substitutes fish for bread.
5. The player can follow the caravan, inform the watch of raiders, or leave events alone. Each action is recorded. Successful delivery eases the shortage; a lost wagon causes a different recovery path.
6. When the player returns next week, the market prices, personal memories, bridge repairs and Chronicle agree on what happened.

The named roads in this example exist in the current atlas: Millbrook–Brightwater, Brightwater–Highmoor, Highmoor–King's Rest and Highmoor–Saltmere. The material causes and outcomes are **proposals**, not current gameplay.

## 4. Build the simulation beneath the scene

### 4.1 Three fidelity levels, one authoritative state

| Layer | All 36 places | Near camera | Data ownership |
| --- | --- | --- | --- |
| **World** | Climate, settlement stocks, production, routes, faction relations, incidents, named agents and records on scheduled ticks. | Same authoritative state. | `WorldState`; works without DOM or WebGL. |
| **Local** | No per-frame citizen movement. Keep scheduled jobs, location and trip milestones as compact data. | Materialize named agents and a visual sample of cohort members on the existing `Site` graph; simulate pathing, interactions and reactions. | `LocalSceneAdapter` derives instances from `WorldState`; persist only meaningful changes. |
| **Presentation** | Globe labels, coarse traffic paths, Chronicle indicators. | Instanced people, carts, props, fire, smoke, crops and conversations. | Three.js objects, ephemeral animations and UI. Never the source of truth. |

This is an adaptation of [Veloren's documented high-level/off-screen model](https://docs.veloren.net/veloren_rtsim/index.html). Keep Sosaria's [`Crowd`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/rig.js), [`Structures`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/structures.js) and [`Terrain`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/terrain/terrain.js) as render assets. Avoid wholesale scene or terrain reconstruction on each change. Use a sparse per-site overlay for changed building state, local props, crop state and travel closures. Persist the overlay and update its visible instances when necessary.

**Suggested new modules** (names are guidance, not a demand to rewrite everything):

```text
src/sim/state.js        IDs, versioned world state, settlement and agent records
src/sim/time.js         canonical time, calendar and scheduled work
src/sim/step.js         deterministic transitions and event queue
src/sim/rng.js          seeded streams or keyed random decisions
src/sim/incidents.js    eligibility, outcomes and pacing
src/sim/economy.js      inventories, production, consumption and shipment ledger
src/sim/travel.js       route graph, trip records and arrival resolution
src/sim/knowledge.js    witnessed facts, carriers, rumours and discovery
src/sim/storage.js      snapshot, migration, export/import
src/life/local-scene.js  materialize/hydrate near agents and route actors
src/world/overlays.js   visible changes to static terrain and structures
```

Start with plain JavaScript and JSDoc data shapes to match the repo's no-build ES-module setup. Introduce a compiler only if its benefits later justify changing the toolchain. Have `src/main.js` create the sim after `buildWorld` and `layoutSettlements`; make existing `People`, `Traffic`, `Wildlife`, `Events`, `Dragons` and `HUD` read or submit commands through the sim. Move incrementally, maintaining the current globe while replacing one fake incident at a time.

### 4.2 Time, determinism and persistence are prerequisites

**Canonical clock:** represent time as integer simulation ticks, with explicit `worldSeconds`, `dayLength` and calendar rules. Use the current 420-second day as a starting compatibility value. Longitude changes the local hour, **not** the order of world events. Choose a tunable four-season year (for instance 48 days, 12 per season as an initial tuning target) and reconcile the existing 11-day solar declination cycle deliberately; keep separate astronomical cycles if the lore calls for it.

**Step contract:** a 1-world-second base tick is a reasonable first prototype. Run expensive settlement and route rules only every 10–60 world seconds or on queued changes; run crop and cohort updates on day boundaries. Local navigation can use a nearer cadence where needed. Accumulate elapsed real time × requested speed; process an exact number of world ticks; render between previous and current local states. At high speed, bound work per frame by **slowing displayed simulation time with a visible indicator**, rather than silently dropping unsimulated days or advancing the sky alone. Fast travel across days may use equivalent batched transitions and event deadlines. Hidden tabs explicitly pause unless the user opts into a defined catch-up policy. This follows the reasoning in Glenn Fiedler's [fixed-timestep explanation](https://www.gafferongames.com/post/fix_your_timestep/).

**Deterministic decisions:** derive random choices from `(worldSeed, subsystem, stableEntityId, tick, decisionIndex)` or persisted per-system RNG streams. Replace the isolated `Math.random()` in [`SiteSim.update`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/people.js#L316-L325) for simulation-significant behaviour. Camera movement, rendering rate and instancing order must not change the strategic outcome. Stable IDs should be assigned by immutable site key and serial or by persisted monotonic counters; save IDs as data. Do not reuse `log.length + 1` for events.

**Saves:** serialize only dynamic state: clock/tick, seed, agents, settlements, stocks, trip manifests, route conditions, event and knowledge records, landmark state, and intervention log. Keep generated terrain and authored atlas definitions rebuildable. Use a versioned schema, migrations, periodic snapshots and manual export/import; [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) is suitable for structured browser state. Save and resume while a caravan is travelling or a fire is burning, without duplicate delivery or duplicated Chronicle facts. Retain a small bounded event log plus summarized history; never leave unbounded per-frame records.

**Required invariant:** after advancing to the same simulation tick from the same seed and command list, outcomes agree across 30/60 FPS, 1×/4×/16×/64×, zoom levels, unload/reload and save/load (allow tiny renderer-position interpolation differences). This is a deterministic simulation target, not a claim about identical GPU images.

### 4.3 Facts, incidents and reports

Use an event record as a *result of* a state transition, with stable causal references. Do not let a UI headline directly mutate the world. A compact starting shape:

```js
{
  id: 'event:1842', tick: 43120, type: 'shipment_delayed',
  where: 'kingsinn', actors: ['caravan:27'],
  causeIds: ['event:1831', 'event:1835'],
  changes: [{ entity: 'trip:27', field: 'etaTick', from: 43400, to: 43950 }],
  evidence: [{ kind: 'manifest', ref: 'manifest:27' }],
  severity: 0.45, tags: ['trade', 'road'], visibility: 'discoverable'
}
```

The authoritative **fact** is separate from a **report** (`factId`, teller, recipient, route, sent/received tick, confidence, distortion). A culture can interpret the same sighting differently: Highmoor calls a dragon an alarm; Cinderhold calls it a pilgrimage omen. Historical or mythic seed rumours may have `truthStatus: legend` and do not require a matching simulation fact. The player's Chronicle offers tabs for *witnessed*, *reported* and *legend*, with a source trail and a jump to map/person. A source that proves false stays in the record with a correction. Veloren's [report type](https://docs.veloren.net/src/veloren_rtsim/data/report.rs.html) is a small, relevant precedent.

Incident director: periodically evaluate **eligible** situations (dry thatched roof + high wind; depleted granary; visiting troupe; close dragon; unsafe pass), rank by causal strength, novelty, danger and the time since comparable incidents, then initiate at most one major local incident per cooldown window. Maintain opportunity and respite as well as danger. A serious event needs an outcome, a trace and a recovery path. This borrows pacing from [RimWorld](https://rimworldgame.com/) without turning Sosaria's history into arbitrary card draws.

### 4.4 Three kinds of person

1. **Named persistent cast:** roughly 3–12 per important site to begin (initial tuning target): rulers, guards, traders, craftspeople, innkeepers, witnesses and recurring travellers. Stable ID, role, home, workplace, important relationships, traits, health, goals, inventory when relevant and a small capped memory list. A death, transfer or succession persists.
2. **Household/cohort records:** the rest of a town as counts by occupation and age band, with food/housing/safety needs. Individualize a cohort member when a meaningful event promotes them into the named cast. No need to store every anonymous idle animation forever.
3. **Local visual figures:** current [`People`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/people.js) instances, linked to a named ID where applicable or seeded as a consistent rendering sample of a cohort. Unloading removes meshes and fine path state, not the owner record.

Goal selection should respect need, duty, relationship, danger and reachability. Examples: a baker buys grain only if stock and funds exist; a guard chooses a patrol based on reports and routes; a fisher seeks a usable dock and daylight. Precompute ordinary daily itineraries, recalculate a deviation when an alarm, closure or shortage occurs, as illustrated by [Shadows of Doubt's developer](https://colepowered.com/shadows-of-doubt-devblog-8-simulating-a-city/). Cache each site's `Nav` graph rather than rebuilding its O(N²) junction search on every activation; replace repeated `queue.shift()` breadth-first processing with an indexed queue. Verify disconnected destinations: [`Nav.path`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/people.js#L100-L120) currently appends the destination even when it found no graph route.

## 5. World systems, ordered by causal payoff

### A. The living settlement (first vertical slice)

**State:** population cohort, named residents, households/homes, professions, water/food/firewood reserves, prosperity, safety, morale, workplace condition and building condition. Record a building's stable instance ID at layout time (`siteId` + deterministic placement index) to permit durable damage and repair. The existing [`Site.place`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/settlements.js#L77-L100) and model anchors are natural entry points.

**Rules:** daily consumption and production; household visits to a well, market, shrine and tavern only when open and supplied; assignment based on walking distance; closed/damaged workplaces change schedules. Resource deficits increase priority for resupply, substitution or migration, with bounded effects and minimum recovery floors. A fire reduces building condition, displaces a household, consumes water and creates a repair job; bucket carriers lower fire intensity. A thief steals a real item, flees, and may escape, be caught or repay it. An incident is complete only when its result is in state.

**Visual proof:** doors open or close, a ruined cottage gains scaffolding then a repaired roof, market baskets vary with stock, people form short purposeful queues, and a following camera can identify the same resident on later visits. Conditions should influence [`NightLights`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/nightlights.js) (occupied building, tavern hours, outages) and anchored [`Particles`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/particles.js) (smoke/forge use), not just spawn decorative effects.

**First slice:** Highmoor + Brightwater + Millbrook. Give a baker, miller, farmer, guard, merchant and innkeeper stable identities, a visible short chain and a single recoverable fire/shortage. Expand to other cultures after this scenario holds together under save/load and fast-forward.

### B. Real journeys and a restrained economy

**Minimum goods:** grain, flour, bread, fish, timber, iron, tools and coin or abstract credit. Only add more when a new good creates a distinguishable decision. A production recipe has inputs, outputs, job capacity, time, site suitability and losses. Set explicit stock bounds and minimum reserves; never subtract below zero. Choose a shipment from surplus and shortage, reserve its cargo at departure, add it at arrival exactly once, and resolve loss/recovery after a raid. `Trip { id, routeEdges, segment, progress, from, to, cargo, escorts, status, eta }` is the source for both movement and the Chronicle. Keep purely ambient traffic for richness, but visibly distinguish it from tracked shipments in inspection UI.

Use road/river/sea edges already declared by the atlas, with travel cost, seasonal passability, bridge condition and danger. Cache computed itineraries; invalidate affected edges only. At sea, storm risk affects departure and arrival; a ship caught by the Maw Reef can be a recoverable wreck with a ledger entry rather than a vanished sprite. When seen locally, hydrate the strategic trip into a caravan/ship on [`Track`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/traffic.js#L15-L43). On camera exit, write position/progress once and continue analytically. A visual actor must not reverse direction as a meaningless ping-pong if its manifest says it has arrived.

**Initial trade test:** Millbrook harvests grain → Brightwater grinds flour → a wagon delivers it to Highmoor → consumption and bread availability change; an interrupted trip changes stock, price and one NPC plan. [Manor Lords' documented production chains and regional resources](https://wiki.hoodedhorse.com/Manor_Lords/Manor_Lords) motivate the causal structure; Sosaria needs only a compact version.

### C. Seasons, ecology and weather as state

Move weather information into a coarse spatial/time grid (`cellId`, `tick`, temperature, precipitation, wind, drought); render [`Clouds`](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/clouds.js), rain and storm effects as a projection of it. Coarse climate follows latitude, elevation, nearby water and regional character; storms advect between neighboring cells. Seed clearly fantasy exceptions such as Ashfall and Gloamfen. A freeze can shut a mountain pass; heavy rain delays grain drying; drought changes fields; a favourable spring raises animal breeding, with visible lead and recovery time. Beware equating a visual storm near the camera with rain at a distant site.

Sample 4–8 agricultural/ecological cells near a settlement rather than modifying every terrain vertex. Give wheat a sow/grow/harvest/rest cycle, river fish a replenishing stock, forests a bounded timber reserve, wildlife a small habitat capacity and migration tendency. The visual layer shows crop phase, tree clearing or regrowth and migrating herds at appropriate scales. Preserve the iconic authored landscapes. [Clanfolk's seasonal consequences](https://wiki.hoodedhorse.com/Clanfolk/Clanfolk) and [Manor Lords' terrain/ecology relationships](https://wiki.hoodedhorse.com/Manor_Lords/Manor_Lords) are useful scope references.

**Guardrails:** protect baseline food access in early tuning, cap wildfire area and multi-settlement famine chains, add player-selectable calm/harshness presets, and provide in-world explanations: “Three days of rain delayed the harvest” rather than opaque percentages.

### D. Relationships, knowledge and local politics

Named people can maintain a limited list of relations (family, guild, mentor, rival, debtor, patron), two or three salient traits, and memories with decay and salience. Avoid all-to-all relationship matrices. A smith whose apprentice helped in a fire shares a durable bond; a trader whose caravan was robbed remembers the route; the same guard becomes a familiar face. Make family formation, ageing and succession a later extension after day-to-day identity is reliable. [Norland](https://wiki.hoodedhorse.com/Norland/Norland) and [Crusader Kings III](https://www.paradoxinteractive.com/games/crusader-kings-iii/about) show why character goals matter at political scale; their full dynastic scope is not necessary here.

Realms start with a few goals and constraints: Valdren secures food and roads, Ironpeak exports metal, the elves defend sacred land, Cinderhold seeks volcanic relics, pirate Blackfin wants prizes. Relations update on shipments, border incidents, rescue, ritual violations or dragon damage; they decay slowly toward a baseline. A ruler's death creates a named successor or a contained vacancy process. A blocked pass reduces trade and patrols; an abandoned watchtower can become a bandit camp, as in [Kenshi's documented world-state cascades](https://lofigames.com/blog-25-kenshi-at-tokyo-game-show/). Keep the first political outcomes local and reversible.

**Information rules:** witnessing requires proximity/sight or attendance, bells alert the settlement, reports travel via linked routes, a court envoy carries official news, and a rumour can change through retelling. The player can inspect what is known versus what is proven. A fabricated claim can spur action only because **someone believes it**, never because it silently becomes true.

### E. Fantasy that obeys its own rules

Give each exceptional site a concise **world rule, trigger, state change, witness trace and limit**. This is a design canvas, not a canonical rewrite of existing lore:

| Place or agent | Distinctive rule | Observable consequence |
| --- | --- | --- |
| **The Moonwell** | Some nights reveal a possible near-future event, with confidence tied to moon phase. | An elf envoy follows or disputes the vision; players can inspect whether it came true. |
| **The Drifting Spire** | Its position changes only on a defined lunar/ley cycle. | New shadows, disrupted paths, notes from monks and a dated Atlas trace. |
| **The Runeblade of Aurelion** | Nearby ley activity raises danger and scholarly interest. | Pilgrims, wards and competing claimants travel there for a reason. |
| **Duskmere** | Its undead keep peculiar schedules and obligations; ordinary food needs do not map directly. | Rituals, boat traffic and town lights follow its own culture logic. |
| **Aurum or another dragon** | Territory, hunger/curiosity, sleep, threat and relationship to a realm influence flights. | Villages prepare, traders reroute, a lair changes with events; not every flyover is an attack. |

Specify cooldowns, conservation rules and opt-in intensity for rare world-changing magic. A dragon cannot burn a city “in the story” while its buildings and citizens remain untouched. Stories can be uncertain; outcomes cannot be contradictory.

## 6. Let the player read and touch the world

**Atlas 2.0:** layers for trade, weather, safety, known events and remembered borders; each site shows population trend, supply, notable residents, building condition and “changed since your last visit.” Keep the present uncluttered at globe zoom. Give each place a timeline, with a narrow event filter and map jump. The [WorldBox history records](https://www.superworldbox.com/changelog) and [Dwarf Fortress persistence](https://www.bay12games.com/dwarves/features.html) suggest why revisiting old names matters.

**Chronicle 2.0:** entries have status (*happening / resolved / disputed / legend*), source, location, actors, parent causes, consequences and a **follow** action. Show a causal chain when clicked: storm → low yield → shortage → incoming wagon. Use live truth for debugging and discovery-gated truth in normal play; avoid spoiling hidden causes. Aggregate minor outcomes into a daily town summary so the 60-entry panel does not drown out a meaningful event. A time slider can replay snapshots of the map and Chronicle before attempting full reverse simulation.

**Observation tools:** follow a named citizen across work, home and travel; select a caravan to see route, cargo, ETA and last known report; open a “what changed?” view after time acceleration. Add a quiet “story watch” suggestion that highlights an eligible unfolding situation **without teleporting events to the camera**. Weather and time controls show the same world clock and upcoming seasonal changes.

**Optional interventions, limited in scope:** speak to a witness, carry or verify a report, warn a town about a credible threat, escort a caravan in observer mode, fund one repair, request a fair or temporarily close a dangerous route. Each action should be a command validated against state with a cost, delay, actor and possible rejection; create a fact and a resulting report. Avoid a full inventory/crafting/combat RPG until observation, continuity and consequences already work. Prioritize readability and reversible choices.

**Street-level texture:** tie small sensory details to real activity. A forge rings when a smith is at work; market voices thin when supplies fail; the bell sounds for a credible fire alarm; a repaired bridge loses its warning marker; wet wagon ruts persist briefly after rain. Use positional, sparse sound cues and optional captions. At close zoom, favour meaningful props—delivery crates with a manifest, a boarded window after a burglary, new flowers on a memorial—over uniform decorative density. At orbit zoom, compress the same state into a legible map change. During 64× time, aggregate transient sound and effects instead of playing every bell or hammer stroke.

**Exploration threads:** give each landmark a discoverable chain with three parts: an observable clue at the site, a person or record elsewhere that adds context, and a later change in the world that confirms, complicates or refutes the account. For example, a dated inscription at Hollowstones, a monk's copy at Hollowmere and a lunar change in the stones are more engaging than another static lore paragraph. Exploration can remain camera based; a nearby landmark, rumour or traveller gives a reason to choose the next destination.

**Accessibility:** descriptive summaries of colour layers, keyboard focus for tabs, reduced motion for camera/fx, and filters for event density. The existing HUD uses labelled buttons and a compass; extend its approach rather than covering the globe with panels.

## 7. A build sequence a coding agent can execute

| Stage | Deliverable and entry points | Definition of done |
| --- | --- | --- |
| **0 · Baseline and metrics** | Document a default seed and three camera tours; measure frame time, sim time, allocations and draw calls. Add a simple debug overlay and one deterministic scenario runner. `main.js`, `tests/`. | Reproduce the current scene and record performance at orbit, town and active event on a specified device. No visual regressions. |
| **1 · One clock, one world** | Add `src/sim/{state,time,step,rng,storage}.js`, stable IDs, snapshots, seed selection and migration v1. Route existing systems through one time source. | Sun, ship, citizen and Chronicle advance consistently at every offered speed; repeatable seed; save/reload while moving. |
| **2 · Living Highmoor slice** | Split persistent agent data from `SiteSim`; cache site Nav; hydrate/dehydrate locals; durable building condition and one fire outcome. Adapt `people.js`, `settlements.js`, `structures.js`, `events.js`. | Follow a named guard, leave, return and find the same person and resolved incident. A burned house has a persistent trace and repair path. |
| **3 · Material route** | Add eight goods, production/consumption, route edges, manifest-backed wagon and interruption/resume. Adapt `traffic.js`, `atlas.js`, `hud.js`. | Millbrook → Brightwater → Highmoor material balance; stock never negative; one delivered or lost wagon, never both; visible demand and supply. |
| **4 · Knowledge and interface** | Truth ledger, witnessed reports, route-limited rumour spreading, Chronicle causes, town histories and action validation. `sim/knowledge.js`, `events.js`, `hud.js`. | A report cannot arrive before its carrier; a false legend stays marked as uncertain; player can explain one shortage without a debug panel. |
| **5 · Climate and diversity** | Coarse weather grid, a seasonal crop, one wildlife response, distinct elf/dwarf/undead needs, one dragon territorial response. `clouds.js`, `field.js`, `wildlife.js`, `dragons.js`. | A change in season changes at least three visible behaviours and one travel/economy outcome, with bounded recovery. |
| **6 · Realm consequences** | Goals, diplomacy, patrols, succession, landmark rules and scenario tuning. | A supply/route/political change affects two settlements and persists, without mass starvation or runaway wars in repeated seed tests. |

**Sequence discipline:** implement a vertical slice through state → rule → scene → UI → test for each feature; keep ambient assets and authored place names intact. Do not build a huge generic simulation engine first. After stage 3, test whether the Millbrook story feels compelling to watch; reduce abstractions that do not help the player perceive cause and consequence.

### Exact starter tickets

1. **Clock reconciliation:** replace `simDt = dt * Math.min(4, speed)` and traffic's `gameSeconds * 0.25` with a canonical `worldTick/worldSeconds`. Add a seed scenario asserting positions, work and event deadlines after one local day at each speed.
2. **Stable town residents:** choose named people at world initialization, persist name/ID/home/work; materialize local `ag` from record. Cache `Nav` per settlement and ensure navigation fails safely if a destination is disconnected. Test leave/revisit/save/reload.
3. **Durable fire:** require dry combustible building and suitable weather, assign event ID and building ID, decrement condition, dispatch bucket carriers, settle extinction/repair, update `Structures` overlay and Chronicle status. Test that a fire cannot resolve twice or damage an unrelated site.
4. **Manifested wagon:** create stock-checked shipment, reserve goods, use one valid atlas path, hydrate the visual cart from trip progress, deliver exactly once, and record route delay/loss. Test conservation: starting stocks + production − consumption − loss = ending stocks + cargo in transit.
5. **Knowledge transport:** create local fire report at origin; hand it to a named traveller on a valid route; show the report at destination after arrival, with lineage to the original fact. Test distant settlements remain unaware before receipt.

### Meaningful automated tests and playable checks

| Category | Test |
| --- | --- |
| Replay | Same seed + commands + target tick yields the same serialized state hash across different render cadences and observer positions. |
| Time | 420 world seconds equals one day at 1×/4×/16×/64×; weather, workers, traffic and Chronicle agree on deadlines. Pause advances no logical state. |
| Fidelity | Leaving and re-entering a town preserves named people, shipments, damage and report knowledge; near and far resolution produce equal strategic outcome. |
| Economy | All inventories and cohorts stay finite and nonnegative; cargo is reserved once, lost or delivered once, with bounded production and consumption. |
| Knowledge | Reports follow carrier/communication routes and valid timing; a rumour's parent fact remains traceable; legends do not imply witnessed truth. |
| Incident | Eligibility, cooldown, casualty limits, recovery and no duplicate results hold over scripted scenarios. |
| Persistence | Save/load mid-fire and mid-trip, migration from schema v1, export/import, stale save recovery and UI state separation. |
| Navigation | Every planned workplace/home is reachable or explicitly rejected; no teleport-through-building fallback on a disconnected path. |
| Experience | Play 20 minutes at a watched town; inspect one resident, one supply chain, one incident and one resolved consequence without needing a debug console. |

**Initial performance targets** to confirm against stage 0: simulation work under ~3 ms of a typical 60 FPS frame in a populated town, no unbounded growth in event/memory lists, at most three detailed settlements as today, and 36 remote sites simulated at lower cadence. Measure on a representative mid-range browser device; revise budgets based on traces. Keep the current instanced rendering strategy: [Three.js notes that instancing reduces draw calls](https://threejs.org/docs/pages/InstancedMesh.html). A dedicated Web Worker for strategic simulation is an option only when profiling shows main-thread cost; the current workers already handle terrain, and [the browser's Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) is available if that isolation proves useful.

### Design traps to avoid

- **“More events” as a shortcut:** a frequent headline with no durable effect makes the world feel less real. Prefer fewer, longer and resolvable incidents.
- **Full-agent simulation everywhere:** meaningful characters plus cohorts give better story density than thousands of idle individual state machines. Dwarf Fortress and Veloren both offer relevant scaling examples.
- **All needs at once:** start with food/water/safety and one culture-specific need. Add variables only when they change behaviour the player can observe.
- **Magic as arbitrary interruption:** give every exceptional phenomenon place, conditions, limits and witnesses.
- **Runaway feedback:** shortages trigger imports/substitution; wars require capacity, supply and a stop condition; depleted ecosystems regenerate or migrate; settlements should not collapse merely because the player accelerated time.
- **Information omniscience:** distinguish world truth, NPC beliefs, player's knowledge and interface hints.
- **Expensive dynamic terrain rebuilds:** changes should be sparse, local overlays on the existing static world; regenerate a chunk only when a change truly affects geometry.
- **Overpromising interiors or first-person play:** current strengths are an observable globe and local streets. Make them causally rich first.

## 8. Success criteria

A successful first release of the “living world” is modest in scope and unmistakable in effect. Over a week of simulated time, a player should be able to: revisit a persistent named resident; witness or learn of a material shipment; see a real supply or building condition change; trace at least one rumour to its origin; and understand one consequence of an optional intervention. The same history must survive reload, and it must still make sense whether watched closely or skipped at 64×.

**The principle to preserve:** Sosaria's wonder comes from being able to cross a globe and discover that the world carried on without us. The strongest expansion is a trustworthy relationship between what happened, what people believe happened, and what the player can see.
