# Sosaria: A Living Medieval Fantasy World

## Visual, simulation, and implementation handoff

**Prepared:** November 1, 2026  
**Repository:** https://github.com/otectus/Sosaria  
**Reviewed branch:** `main`  
**Reviewed commit:** `3e75e4dc3cd6a77331f556810c770a42e15a3f89` — “Initial Sosaria fantasy world simulation”  
**Declared package version:** `1.0.0`  
**Audience:** The coding agent implementing the next stages of Sosaria.

**How to use this handoff:** Read the audit and architecture first, then implement milestones in order. Sections 5–12 describe the target experience; Section 14 defines when to deliver each part. Preserve the existing world while replacing temporary behavior with persistent systems.

**Quick navigation:** [Verified findings](#3-fix-the-foundations-before-adding-large-systems) · [Architecture](#4-architecture-evolve-the-current-project) · [Visual direction](#5-visual-direction-a-world-with-readable-character) · [First complete slice](#8-first-complete-slice-the-valdren-grain-network) · [Delivery order](#14-delivery-order-and-completion-gates) · [Validation](#15-validation-and-definition-of-done) · [Agent instructions](#16-instructions-for-the-implementing-coding-agent)

## 1. The direction

Develop Sosaria into an explorable, persistent medieval fantasy world in which people, settlements, wildlife, kingdoms, and supernatural forces have understandable reasons for acting. Preserve its defining pleasure: descending from a beautiful globe into a small, animated place and discovering the lives within it.

The largest opportunity is to connect the existing visual richness to durable consequences. A merchant should carry something that another town needs. A burning granary should change food reserves, prices, work, and rebuilding. A dragon should have territory, appetites, relationships, and a history. A Chronicle entry should lead to evidence in the world.

The intended experience is **a living illustrated chronicle**: a world worth watching, understanding, revisiting, and occasionally influencing.

### Product rules

1. **Preserve the existing world.** Keep Aldmere, Highmoor, the Ironpeak Holds, the Faewild, Emberreach, the Gloamfen, the named dragons, and the handcrafted geography as the default scenario. Add new possibilities around their identities.
2. **Make observation rewarding.** Default play remains exploration and observation. Following a smith, tracing a trade route, or watching a storm should reveal meaningful activity without requiring micromanagement.
3. **Make causes discoverable.** Every significant change needs an inspectable cause, participants, place, and outcome. Uncertainty may belong to an in-world witness; the simulation itself must know what happened.
4. **Let history persist.** Leaving a region, changing graphics quality, pausing, saving, or reloading must not erase its people or reset its problems.
5. **Make fantasy systemic.** Magic should interact with weather, resources, beliefs, travel, ecology, and politics. It should do more than add particle effects.
6. **Use complexity selectively.** Model what creates observable decisions and consequences. Avoid thousands of disconnected statistics, decorative progress bars, or another subsystem that nothing else uses.
7. **Build complete slices.** Deliver one satisfying regional chain before extending the same mechanics across all 36 settlements. Avoid a simultaneous engine rewrite and continent-wide feature expansion.
8. **Protect calm play.** Include peaceful stretches, festivals, recovery, ordinary work, and optional low-conflict world rules. A world simulation needs daily life as much as catastrophe.

Treat everything below as a proposed development program except where it is explicitly identified as an existing capability or verified defect. The roadmap is dependency ordered; it is not a claim that every proposed feature already exists or fits in one release.

## 2. What was reviewed and what is already good

### 2.1 Evidence and limitations

The review used the repository’s full file tree, source modules, package scripts, and existing tests at the commit above. The repository had one returned branch, `main`, and no issues returned by the issue search. The tree contained no project README, design roadmap, changelog, or root-level project license; the vendored Three.js license is present.

Validation performed on a local source snapshot:

- Ran `npm test`: **7 tests passed, 0 failed** under Node.js 24.22.1.
- Built the world, settlement layouts, and structure records without a WebGL renderer.
- Exercised resident unloading/recreation, paused camera activation, Chronicle ID allocation, and construction model replacement.
- Generated and inspected the repository’s 1200 × 600 terrain preview using `tools/map.mjs`.
- Sampled generated sea-lane heights against `TerrainField` before adding settlement street segments.
- Reviewed renderer shaders, geometry generators, camera controls, UI markup/CSS, batching, streaming, workers, and lifecycle paths.

**Visual limitation:** a browser executable was unavailable, and browser installation did not produce a usable runtime. This was therefore a source-level rendering/UI review plus an actual generated terrain-map inspection, not a completed interactive WebGL walkthrough. No in-game screenshot comparison, measured GPU benchmark, browser accessibility audit, or shader-appearance judgment is claimed. Complete the browser validation protocol in Section 15 before accepting visual work.

### 2.2 Verified inventory

| Area | Existing implementation |
| --- | --- |
| Platform | Browser application using ES modules and a small Node static server; no framework or build step required by the current package |
| Rendering | Vendored Three.js revision **186**, WebGL renderer, custom materials and post-processing |
| Geography | Radius-100 spherical world, fixed seed `7331`, handcrafted continent/region definitions combined with procedural terrain |
| Content | 17 region definitions including the default Wilds, 36 settlements, 25 landmarks, 7 lakes, 9 river definitions including special flows |
| Travel network | 29 generated roads, 16 generated bridges, 8 authored sea lanes |
| Structures | 1,456 placed structure records in the reviewed default world |
| Inhabitants | Seven inhabited culture/race categories: human, elf, dwarf, fae, beastfolk, draconic, undead; ruins are an additional settlement culture value |
| Dragons | Vermithrax the Ember King, Skarn Frostwing, Old Aurum, Nyxmaw, Verdigris |
| Presentation | Globe camera, flights and following, Atlas, Chronicle, hover cards, labels, local time, 1×/4×/16×/64× controls |
| Optimization | Terrain worker pool, quadtree terrain, streamed vegetation, instanced crowds, batched structures, adaptive quality |
| Tests | Rendering/quality utilities, geometry validity, crowd growth, particles, post targets, and sun shadows |

Counts describe this specific seed and revision. Do not hardcode them into the future simulation as universal assumptions.

### 2.3 Preserve these foundations

**Planet and navigation.** `core/sphere.js`, `core/camera.js`, `world/field.js`, and the terrain modules already provide a coherent spherical coordinate system and smooth changes of viewing scale. Keep this continuity. Do not replace the world with a flat management map.

**Procedural model kit and anchors.** `models/kit.js`, the model registry, and human/culture builders give structures useful doors, work points, seats, light emitters, sails, and other anchors. These are excellent attachment points for production, movement, and inspection.

**Existing visual pipeline.** The project already has atmospheric scattering, custom water, clouds, fog, night lighting, surface patterns, wind animation, outlines, bloom, and final grading. The next art pass should improve coherence, legibility, transitions, and state expression before adding more effects.

**Cost-aware rendering.** Retain batching, instancing, pooled effects, and quality hysteresis. Expand them carefully to support changeable structures and persistent entities.

**Named places and legends.** The world already has a stronger identity than a generic random map. Turn its named locations and rumors into mechanical hooks. Preserve recognizable silhouettes and lore while allowing history to diverge.

### 2.4 Existing mechanics versus future mechanics

| System | What it does now | What enhancement should add |
| --- | --- | --- |
| Residents | Creates nearby town populations with names, roles, schedules, pathing, and event reactions | Persistent identity, households, needs, work orders, relationships, and consequences |
| Trade | Draws road/river/sea traffic on time-driven routes | Inventories, contracts, ports, travel constraints, delivery, losses, and local scarcity |
| Construction | Defines construction-stage models and builder animations | Material/labor accounting, stage transitions, completion, maintenance, and repairs |
| Events | Schedules happenings, alarms, effects, and delayed rumors | Preconditions, committed state changes, resolution, recovery, and causal records |
| Dragons | Flies/perches on prescribed cycles, animates, and breathes effects | Motivation, resource use, territory, diplomacy, ecological impact, and persistent outcomes |
| Wildlife | Places habitat-compatible groups and animates roaming/flying; supports temporary raid groups | Population dynamics, food webs, migration, hunting, habitats, and survival |
| Realms | Provides region metadata, cultural art, and names | Separate governments, ownership, institutions, diplomacy, succession, and logistics |
| Weather | Presents clouds, storms, mist, rain/snow effects and celestial cycles | Authoritative regional weather, seasons, water availability, harvests, hazards, and forecasts |
| History | Keeps a short in-memory Chronicle and rumors | Durable event history, evidence, family/settlement histories, and searchable timelines |
| Persistence | Stores graphics preference | World saves, migration, recovery, export/import, scenario identity, and deterministic continuation |

## 3. Fix the foundations before adding large systems

Use the finding IDs below in implementation notes and regression tests. “Runtime confirmed” means a targeted headless probe exercised the relevant code; it does not imply a browser screenshot was taken.

### F01 — Time-speed disagreement

**Evidence: source confirmed.** `main.js` advances `WorldClock` with the full selected speed, then computes `simDt` with a maximum multiplier of four. People, event timers, dragons, and wildlife use this slower timeline. Traffic uses `clock.day * clock.dayLength * 0.25`. At 64×, the calendar advances sixteen times faster than the capped people/event timeline relative to their 1× relationship.

**Implement:** one authoritative simulation clock and explicit conversion of legacy timings. All economic, social, weather, travel, and incident deadlines use it. Rendering interpolation and camera motion have separate clocks. Remove the cap as part of this redesign; merely deleting `Math.min(4, …)` while retaining frame-driven logic is insufficient.

**Accept when:** equal simulated elapsed time produces the same authoritative results at 1×, 4×, 16×, and 64×. If the machine cannot sustain a requested speed, show the achieved speed and slow the entire simulation coherently.

### F02 — People disappear from state when their town unloads

**Evidence: runtime confirmed.** `People.update()` deletes inactive `SiteSim` objects and recreates them on return. A Highmoor resident changed from ID 1 to ID 151 after unloading/revisiting. The seeded name repeated, but the entity object, task progression, and ID did not persist. Global `AGENT_ID` also makes identity depend on visit order.

**Implement:** a persistent resident store independent of rendered crowds. Convert `SiteSim` into an active view/controller of persistent records. Use stable IDs allocated by a saved allocator, with deterministic initial IDs derived from scenario/site/local index. A seed can regenerate appearance; it must not replace accumulated history.

**Accept when:** changing the camera path does not change resident identities or meaningful outcomes. Following, bookmarking, and revisiting a resident resolve the same entity after unloading and reloading.

### F03 — Camera activation stalls while paused

**Evidence: runtime confirmed.** `People.update()` schedules activation scans using `people.time`, which stops at pause. After simulation time had advanced, moving from Highmoor to Saltmere with `dt = 0` left Highmoor as the active town.

**Implement:** drive view activation from camera movement or a render-time budget, independently of world time. Paused worlds still stream terrain, structures, and frozen resident views. Do not advance tasks just to make a destination visible.

**Accept when:** a user can pause, travel to any settlement, inspect its residents, and return without changing the authoritative state hash.

### F04 — Chronicle event IDs repeat

**Evidence: runtime confirmed.** `Events.post()` uses `this.log.length + 1`, while trimming the log to 60. IDs become 61 repeatedly once the buffer is full, undermining `rumorOf` references and future history links.

**Implement:** a monotonic, serialized event allocator. Separate event storage from the small UI list. Retain stable references even when older prose is archived or compacted. Allocate IDs at commit time, never from list length.

**Accept when:** 10,000 committed events have unique IDs; references survive UI truncation, save/load, and history compaction.

### F05 — Sea lanes intersect dry land

**Evidence: runtime confirmed by terrain sampling.** `buildWorld()` smooths and resamples authored sea lanes without checking navigable water. Every one of the eight sampled lanes contained points with terrain height greater than 0.1. For example, `western` had 116 such samples of 170, reaching approximately 2.17 units above sea level. `Traffic.drawGroup()` places sea vessels at approximately 0.01.

These samples establish invalid sea routes; they do not establish the precise visual behavior at every affected point. Browser inspection should determine whether each ship is hidden, intersects ground, or otherwise appears incorrectly.

**Implement:** offshore port approach anchors, a navigable-water graph, vessel draft/clearance checks, and constrained route smoothing. Resample the final smoothed route and reject or repair dry-land intersections. Do not simply raise ships over terrain. Keep ghost ships’ supernatural travel an explicit, separately visualized rule.

**Accept when:** ordinary sea vessels remain in navigable water across their full route, reach valid dock approaches, and reroute or wait when a passage closes. Test narrow straits, coastal endpoints, cube-face boundaries, and the longitude seam.

### F06 — Construction is staged art without functioning progression

**Evidence: source and runtime confirmed.** Settlement generation selects `construct0` from `world.day0 || 0`; no caller advances construction through `Structures.setModel()`. The batch includes only geometries already placed. Attempting to change the default construction record to `construct1` left it at `construct0`, because the next geometry was absent.

**Implement:** persistent building records, a construction state machine, and a render adapter capable of registering later-stage geometry or rebuilding bounded batches. A change must also update anchors, footprint/height lookup, bounds, picking, path access, props, and lights. A mesh swap alone is not completion.

**Accept when:** a tower consumes actual materials and labor, visibly progresses, completes, gains its function, and persists. Blocked input supply visibly stops progress with an explanation. Damage and repair use the same lifecycle.

### F07 — Events depend on the camera and rendering cadence

**Evidence: source confirmed.** `pickSiteNear()` biases event placement toward the camera. `Events.update()` also consumes the same seeded random stream for per-frame fire effects that it uses for world events. Other life modules use `Math.random()` for some behavior/animation choices.

**Implement:** camera-independent world incident scheduling, stable ordering, saved simulation RNG streams, and separate cosmetic RNG. A presentation director may recommend an interesting event to watch; it must not make a town burn because the user is looking at it. Convert ambient rumors to labeled lore unless they arise from actual state.

**Accept when:** identical seeds and commands with different frame rates, graphics settings, camera itineraries, and pause durations produce identical authoritative results at the same tick.

### F08 — Local navigation can bypass obstacles

**Evidence: source confirmed; individual visual collisions require browser verification.** `Nav.path()` uses an unweighted graph and appends the destination even when no graph route is found. Alarm movement uses direct `moveToward()` motion. Neither is a general solution for closed gates, buildings, crowds, or blocked bridges.

**Implement:** explicit traversability and destination reachability; weighted A* where distance/cost matters; validated door/gate/bridge connectors; temporary closures; small local avoidance; stuck detection and recovery. A failed route should produce a waiting/reroute state, not movement through walls. Route firefighting and evacuation through the same navigation service.

**Accept when:** residents reach intended doors and workplaces, respect closures, and report a meaningful blocked reason. Long-distance travelers and local agents agree on road/bridge availability.

### F09 — Temporary events do not close a consequence loop

**Evidence: source confirmed design gap.** Fires expire by timer, theft produces chase behavior, raids create temporary groups, construction posts prose, and cargo stories choose text without inventory transactions. This is useful ambient staging, but it is not yet a persistent economy, combat model, or emergency response system.

**Implement:** complete one consequence loop at a time, beginning with the granary-fire slice in Section 8. The Chronicle should describe committed results. Keep harmless ambient animations, but clearly distinguish them from simulation outcomes.

### F10 — UI structure contains accessibility and layout risks

**Evidence: source confirmed; visual severity unmeasured.** The desktop Atlas starts near the same top-left position as Graphics. Closed panels use opacity/pointer events rather than removing their controls from keyboard focus. Mobile panel switching closes the other panel without updating that other button’s `aria-expanded`. Map labels with click handlers are generic `div` elements. Picking checks the planet body but not general terrain/building occlusion.

**Implement:** one panel/layout controller, correct expanded/pressed states, `hidden`/`inert` management, focus restoration, semantic controls, accessible entity lists, and proper selection visibility. Confirm actual overlap and pick behavior in-browser before recording them as screenshot-proven defects.

### F11 — Mutable world changes lack invalidation contracts

**Evidence: source confirmed integration risk.** Terrain workers receive initial features. Structures, lights, props, and height hashes are largely constructed once. This is reasonable for a static world, but changing a road, town, bridge, forest, or building would leave multiple representations out of agreement.

**Implement:** versioned world patches and dirty-region propagation. Track revisions for terrain features, navigation edges, building render data, vegetation masks, and light/prop anchors. Reject worker results built for an obsolete world revision. Make mutation transactions publish explicit invalidation events.

### F12 — Failure handling is incomplete for a persistent application

**Evidence: source confirmed hardening need.** The worker pool has a fallback, but jobs have no rejection/timeout contract and fallback startup has no shared in-progress guard. Main-loop exceptions are logged only for the first three failures while the loop continues.

**Implement:** idempotent fallback initialization, bounded retries, cancellation, typed job errors, generation IDs, and a visible recoverable application-error state. Prevent partial simulation commits; preserve the last valid save. Handle WebGL context loss, tab suspension, and unsupported rendering features. Do not claim a specific failure has occurred until it is reproduced.

## 4. Architecture: evolve the current project

### 4.1 Three clear responsibilities

1. **World definition:** authored geography, model definitions, cultures, species, goods, recipes, scenario rules, and initial conditions.
2. **Authoritative simulation:** persistent records, clocks, commands, events, decisions, transactions, navigation availability, and saves. It runs without Three.js or the DOM.
3. **Presentation:** terrain and models, actor views, effects, audio, camera, labels, and UI projections. It reads simulation snapshots and submits commands; it does not secretly decide history.

Keep the existing ES-module organization initially. Introduce JSDoc/type checking or TypeScript deliberately, with one build and test path. Do not migrate frameworks, rendering engines, and every file extension as a prerequisite for the first working slice.

### 4.2 Suggested module ownership

These are proposed paths, not existing files. Adapt naming to the codebase while preserving these responsibilities.

| Proposed area | Responsibility | Existing integration points |
| --- | --- | --- |
| `src/sim/clock.js`, `rng.js`, `ids.js` | Canonical time, reproducible randomness, stable IDs | `main.js`, `render/sky.js`, `core/noise.js` |
| `src/sim/world-state.js`, `commands.js`, `events.js` | Entity stores, validated commands, atomic outcomes, history | `world/build.js`, `life/events.js` |
| `src/sim/residents.js`, `households.js`, `jobs.js` | Persistent people, needs, work assignment | `life/people.js` |
| `src/sim/inventory.js`, `production.js`, `markets.js` | Resource accounting, recipes, prices and contracts | Existing work anchors, traffic |
| `src/sim/travel.js`, `navigation/` | Route validity, travel plans, closures, arrival | `world/build.js`, `life/traffic.js`, `core/sphere.js` |
| `src/sim/buildings.js`, `incidents.js` | Construction, damage, emergencies, repairs | `world/structures.js`, `life/events.js` |
| `src/sim/weather.js`, `ecology.js` | Environmental state and resource renewal | `render/clouds.js`, `particles.js`, `life/wildlife.js` |
| `src/sim/factions.js`, `institutions.js`, `magic.js` | Later politics, laws, belief and supernatural rules | Atlas realm/culture metadata |
| `src/persistence/` | Versioned saves, migrations, recovery, export/import | New persistence service |
| `src/view/` or adapters within existing modules | Map persistent IDs to render instances and effects | `life/*`, `render/*`, `world/structures.js` |
| `src/ui/inspectors/`, `chronicle/`, `atlas/` | Focused components consuming read models | Existing `hud.js` and CSS |
| `src/content/` | Validated data definitions and scenario manifests | `world/atlas.js`, model registry |

Add architecture and contribution documentation only after the interfaces are real. Keep `main.js` as composition and lifecycle wiring, with an explicit `App.dispose()`.

### 4.3 State contracts

Use stable IDs as references. Do not serialize live Three.js vectors, matrices, meshes, closures, worker handles, or DOM objects.

| Record | Minimum useful fields |
| --- | --- |
| World | Schema/content/generation version, scenario ID, world seed, canonical tick, allocators, RNG states, rules, stores, pending event queue |
| Settlement | ID, region, government ID, population references, buildings, stores, land use, water access, services, current issues, recent history |
| Person | ID, name/appearance seed, species, cultural affiliation, household, role/skills, needs, health state, current task, location/travel plan, important relationships/memories |
| Household | Members, home, shared inventory/budget, access to food/fuel/shelter, obligations |
| Building | ID, definition, owner, site/location, condition, stage, capacity, inventories, job slots, anchor bindings, functional state |
| Shipment | ID, carrier/contract IDs, origin, destination, cargo manifest, money/ownership terms, route, departure/arrival, status |
| Incident | ID/type, trigger, site/entities, start/deadline, current state, responders, committed damage, resolution, causes |
| Historical event | ID/tick/type, involved IDs, location, cause IDs, authoritative payload, presentation key, importance |
| Report or rumor | ID, source event or authored-lore ID, witness/sender, recipients, confidence, distortion, transmission path, arrival tick |

Separate `species`, `culture`, `faction`, `religion`, and `occupation`. The current `race = culture` shortcut must not dictate future societies. A dwarf can be a citizen of Valdren, an elf can join a merchant guild, and a town can have mixed households without losing local architectural character.

### 4.4 A coherent clock

Recommended initial representation:

- One integer tick equals **one in-world minute**; 1,440 ticks form a day.
- Preserve the existing default pacing of approximately 420 real seconds per day at 1×, translating old durations through a documented adapter.
- Use a rational/remainder accumulator so different frame subdivisions do not introduce clock drift.
- World dates, local solar hours, seasons, aging, task deadlines, and transit all derive from canonical time. Midnight at one longitude does not reorder global events.
- Start with a configurable 120-day year, four 30-day seasons, and calendars expressed as data. This is a proposed balance default, not existing lore.
- Schedule expensive decisions at their appropriate cadence: travel arrivals by deadline, jobs on task completion, needs periodically, markets daily or after material shocks, diplomacy less frequently.
- Evaluate due work in stable order, such as `(tick, priority, entityId, eventId)`.

Local bodies can interpolate an authoritative route/task between ticks at display refresh rate. Combat can initially resolve in scheduled exchanges and render continuous choreography. Do not require every town’s agents to run frame-by-frame movement at 64×.

Use a bounded catch-up budget. Retain unprocessed time as debt or reduce achieved speed; do not advance the sky while skipping simulation work. Pause stops authoritative changes and task-linked animation. Camera motion, UI focus, and view streaming continue. Cosmetic wind or water may continue only as a clearly chosen presentation policy; photo mode should offer full visual freeze.

### 4.5 Determinism and scalability

Use independent, serializable RNG streams for weather, ecology, economy, households, incidents, and each important autonomous actor. Current `mulberry32()` hides state inside a closure; expose state snapshots or replace it with a tested explicit-state generator. Presentation effects must never consume simulation RNG.

A visible character is a representation of a persistent person. A distant settlement remains simulated through the same authoritative job and resource rules at coarser decision frequency. Begin with simple records for all default-world residents and detailed render proxies only near the camera. Do not add aggregate population compression until profiling justifies it.

If larger worlds later use cohorts, document promotion/demotion invariants: no duplicated people, inventory, food consumption, births, injuries, or work. Named people remain individually persistent. Camera position must not choose a different combat or economic outcome.

Introduce a simulation worker after the kernel runs and tests headlessly. Use commands into the worker and versioned snapshots/deltas out; keep the terrain worker pool separate. Avoid sending the entire world every frame. A main-thread mode should use the same kernel and produce the same results.

### 4.6 Saves and migrations

Implement persistence in the first playable simulation milestone, before extended politics or ecology.

- Use IndexedDB for structured saves and an explicit downloadable export for backup and portability. Keep localStorage for small preferences.
- Save scenario/content versions, time, RNG states, entity IDs, inventories, schedules, active incidents, travel, and historical references. Rebuild rendering and derived caches after loading.
- Stage a complete snapshot and atomically promote it. Keep the previous known-good snapshot until the new one is committed.
- Provide manual save slots, rotating autosaves, export/import, and clear errors for unavailable or full storage.
- Validate imported sizes, values, IDs, references, and schema before mutating a live world. Use safe text rendering for user names and imported content.
- Maintain migration fixtures for supported old versions. Refuse unsupported future schemas without overwriting them.
- Record whether a save uses altered rules or interventions. Keep ordinary exploration saves separate from intentional scenario branches.
- Default to no unrequested offline progression. Resuming a hidden tab must not simulate hours of famine automatically.
- Test two tabs opening the same save: use a write lock or revision check and avoid silent last-writer data loss.

IndexedDB is asynchronous structured storage, not a promise that browser data can never be evicted. The export function is part of the usable save system. See references [R5] and [R6].

## 5. Visual direction: a world with readable character

### 5.1 Art direction and viewing scales

Keep the stylized, miniature medieval-fantasy character of the procedural kit. Aim for strong silhouettes, believable materials, deliberate color families, and signs of use. Photorealistic texture density would compete with the miniature scale and is not the default goal.

Create a small art-direction document and a deterministic visual gallery before changing every asset. Include a human street, dwarven gate/forge, elven settlement, fae glade, beastfolk market, dragonkin temple, undead waterfront, forest edge, coastline, and dragon in flight.

| View | What must read immediately | Detail to suppress |
| --- | --- | --- |
| Globe | Continents, climate bands, major realms, oceans, active regional crises | Individual people, small props, crowded local labels |
| Region | Settlement hierarchy, roads, rivers, mountain passes, fleets, forests | Dense material noise and excessive particle layers |
| Settlement | Districts, landmark buildings, productive outskirts, gates, bridges, visible problems | Unimportant roof clutter and every citizen’s name |
| Street | Activities, tools, doors, queues, inventory cues, signs, materials | Distant labels and cinematic effects that obscure people |
| Follow | Subject identity, destination, action, obstacles, immediate surroundings | Automatic reframing that loses the subject or blocks it behind UI |

Each scale needs a designed information hierarchy. Detail should appear because it helps explain the scene, not merely because the camera is closer.

### 5.2 Geography and terrain

The generated terrain preview shows strong regional color and recognizable landmasses. It also reveals how important coastlines and route placement are to the world’s readability. Treat its colors and exaggerated hillshade as a diagnostic rendering, not as evidence of the final WebGL appearance.

Implement the following in order:

1. **Terrain validation and travel coherence.** Establish tests for settlement pads, water access, bridge endpoints, river profiles, and maritime routes. Resolve F05 before adding shipping features.
2. **Regional landform identity.** Give Ironpeak broad masses with readable ridgelines, Frostreach glacial valleys, Thornsteppe open grazing terrain, and Emberreach coherent volcanic slopes. Tune large forms before high-frequency noise.
3. **Transition zones.** Blend forests into fields through scrub, hedges, coppice, orchards, and paths. Blend snow through altitude, exposure, season, and shelter. Avoid uniform rings of detail around every settlement.
4. **Grounded settlement edges.** Use retaining walls, terraces, drainage, foundation skirts, and paths to resolve the junction between a flattened settlement and natural terrain. Avoid fixing every mismatch by hiding it under grass.
5. **Coast identity.** Add distinct beaches, marsh margins, cliffs, gravel shores, reeds, tidal rocks, and coves based on slope/substrate. Keep navigation geometry independent of purely visual wave displacement.
6. **Hydrology.** Preserve monotone downstream water levels, use explicit lake outlets, and represent falls and navigable reaches. Rain should eventually modify regional water stores and river flow; full fluid simulation is unnecessary.
7. **Persistent land-use patches.** Clear-cutting, farmland, burned woodland, road wear, and rebuilding footprints should survive view streaming and saves. Store small revisioned patches rather than rewriting the planet mesh.
8. **Optional world variants.** After the default scenario is stable, expose seed/climate parameters for alternate worlds. Keep authored Sosaria intact and version its generation rules.

Test the poles, the ±180° seam, cube-face boundaries, low-detail/high-detail transitions, and several extreme camera angles. Keep coarse parent terrain until replacement chunks are ready. Use skirts or stitching deliberately and verify they do not become visible walls beside water or steep ground.

### 5.3 Town layout and architecture

Retain cultural variety while making each settlement visibly shaped by geography and work.

- Generate around actual approach routes, waterfront access, wells, defensible ground, markets, and important sites.
- Introduce districts as functional land-use groups: market, residential, workshops, harbor, temple, military, and agricultural outskirts. Smaller villages should remain irregular and compact.
- Align doors and work yards to connected paths. Put docks at water, mills at useful flow/wind sites, and mines at appropriate deposits.
- Give buildings frontage, service access, yard space, setbacks, and usable capacity. Avoid repeated freestanding models evenly scattered around a plaza.
- Add curated variations in floor count, roof pitch, chimneys, lean-tos, repairs, material mix, and shop signs. Keep silhouette families consistent within a district.
- Mark old growth through extensions, reused masonry, narrow lanes, partial walls, and abandoned plots. New districts should differ from the historical core.
- Show ownership and affiliation through heraldry, signs, cloth, and a few architectural details. Do not recolor every building wholesale after a political transfer.
- Reserve landmark silhouettes: the capital keep, dwarven mountain gate, elven spire, dragon temple, and haunted necropolis should remain identifiable at medium distance.

Recommended cultural treatment:

| Existing culture | Visual vocabulary to develop | Mechanical expression to support |
| --- | --- | --- |
| Human | Timber/stone mix, varied roofs, markets, fields, guild signs | Diverse occupations, charters, household economies |
| Dwarf | Heavy foundations, terraces, carved entrances, ventilation, industrial water | Mines, metalworking, engineering, imported food |
| Elf | Slender structures, canopy continuity, bridges, shaded gardens | Forestry agreements, specialist craft, managed groves |
| Fae | Unusual scale, luminous focal points, seasonal forms, restrained impossible geometry | Bargains, glamour, seasonal migrations, local anomalies |
| Beastfolk | Modular halls, clan markers, hides/reeds/wood adapted to climate | Herding, hunting, trade, settled and mobile communities |
| Dragonkin | Volcanic stone, sheltered courtyards, heat channels, ritual plazas | Heat craft, tribute, dragon negotiation, ash management |
| Undead | Repair upon ruins, memorial objects, cold lamps, occupied burial architecture | Remembrance, unusual labor/needs, civic identity beyond hostility |

These are cultural tendencies, not mandatory personalities or moral alignments. Mixed towns should develop hybrid districts and shared public spaces.

### 5.4 Materials, lighting, and post-processing

**Do not remove effects that already exist and then describe their replacement as a new capability.** Audit the existing pipeline first.

- Establish reference images at midday, overcast noon, sunset, moonlit night, and firelight, using fixed camera positions and time.
- Preserve linear lighting and exactly one output conversion. `post.js` already performs a final `toSRGB()` conversion; changing `renderer.outputColorSpace` without accounting for that risks double conversion. Confirm the whole path with neutral gray, saturated colors, emissive material, and alpha blending before tuning exposure. See [R1].
- Use a shared material vocabulary for stone, plaster, timber, thatch, roof tile, metal, cloth, skin, foliage, and magical surfaces. Tune roughness and specular response to distinguish them.
- Add wear where function explains it: darkened forge walls, polished steps, damp foundations, repaired roofs, wheel ruts, moss in shade. Avoid random dirt everywhere.
- Limit bloom to intentionally emissive sources. Preserve bright detail in fire, runes, windows, and pale stone.
- Make outlines optional and scale-sensitive. Verify thin details, shorelines, clouds, and overlapping characters do not acquire distracting halos.
- Keep nighttime navigable and atmospheric. Prefer moonlight, sky contribution, lamps, and controlled exposure to uniformly brightening the world.
- Retain the bounded local point-light pool. Blend assignments or apply hysteresis so nearby lantern changes do not visibly jump. Feed occupancy, fuel, damage, and operating state into lights rather than lighting every anchor perpetually.
- Make ambient occlusion/contact shading a measured improvement. Start with inexpensive grounding beneath feet, buildings, and props; add a screen-space pass only if its quality gain justifies GPU time.
- Expose bloom strength, outlines, exposure assistance, particles, and motion effects separately from broad quality presets where they affect comfort or readability.

### 5.5 Water, clouds, and weather presentation

Connect presentation to authoritative environmental values once Section 9 is implemented.

- Rivers indicate current direction, depth, and flow class; waterwheel speed follows usable flow.
- Shore foam depends on coastline and wave exposure. Waterfalls need coherent source/landing water and bounded mist.
- Harbors contain mooring positions, loading areas, boat bobbing, and actual docked/underway states.
- Weather fronts should have spatial extent, heading, strength, and transition time. The same storm should remain recognizable when followed to another region.
- Use gradual cloud, fog, wetness, puddle, snow, and sound changes. Avoid switching weather instantly at region boundaries.
- Tie seasonal water changes to a limited hydrological model. Render tiny ripples cosmetically; simulate meaningful flooding and passability explicitly.
- Use magical weather selectively: ashfall, aurora, fae pollen, ghost mist, ley storms. Each needs a readable ordinary-weather baseline.

### 5.6 People, animals, and dragons

The existing GPU crowd animation is a valuable base. Improve contact and intention before adding model complexity.

- Synchronize gait with movement and distance traveled. Stop foot motion during genuine idle states and pause task animation with simulation pause.
- Reserve work, seat, dock, and conversation anchors so several characters do not claim the same physical slot.
- Orient people toward the workpiece, customer, listener, threat, or path. Keep tools in the correct hand and clear of faces and walls.
- Add a small set of distinct silhouettes: age/height variation, occupation clothing, armor, packs, hats, hair, and equipment. Reuse compatible geometry and material channels.
- Make carried cargo visible as a projection of a manifest: grain sacks, timber, ore crates, trade chests. The depiction can be representative rather than one mesh per item.
- Use group behavior for animals: herd spacing, resting/grazing clusters, predator approaches, fleeing corridors, shore access. Avoid identical phase-offset loops as the final behavior model.
- Give dragons clear anticipation, turn radius, landing approach, ground contact, folded wings, breath origin, and recovery. Save their current activity; do not restart a landing when the view changes.
- Use legible reaction priorities. A person cannot simultaneously celebrate, flee, fight, and deliver a sack. Interruptions must release/reserve tasks predictably.
- Support injury, fatigue, and age through restrained posture and speed variation. Avoid requiring a complex anatomical simulation for the initial life model.

### 5.7 Show simulation state through art

Implement reusable visual-state mappings rather than dozens of one-off scripts.

| State | World presentation | Inspection evidence |
| --- | --- | --- |
| Food surplus | Stocked market tables, filled granary cues, more loaded departures | Stores, consumption, exports |
| Shortage | Empty stalls, substitute goods, reduced livestock sales, relief arrivals | Shortage cause, expected deliveries, ration policy |
| Building project | Survey markers → foundation → frame/scaffolding → usable structure | Materials reserved/delivered, work completed, blocked reason |
| Fire aftermath | Scorch, missing roof sections, salvage, repair workers | Damage, responders, displaced households, rebuild plan |
| Trade interruption | Waiting wagons, stopped docks, patrols on a detour | Blocked edge, affected contracts, recovery estimate |
| Seasonal change | Fields changing stage, harvest carts, stored fodder, snow on appropriate surfaces | Season, weather, planting/harvest state |
| Political change | New standards at civic sites, guard affiliation, court activity | Treaty, succession, occupation, legitimacy |
| Magical imbalance | Specific altered flora/light/behavior around the cause | Source, intensity, effect, countermeasure |

Never show a completed building, loaded ship, extinguished incident, or overflowing store unless corresponding state exists.

## 6. Interface, exploration, and sound

### 6.1 Preserve the simple surface

Keep the world as the primary view. Use a small persistent bar for time, location, pause/speed, search, and access to Atlas/Chronicle. Add a contextual inspector instead of permanent dashboards around every edge.

The default loop should be:

1. Notice a place, person, creature, or event.
2. Select it and read a short explanation.
3. Inspect causes, relationships, routes, or history when desired.
4. Follow the subject or visit a related place.
5. Bookmark the thread and return later.

Offer optional stewardship tools after the world works autonomously. Do not make the user approve every farmer’s work assignment.

### 6.2 Entity inspector

Selection should open a stable panel; following should be a separate explicit action.

- **Person:** name, current task and destination, home/household, occupation, immediate needs, meaningful relationships, recent events, and “Why this task?”
- **Building:** purpose, owner, workers, input/output, stock, condition, project stage, and blocked reason.
- **Settlement:** population, food/water outlook, productive work, housing, services, leadership, trade partners, and recent changes.
- **Shipment:** origin/destination, cargo, owner/carrier, route, expected arrival, hazards, and delay explanation.
- **Dragon or other notable creature:** current goal, territory, condition, relationships, known deeds, and witnessed/unknown information.
- **Incident:** cause, affected entities, response, trajectory, resolution, and consequences.

Use plain language before numbers. Example: “The mill is idle because the river is too low. Flour reserves should last three days.” Provide the actual calculation and assumptions on expansion. A forecast should be labeled as an estimate.

Resolve every panel through stable IDs. If an entity dies, leaves, becomes hidden, or is archived, show its historical record or current status instead of keeping a stale object reference.

### 6.3 Atlas and map layers

Add search, culture/region/type filters, favorites, and recent destinations. Make existing places easy to find before adding more.

Support a small set of useful layers:

- Political ownership and disputed claims.
- Roads, bridges, sea lanes, ports, travel closures, and active shipments.
- Food/water stress and productive land.
- Weather, seasons, and hazard exposure.
- Habitats, migration, and protected/overused woodland.
- Ley lines, supernatural influence, and major magical sites.
- Historical layers for an archived date, clearly distinguished from the live world.

Layers should have legends, units, optional labels, and hover explanations. Do not show all overlays simultaneously. Political territories require actual region/settlement ownership rules; colored circles around culture centers are not sufficient.

Implement deterministic label priority and screen-space collision avoidance. Reserve the selected entity’s label, then important settlements and active incidents. Avoid placing labels beneath panels or directly on top of each other. Use an accessible list as an alternative to canvas picking.

### 6.4 Chronicle and causal history

Replace the flat stream with linked, filterable history while preserving its flavorful voice.

- Keep a compact live feed, a searchable archive, and pinned story threads.
- Group repeated updates into incidents: ignition, response, contained, recovery. Do not flood the feed with every damage tick.
- Distinguish **observed event**, **report**, **rumor**, and **legend** with both words and visual treatment.
- Link an event to people, places, shipments, buildings, causes, and follow-up outcomes.
- Provide “Why did this happen?”, “What changed?”, and “Show on map.”
- Keep source facts separately from generated/localized prose. Templates should never fabricate participants, cargo, construction progress, or victories.
- Deliver rumors through actual social/travel channels once those systems exist. Record who transmitted what and when; distortion belongs to reports, not to the authoritative event.
- Retain important events permanently or in compact historical records. Everyday summaries can be aggregated, but referenced events must resolve.

Do not implement full rewind by storing only Chronicle prose. Historical inspection can begin with event summaries and periodic snapshots. Replaying or branching from an earlier date requires a validated snapshot and deterministic subsequent commands.

### 6.5 Camera and input

Preserve orbit, drag, tilt, dive, and follow, then add:

- Discoverable home/overview, back-to-previous-view, focus-selected, and reset-north actions.
- Saved camera bookmarks and a gentle optional guided tour of three contrasting places.
- Separate orbit, survey, and close-follow presets with adjustable smoothing and invert settings.
- Collision/clearance behavior that respects terrain, buildings, bridges, and followed subjects without abrupt roof jumps.
- Follow state that survives view streaming and explains when the subject enters a building. Keep the selection open even if the camera cannot see inside.
- Keyboard equivalents and optional click-to-pan/zoom controls. Touch interactions must not depend on hover or right-drag.
- Selection hit-testing that handles behind-camera objects, occlusion, and overlapping actors. When multiple subjects are plausible, offer a small choice list.
- Photo mode with hide-UI, deterministic time/weather controls on a separate preview state, and no accidental mutation of the saved world.

### 6.6 Accessibility and responsive behavior

Use WCAG 2.2 guidance as an interface acceptance reference, not as an unverified certification claim [R7].

- Provide full keyboard access to primary exploration and all panels; expose focus visibly and restore it after closing a panel.
- Ensure closed panels are not focusable. Keep `aria-expanded`, `aria-pressed`, names, and selected states consistent.
- Use readable text contrast, scalable type, non-color status cues, and sufficiently large touch targets; aim for 44-pixel controls where practical.
- Support reduced motion for automatic flights, panel transitions, camera shake, and intense visual effects. Let users disable flashing spell/storm effects.
- Test 200% text scaling, long translated names, small screens, touch, and keyboard-only use.
- At narrow widths, use one contextual drawer with stable tabs and preserve the selected subject. Do not cover the time controls with the keyboard or safe-area inset.
- Avoid announcing every Chronicle entry with an assertive live region; offer controlled announcements for important changes.

### 6.7 Audio as evidence of place

No audio subsystem was identified in the reviewed source. Add it after the first causal slice, with user-gesture activation and persistent volume preferences.

Use layered, spatially appropriate sound: regional ambience, wind/water, wildlife, footsteps, work tools, markets, bells, ships, and rare supernatural cues. Tie forge sounds to active work, crowd intensity to occupied public spaces, and alarm bells to actual incidents. Crossfade layers with camera altitude and weather. Keep a strict simultaneous-source budget, avoid restarting loops during streaming, and provide master/music/ambience/effects controls.

Provide captions or readable alerts for meaningful bells, roars, and warnings. Sound should improve orientation without being required to understand an event.

### 6.8 Optional stewardship and world experiments

Keep three clearly separated ways to engage with the same world:

- **Observe:** explore, inspect, follow, bookmark, and read history without changing outcomes.
- **Steward:** influence one settlement or institution through bounded policies, projects, aid, treaties, and priorities. Autonomous people decide how to carry out those goals within their resources and obligations.
- **Experiment:** explicitly branch a save and change world rules, introduce a drought, block a route, protect a habitat, or alter a magical site. Show the intervention in history so the resulting world remains explainable.

Stewardship commands should preview cost, prerequisites, affected entities, and expected uncertainty. A relief order can fail because transport is unavailable; a building proposal can wait for materials. Offer cancellation and recovery rules before commitment where feasible. Avoid falsely promising a guaranteed political or ecological outcome.

An experiment branch should retain its origin save and intervention list. Let the user compare a few meaningful measures—food security, migration, forest cover, trade, and notable events—with an unmodified branch at the same date. Implement deterministic branching only after saves and replayable commands work. Do not label ordinary history browsing as a functional time machine.

Directly embodying an adventurer can be a later mode if desired, but it must share persistent people, inventories, travel, and consequences. It is not required to make the observer/steward experience complete.

## 7. People, work, and a functioning medieval economy

### 7.1 Residents with continuity and understandable decisions

Start with a compact needs model: food, rest, shelter/warmth, safety, and social connection. Add occupation skills, a few decision-relevant traits, and a small memory set. Every field must influence a visible decision or explanation.

Use a utility selector or a clear hierarchical state machine. Both are acceptable if they expose why an action won. A useful priority order is immediate survival, urgent duties, ordinary needs, scheduled work, social obligations, and discretionary activity. Traits modify preferences; they do not override basic path validity or resource constraints.

A job must have preconditions, a destination, reserved inputs/anchor, travel, work, outputs, completion, interruption, and recovery. A blacksmith’s hammering should consume fuel and material, reserve a forge, take time, and produce usable goods. A baker without flour should seek supply or take another task.

Represent households before elaborate individual finance. Households share shelter and basic stores; workplaces and civic institutions hold production inventories. This supports believable daily life without making every loaf a complicated auction.

Initial social depth should include household ties, friendship, trust, obligations, and a few significant memories. Limit routine relationship edges to actual contacts. Do not create an all-pairs social matrix. Remember events that alter future behavior: shelter given during a fire, wages unpaid, a rescued child, a broken oath, a profitable partnership.

Later add birth, aging, apprenticeship, partnership, death, inheritance, and migration. Ensure population change is constrained by food, housing, household circumstances, health, and world rules. Do not spawn residents solely to keep crowds visually dense. Keep representation respectful and avoid making every elder, child, species, or culture behave identically.

**Acceptance:** a named resident has the same household, skills, memories, and current situation after ten days away and a save/load. Work output depends on resources and attendance. An inspector explains the chosen action and any blockage.

### 7.2 Production chains with a small initial vocabulary

Use data-defined goods with units, weight/volume, storage class, perishability where useful, and optional quality. Keep the initial set small enough to debug completely.

| Chain | Inputs and constraints | Outputs | Visible activity |
| --- | --- | --- | --- |
| Grain and bread | Field, seed reserve, labor, season/water → mill capacity → flour and fuel | Staple food | Planting, ripening, harvesting, sacks, milling, baking |
| Timber and construction | Managed woodland, labor, tools, transport | Timber, planks, building materials | Felling, hauling, saw/work yards, staged structures |
| Ore and tools | Deposit, mine access, labor, fuel, forge capacity | Metal and tools | Ore carts, charcoal/fuel delivery, forge work |
| Wool and cloth | Herd health, seasonal shearing, labor, workstations | Cloth/clothing | Shepherding, shearing, spinning/weaving, traded bales |
| Fishing and preservation | Fish stock, boats/access, weather, labor, salt where applicable | Fresh/preserved food | Boats, landing catch, drying racks, barrels |
| Magic goods, later | Defined reagents, training, sites, energy/ritual costs | Enchantments, wards, potions | Distinct work processes with limited throughput |

Release the food/timber chains first. Additional chains should reuse inventory, jobs, transport, storage, and recipe systems.

Inventory changes must be transactional. Reservation is not consumption. A job cannot spend the same sack as another job, and canceling a job must release its reservations. Goods move through stores, carriers, consumers, and explicit losses. Record spoilage, burning, theft, and consumption as sinks with causes.

Use integer or fixed-point quantities for conserved resources and money. Document recipe yields and byproducts; conservation means accounting for sources, transformations, and sinks, not pretending that one unit of every input must equal one unit of output.

### 7.3 Markets and livelihoods

Implement local supply and demand through actual stock, household needs, production plans, and contracts. Start with a bounded price model based on available stock relative to a target reserve. Smooth changes and explain them. Do not let an empty inventory produce an infinite price or a cosmetic stall create stock.

Recommended sequence:

1. Barter/resource transfer and civic procurement with clear ownership.
2. A single integer-denominated currency, household/workplace budgets, wages, and recorded taxes.
3. Regional specialization, trade margins, tariffs, and merchant organizations.
4. Credit, debt, or multiple currencies only if simpler systems create a compelling need.

Specify starting money and any issuance/sinks. Transfers should not create money. Test insolvent employers, unpaid workers, empty stores, and failed contracts without deadlocking the whole town.

Food security should reflect usable food divided by expected consumption, with spoilage and deliveries shown separately. People need substitutions and emergency options: alternate staples, gathering, relief trade, rationing, migration. Avoid a single missing ingredient causing immediate irreversible collapse.

### 7.4 Logistics that makes geography matter

Replace purely time-driven decorative traffic with persistent journeys for actual entities and cargo. Existing route geometry and vehicle renderers should become presentation tools for these journeys.

- Reserve goods and transport capacity at departure; put cargo into a carrier-owned/in-transit inventory.
- Respect speed, terrain, roads, bridges, weather, gate rules, danger, rest, and capacity.
- Deliver exactly once through an atomic arrival transaction. Never credit both a warehouse and a moving wagon with the same goods.
- Handle loading/unloading time and dock/market capacity. Queues should be bounded and visible.
- Model route failure with wait, reroute, return, salvage, loss, or escort requests. A blocked route cannot silently teleport cargo.
- Track courier/report travel separately from goods, using the same network where appropriate.
- Make boats require navigable water and meaningful port connections. Allow overland transfer between a river landing and a sea harbor where the geography requires it.
- Let danger affect route choice and demand for guards. Do not create a bandit attack for every journey.

Old decorative groups may remain as clearly non-economic background traffic during migration, but avoid showing two conflicting versions of the same shipment.

### 7.5 Settlement growth and public works

A settlement grows because households need housing, production needs capacity, or leaders invest in infrastructure. Use demand, resources, labor, site constraints, and explicit decisions.

A building lifecycle should cover planning, site reservation, supply, construction, operation, damage, repair, abandonment, and ruin. Add maintenance gradually, with long enough intervals to avoid turning the experience into constant repair spam.

Public works are especially valuable because they connect visuals and systems: wells, bridges, granaries, walls, canals, roads, docks, mills, hospices, libraries, and watchtowers. Require each to improve a measurable capability. A library can support education and knowledge transmission; a watchtower can improve detection/reporting and route safety rather than merely adding a defense number.

Growth must preserve roads, access, historic landmarks, navigable water, and occupied plots. Show a planning explanation when expansion fails. Empty space is part of a believable town; do not fill every valid coordinate.

## 8. First complete slice: the Valdren grain network

Build the first coherent simulation in **Millbrook → Brightwater → Highmoor**, with **Saltmere** as a trade outlet and relief supplier. These places already have relevant identity and road connections in `atlas.js`. Use the actual generated routes; do not invent a direct connection that bypasses them.

### 8.1 Normal operation

- Millbrook grows grain through field jobs and a modest seasonal yield model.
- Brightwater turns grain into flour with a functioning mill and labor/capacity limits.
- Highmoor’s households and workplaces consume food and pay or receive allocations through the chosen initial economy rules.
- Saltmere can exchange food, timber, and other supported goods using validated roads and, after maritime fixes, safe shipping.
- A visible shipment has a manifest, real endpoints, capacity, ownership, departure, and expected arrival.
- The user can follow a sack’s supply chain through the inspector without needing to micromanage it.

### 8.2 The granary fire

Use a deterministic test command to create a fire, then add natural ignition conditions only after response and accounting are correct.

1. A valid granary enters a burning incident state.
2. Fuel, dryness, wind, nearby structures, detection, and available responders determine progression.
3. The alarm reaches the settlement through its response system. Residents select roles: fetch water, pass buckets, protect dependents, guard the area, salvage, or evacuate.
4. Work anchors, safe approaches, water-source capacity, and travel time matter.
5. The incident damages building condition and destroys a bounded amount of actual stored goods. Record the losses once.
6. Food outlook and prices/allocation change. Households and leadership react within their means.
7. Nearby towns respond to a real relief contract or request. The delivery takes time and follows a route.
8. The fire resolves into contained, destroyed, abandoned, or another explicit state. Smoke is not the state machine.
9. Repair jobs consume materials and labor, update the model stages, restore capacity, and leave an event/history record.
10. Relevant residents remember the event. News travels; distant people do not instantly know every detail.

### 8.3 Branches to prove agency

The same incident should resolve differently when meaningful conditions change:

- Full well and available workers: early containment, limited loss.
- Drought and absent workers: worse damage, emergency imports.
- Closed bridge: delayed relief, alternative route or rationing.
- Existing warehouse redundancy: inconvenience rather than famine.
- Strong neighboring relationship: faster assistance or better terms.
- No assistance: migration or adaptation, not a permanently broken simulation.

A world rule can reduce ignition frequency or disable destructive emergencies without disabling production and trade.

### 8.4 Completion gate

This slice is complete only when it works while watched, unwatched, paused between steps, accelerated, saved mid-incident, and reloaded. Confirm identical resource/event results for equal ticks and commands regardless of camera path. Supply an event trace and resource ledger proving what happened.

It should be enjoyable to watch for several in-world days before any kingdom wars, new continents, or elaborate spell trees are added.

## 9. Environment and ecology

### 9.1 Climate, seasons, and water

The current changing sun declination and weather visuals are a starting point, not a complete seasonal climate model. Introduce a coarse climate grid or regional cells with temperature, precipitation, soil moisture, snow cover, wind, and surface-water reserves.

Make baseline climate depend on latitude, elevation, coastal exposure, and authored regional modifiers. Use deterministic fronts and bounded variation. Preserve fantasy exceptions as explicit rules: volcanic warmth, magical groves, cursed fog, dragon influence.

Translate environmental state into decisions:

- Farmers choose planting/harvest windows and retain seed reserves.
- Grazing and fodder change with season.
- Low rivers reduce milling and boat access.
- Heavy rain changes travel and flood risk.
- Snow closes exposed passes before sheltered roads.
- Heat/dryness changes fire behavior.
- Ash can damage an immediate harvest while benefiting soil over a longer period, if the balance model supports it.

Use coarse water balance and connected catchments; a full atmosphere or fluid solver is unnecessary. Forecasts should expose uncertainty and be based on current fronts, not on hidden omniscience unless the user selects an omniscient observer mode.

### 9.2 Wildlife populations and habitat

Separate persistent ecological populations from visible animal proxies. Begin with a few understandable functional groups: vegetation, herbivores, small prey, predators, scavengers, and notable magical creatures.

Give each habitat carrying capacity, food/water supply, shelter, breeding conditions, seasonal suitability, and pressure from hunting or disturbance. Animal groups move to meet these needs. Predation, births, deaths, and migration must update population accounting.

Do not resolve every animal encounter individually across the globe. Use regional rates and scheduled encounters, with individual records for important creatures and locally significant events. Keep the rules consistent when a herd is on camera.

Domestic animals belong to households or enterprises, need pasture/fodder, and produce useful goods. Hunting reduces actual wildlife and yields resources once. Overhunting should be recoverable through lower pressure, migration, protected areas, or deliberate reintroduction.

A wolf entering a village should have a cause such as hunger, displacement, injury, learned behavior, or unusual magic. Avoid treating every predator as an automatic attacker.

### 9.3 Landscape history

Add persistent but compact states for managed forest, exhausted woodland, burn scars, regrowth, erosion-prone land, and restored habitat. Let roads and farms alter animal movement. Let old battlefields, abandoned farms, and reclaimed ruins become ecological niches.

Keep environmental recovery visible over time. A successfully protected valley should look and behave differently from an overused one. Provide map overlays and history so the user can connect the difference to past decisions.

**Acceptance:** resource use and environmental change remain bounded, no population becomes negative, distant ecology advances, and a long simulation avoids unexplained universal extinction or limitless growth across the test seeds.

## 10. Kingdoms, institutions, and conflict

Introduce these systems after settlements can feed, supply, and repair themselves. The existing realm labels provide setting, not evidence of implemented government.

### 10.1 Governments and local institutions

Define governments separately from territory and culture. Start with a monarchy/feudal realm, a council-based hold, and an alliance or clan confederation, using data-driven policy differences. Reuse one underlying decision framework rather than writing a different engine for each culture.

Useful institutions include councils, guilds, temples, noble households, military orders, merchant companies, and village assemblies. Each needs members/leaders, resources, goals, authority, and relationships.

Implement a few consequential policies first: food reserves, taxation/dues, road maintenance, public works, patrols, woodland access, and emergency relief. Display costs, beneficiaries, expected effects, and competing interests. Leadership AI should prioritize survival and obligations before expensive prestige projects.

### 10.2 Diplomacy, law, and information

Use specific treaties and obligations rather than a single friendship number: trade access, border passage, mutual defense, tribute, woodland rights, extradition, or a protected pilgrimage route. Track reasons for trust and grievance.

An agreement must have parties, conditions, duration, enforceable effects, and a breach path. Give diplomacy a cooldown and memory so governments do not alternate between war and peace every day.

Implement local justice as a bounded system: incident, evidence/report, jurisdiction, suspect, response, and resolution. Distinguish crime from combat and self-defense. Theft should transfer or lose actual property; guards should investigate or apprehend according to rules rather than stage an endless chase. Keep abstract penalties initially; detailed court drama can follow if it improves the experience.

Let information travel through couriers, visitors, markets, and institutions. Separate authoritative truth from a faction’s knowledge. A ruler can react to a stale report; the observer inspector can explain that error.

### 10.3 Dynasties and succession

Once people and households persist, add titles, inheritance, succession rules, legitimacy, and regencies. Treat a ruler’s death as a transition with several possible outcomes: orderly succession, negotiated compromise, disputed claim, or fragmented authority.

A claim should reference a rule and evidence, not a random label. Inherited obligations, debts, alliances, and rivalries make families matter. Preserve ordinary households alongside noble stories; a skilled mason’s apprenticeship line can be as memorable as a royal one.

Avoid a full genealogy for every decorative crowd proxy. Maintain detail for actual persistent residents and prominent relationships, with archival summaries for old generations.

### 10.4 Warfare with supply and aftermath

Start with local raids, patrol interception, escorts, and defensive actions. Add campaigns and sieges only after logistics and diplomacy work.

- Form forces from real available personnel and equipment; do not create soldiers from nowhere without a defined recruitment source.
- Track food, fatigue, morale, supply lines, leadership, and objectives.
- Make units use connected routes and valid crossings. Siege access must respect walls, gates, terrain, and engineering work.
- Resolve battle outcomes in one authoritative system whether or not the user watches. Render formations and engagements from that outcome model.
- Include scouting, deterrence, withdrawal, surrender, negotiation, and rescue. Victory need not mean extermination.
- Attach wars to concrete aims: passage rights, disputed land, tribute, liberation, retaliation, or control of a strategic site.
- Make peace terminate relevant objectives and transition occupations, prisoners, routes, and supplies coherently.
- Model recovery: injured people, displaced households, abandoned work, damaged farms, salvage, rebuilding, and memorials.

Use non-graphic presentation by default and configurable conflict frequency. An irreversible collapse cascade should be a deliberate scenario, not the normal consequence of adding warfare.

**Acceptance:** a raid can succeed or fail because of patrols, supply, terrain, and warnings; repeated camera changes cannot change its result; peace and rebuilding restore a functioning world.

## 11. Fantasy systems that alter the world

### 11.1 Magic as an ecology and infrastructure

Build on the existing ley lines, wonders, rituals, and magical regions. Define magical energy/resonance at a coarse regional or network level, with sites that accumulate, channel, consume, or disrupt it.

Each magical effect needs a source, prerequisites, cost, range, duration, limitations, and consequences. Examples:

| Practice | Benefit | Constraint | World interaction |
| --- | --- | --- | --- |
| Weather rite | Improves rainfall probability in a limited area | Skilled practitioners, materials, seasonal limits | Farming, river flow, neighboring water agreements |
| Hearth ward | Reduces ignition/spread risk or improves warning | Maintenance and ward materials | Public safety, building operation, emergency response |
| Healing craft | Improves recovery | Reagents, time, available practitioners | Labor, family welfare, clinics, rare-plant gathering |
| Enchanted tools | Better durability or specialized work | Expensive crafting and finite lifespan | Production, expertise, repair, trade |
| Waygate | Fast travel between prepared sites | Capacity, cooldown, cost, permissions, vulnerable anchors | Strategic logistics without making roads meaningless |
| Necromantic binding | A specific form of service or preservation | Defined consent/law/belief and resource rules for the scenario | Labor politics, identity, memory, religious disagreement |
| Grove covenant | Protects habitat and yields rare materials | Land-use restrictions and reciprocal obligations | Forestry, settlement expansion, fae relations |

Do not introduce unlimited food creation, costless teleportation, or effortless resurrection while relying on scarcity, distance, and mortality elsewhere. If a scenario permits such powers, explicitly change the affected economy and social rules.

Make magical incidents detectable and counterable: rituals, research, negotiations, protective infrastructure, relocation, or containment. Avoid an unending random debuff field with no explanation.

### 11.2 Five dragons, five roles

Preserve the five named dragons and their recognizable visual identities. The following are proposed mechanical personalities, not assertions about existing behavior beyond their current flight/perch definitions.

| Dragon | Proposed identity | Systemic role and choices |
| --- | --- | --- |
| Vermithrax the Ember King | Territorial power of Emberreach | Tribute, nesting protection, volcanic heat, negotiated passage; raids follow unmet needs or infringements rather than a repeating timer |
| Skarn Frostwing | Seasonal force of the northern ranges | Prey migrations, snowbound passes, cold disturbances, protection of a roost; caravans adapt their schedules |
| Old Aurum | A wandering historical constant | Rare sightings, pilgrimage, navigation lore, shared myths; preserve the mystery of its endless voyage |
| Nyxmaw | Nocturnal presence in the Gloamfen | Distorted reports, haunted routes, darkness-related needs, interaction with undead communities |
| Verdigris | Guardian or exploiter of recovering wild places | Forest health, relic sites, territorial bargains, conflict with expanding industry |

Give each dragon a persistent territory, current intent, condition, relevant relationships, remembered incidents, and resource needs appropriate to its nature. Use a utility/state system with explicit travel, rest, feeding, guarding, negotiation, and threat states. Do not make every dragon hunt livestock or attack settlements in the same way.

Breath effects must come from a committed action with target, range, cooldown, and consequence. A harmless display is also valid if labeled and animated as such. Dragon-caused fire or frost should use the same building/environment/incident systems as other causes.

Encounters can end with avoidance, tribute, sanctuary, a treaty, relocation, defense, or combat. Preserve rare creatures as sources of long stories rather than disposable event props.

### 11.3 Ruins, dungeons, and expeditions

Make landmarks persistent sites with history, ownership/claim, hazards, inhabitants, resources, and unresolved questions. Begin with abstract expedition resolution plus visible parties, entrances, and aftermath. Do not require a second full dungeon-crawling game immediately.

A party should form for a real reason: investigate a disappearance, recover a relic, map a ruin, secure a route, negotiate a bargain, or rescue someone. Require suitable members, supplies, travel, knowledge, and a return plan.

Resolve expeditions from site state, preparation, skill, equipment, risk, and seeded decisions. Store gains, losses, discoveries, relationships, and changed site conditions. Repeated visits should not reset a chest or revive a threat without an explicit regeneration rule.

Later add bounded interior scenes for selected sites. Use explicit gateways and a separate interior spatial representation; the current spherical heightfield cannot represent overhangs and underground rooms merely by adding terrain height noise. Offscreen and inspected expeditions must share outcomes.

### 11.4 Relics with provenance

Create important artifacts as persistent entities with creator/origin, owner, material, enchantment, location, and event history. A relic can be inherited, stolen, traded, recovered, lost, displayed, or broken. Ordinary tools can remain stacks; reserve unique records for items whose identity matters.

The Runeblade of Aurelion is an obvious existing landmark to develop. Its significance should emerge through a defined condition, institution, or history rather than a guaranteed reward popup. A shrine, guild, kingdom, and adventuring party may disagree about who should hold it.

### 11.5 Belief, culture, and knowledge

Let temples, festivals, schools, libraries, and oral traditions transmit beliefs and knowledge. Keep belief distinct from objective supernatural truth: people can interpret the same dragon sighting differently.

Use a small number of doctrine/practice preferences with actual consequences, such as burial customs, sacred groves, hospitality, pilgrimage, craft traditions, or oaths. Do not reduce religion to a happiness bonus or make a whole species inherently loyal to one god.

Knowledge can be stored in institutions, carried by people/books, lost through disaster, and rediscovered. Start with practical unlocks and information: a safer route, a crop technique, a bridge design, a reagent habitat. Avoid a huge linear technology tree that turns every culture into the same final town.

## 12. Memorable stories from interacting systems

Use the following as design fixtures and later scenario tests. They are authored situations built from reusable mechanics, not scripted sequences that force a predetermined ending.

### 12.1 The winter bridge

An early freeze closes an Ironpeak crossing. Deepdelve’s food imports stall; a merchant proposes a longer route, a council considers emergency reserves, and workers can repair or reinforce access. The user can watch the caravan, inspect why prices changed, or follow a household adapting to the shortage.

**Required systems:** weather, route closures, inventory, contracts, building repair, civic decisions, news.  
**Possible outcomes:** timely repair, expensive detour, relief treaty, temporary migration, or a lasting trade realignment.  
**Visible legacy:** a reinforced bridge, roadside shelter, memorial, or abandoned route.

### 12.2 The forest bargain

Timber demand from Highmoor expands logging near Silverbough. Habitat declines, magical materials become scarce, and a grove covenant is proposed. Human and elven institutions have internal disagreements rather than acting as uniform blocs.

**Required systems:** woodland renewal, production, land rights, diplomacy, culture, limited magic.  
**Possible outcomes:** managed forestry, alternate imports, restored grove, retaliatory sabotage, or a shared craft settlement.  
**Visible legacy:** coppiced woods, protected landmarks, mixed architectural details, and changed trade goods.

### 12.3 The dragon’s tithe

Emberreach negotiates safe passage with Vermithrax. A tribute convoy is delayed by a real route problem. The dragon’s response depends on history, need, knowledge, and alternatives; a courier may prevent an unnecessary confrontation.

**Required systems:** dragon intent, contracts, travel, diplomacy, information delay.  
**Possible outcomes:** renegotiation, rerouted tribute, an expedition to resolve the obstruction, a display of force, or a broken agreement.  
**Visible legacy:** protected roads, tribute platforms, watch activity, or damaged works.

### 12.4 A rumor becomes a pilgrimage

A witness reports Old Aurum passing near a shrine. Travelers spread several interpretations. Pilgrims bring trade and strain local food/housing. A village may create guesthouses and a market, while another town disputes the claim.

**Required systems:** report provenance, travel, beliefs, service capacity, construction.  
**Possible outcomes:** a seasonal festival, a short-lived craze, an enduring shrine, or a corrected story.  
**Visible legacy:** pilgrimage paths, inns, gifts, and an archive showing how the story changed.

### 12.5 The dead remember

A flood threatens Duskmere’s memorial records. Local residents seek help preserving names and possessions. This can reveal the undead settlement as a functioning community with priorities beyond attacking the living.

**Required systems:** flood risk, knowledge/artifact records, institutions, relief logistics, intercommunity trust.  
**Possible outcomes:** a shared archive, rescued relics, a new treaty, a haunting tied to an actual loss, or a later recovery expedition.  
**Visible legacy:** repaired memorial halls, archived names, flood defenses, and changed relations.

### 12.6 The wandering sanctuary

The Great Tortoise’s movements alter access to a rare habitat or traveling gathering site. Shepherds, traders, and scholars make different choices around it. Preserve its existing identity and animation while supplying a reason for its route.

**Required systems:** notable-creature state, seasonal habitat, trade/service demand, observation.  
**Possible outcomes:** a recurring fair, protected migration corridor, overuse followed by recovery, or a new route discovered by followers.  
**Visible legacy:** temporary camps, trails, seasonal markets, and recorded sightings.

### 12.7 Story direction without falsifying the world

Add a presentation director that identifies interesting changes, selects a useful camera suggestion, and summarizes a thread. It should score novelty, consequence, player bookmarks, and repetition fatigue.

Default incidents originate in world conditions. If optional dramatic scenario rules introduce exogenous events, make them explicit world rules with budgets and cooldowns. The director must never secretly change outcomes because the camera moved or the current session seemed quiet.

Use deterministic templates and structured event payloads first. Language models are optional future presentation adapters, never required to run the simulation and never authorities for inventory, history, character state, or outcomes.

Measure storytelling quality through traceable changes and follow-up actions. A peaceful year of recovery can be an excellent story.

## 13. Performance, reliability, and extensibility

### 13.1 Measure before changing the renderer

Retain the current vendored Three.js revision until there is a reason to upgrade. Add its exact revision and source/license information to project documentation. Custom shader patches, BatchedMesh behavior, and buffer ownership need targeted regression checks during any upgrade.

Profile CPU and GPU separately. Record simulation work, view extraction, chunk/scatter generation, geometry upload, shadow passes, post-processing, draw submissions, triangles, memory, worker queues, and UI update cost. An FPS average alone hides stalls.

Use deterministic benchmark scenes and report browser, OS, resolution, device, quality mode, seed, camera path, simulated duration, and warm-up. A useful desktop reference is the creator’s i7/RTX 4050 6 GB/32 GB machine if available, plus a lower-power integrated-GPU device. No performance measurements for those devices were made in this review.

Suggested initial goals, to revise after measurement:

| Metric | Initial goal |
| --- | --- |
| Balanced desktop exploration | Target 60 FPS at 1080p; report median and p95 frame times, with p95 around 25 ms or lower after warm-up |
| Lower-power/performance mode | Stable approximately 30 FPS at a documented resolution, with readable UI and the same simulation outcomes |
| Long sessions | No unbounded growth in retained entities, pending jobs, event subscriptions, or GPU resources during a repeated world tour |
| World time | Correct results at every speed; disclose achieved speed when CPU budget limits throughput |
| Input | Camera and primary controls remain responsive during generation, saves, and fast-forward |
| Streaming | No persistent holes, stale geometry, or resurrection of obsolete worker results after a mutation |

Treat these as engineering targets, not promises. Do not degrade simulation correctness to meet a screenshot benchmark.

### 13.2 Specific optimization work

- Replace avoidable hot-loop allocation with reused vectors/arrays after profiling identifies the relevant paths.
- Cache spatial queries for nearby residents, jobs, lights, incidents, and route edges. Replace local all-pairs scans where growth makes them expensive.
- Schedule decisions by due time and dirty state rather than evaluating every system for every entity on every frame.
- Keep DOM updates keyed and throttled to changed values. Virtualize long history and Atlas lists as they grow.
- Partition mutable structures and crowds into useful spatial batches when measurements justify it. Preserve efficient multi-draw/instancing; avoid one draw call per resident.
- `frustumCulled = false` on current global instance groups is not by itself proof of a bug. Introduce cullable cell groups only with correct bounds and measured benefit.
- Support capacity growth for mutable building batches and ensure geometry attribute layouts remain compatible. See [R2].
- Update instance buffers only when needed and maintain bounds after transform/geometry changes. See [R3].
- Give terrain, scatter, and save work separate bounded queues. Prioritize the current view without starving authoritative simulation.
- Add cancellation and stale-result checks for world revisions, camera-driven requests, scene resets, and imports.
- Keep adaptive quality based on sustained cost and hysteresis. Distinguish CPU pressure from GPU pressure; lowering resolution cannot fix an overloaded simulation scheduler.

### 13.3 Resource lifecycle and recovery

Each system must own and dispose of its listeners, workers, geometries, materials, textures, render targets, subscriptions, and temporary entities. Shared model resources need explicit ownership/reference rules. Removing a mesh from a scene is not equivalent to releasing GPU resources [R4].

Test repeated new-world/load-world cycles in one tab, failed saves, worker crashes, corrupted imports, and WebGL context loss. Restore the scene from authoritative state after context recovery. If recovery is impossible, explain the failure and offer the last good save/export rather than continuing a broken loop.

### 13.4 Scenario generation and prehistory

Keep the authored starting world as the default. Later offer a scenario setup with a seed, starting date, climate/conflict/magic intensity, population scale, and a few world rules. Every setting should describe its observable effect.

Optional prehistory can advance the same headless simulation before the player arrives. Start with short histories and bounded event budgets. Preserve consequential people, ruins, artifacts, treaties, and regional changes; compact routine events into yearly summaries. Do not fabricate a century of prose that contradicts the starting inventories or buildings.

Validate generated starts for viable food/water, reachable workplaces, connected travel where intended, and meaningful local diversity. Expose difficult or doomed starts as explicit scenario choices. Keep generation version and initial-state checksum in the save so a shared seed can be reproduced under the same content version.

### 13.5 Content definitions and modding

Move new goods, recipes, buildings, species traits, policies, magical practices, incident templates, and scenario rules into validated definitions. Keep model IDs and meaningful content IDs stable and namespaced.

Add validation for duplicate IDs, missing references, invalid units, missing models, impossible recipes, disconnected required travel endpoints, and absent localization keys. Make errors identify the definition and field.

Provide a small example content pack once the built-in pipeline is stable. Start with data-only packs; arbitrary JavaScript plugins create a different trust and compatibility problem and are not required for the first modding milestone.

Separate world-generation version from save schema and content-pack versions. Record a manifest in each save. A generation update must not silently move a town underneath an existing household.

## 14. Delivery order and completion gates

Use milestone names internally rather than inventing a release number on behalf of the maintainer. Keep each milestone playable, documented, and independently reviewable.

| Milestone | Deliverables | Completion gate |
| --- | --- | --- |
| **M0 — Trustworthy baseline** | Reproducible source/browser baseline; F01–F05 fixes; event RNG separation; deterministic IDs; path validation; UI state corrections; README and benchmark protocol | Original tests pass; new regression cases reproduce old defects and pass after fixes; no fabricated visual claims |
| **M1 — Persistent living region** | Headless kernel, saves, resident/household records, jobs, food/timber inventory, real shipments, dynamic building lifecycle; complete Section 8 | Fire/relief/rebuild slice works watched and unwatched, at all speeds, across save/load; resource ledger balances |
| **M2 — Readable and beautiful world** | Art-direction gallery; terrain/town transitions; state-driven models/materials; inspectors; searchable Chronicle/Atlas; camera/input fixes; initial audio | Browser shot matrix approved; keyboard/touch workflows pass; meaningful visual improvement within measured budgets |
| **M3 — Seasons and livelihoods** | Climate/water model, agriculture, domestic animals, ecological populations, migration, expanded production/services | A multi-year run shows variation and recovery without unexplained collapse or runaway resources |
| **M4 — Societies and history** | Institutions, treaties, civic policies, succession, justice, patrols, limited conflict and recovery | Decisions have inspectable causes; distant outcomes remain consistent; peace and succession resolve cleanly |
| **M5 — A world of legends** | Distinct dragon AI, bounded magic, expeditions, relic provenance, rumors/belief, several Section 12 scenarios | Fantasy changes ordinary systems and leaves lasting history; multiple plausible outcomes exist |
| **M6 — Breadth and longevity** | Richer cultures, selected interiors, alternate scenarios, content packs, long-run profiling and polish | Content validation, save migrations, endurance suite, and usability tests remain reliable |

Within a milestone, simulation, presentation, content, and validation can progress independently only after their interfaces are agreed. A visual system must not invent authoritative state to avoid waiting for its dependency.

Do not begin with multiplayer, an MMO backend, full procedural planet tectonics, general fluid dynamics, a complete action RPG, arbitrary runtime scripting, or an engine replacement. These are separate product decisions. The current browser-first world can become much richer without them.

## 15. Validation and definition of done

### 15.1 Keep and broaden the tests

Preserve the seven existing tests. They verify useful rendering support behavior but do not establish correct simulation, screenshots, or playable long-run behavior.

The current `npm test` command names only `tests/render.test.mjs`. Update test discovery when adding suites; otherwise new tests can exist without running. Keep pure simulation tests runnable without a browser or WebGL. A practical Node entry point can use the existing Three.js import hook for legacy geometry tests while discovering all relevant test files.

Prioritize invariant and behavior tests over tests that merely repeat implementation details.

| Test group | Required cases |
| --- | --- |
| Identity and persistence | Leave/revisit; different first-visit order; save/load; stable ID references; missing/dead/archived selected entity |
| Time | Same canonical tick at 1×/4×/16×/64×; 30/60/144 FPS presentation schedules; pause/resume; long frame; hidden-tab resume |
| Determinism | Same seed and commands with different cameras, view activation, quality settings, worker timing, and pause durations |
| Event history | More than 60 entries; at least 10,000 unique event IDs; archived references; rumors referencing existing events; no duplicated incident resolution |
| Resources | Reservation contention; canceled work; atomic transfers; losses accounted; nonnegative stocks; duplicate arrival attempts; perishable cargo |
| Jobs and needs | Missing inputs; unreachable workplace; worker interruption; replacement worker; recovery after supply resumes; no idle-worker deadlock |
| Navigation | Disconnected streets; building obstacles; gate closure; damaged bridge; route replacement; unreachable destination; recovery without teleportation |
| Maritime routes | Every final route sample in valid water; port approaches; draft; constrained smoothing; narrow straits; dateline and cube-face transitions |
| Buildings | Construction stages; capacity changes; missing model handling; updated anchors/bounds/height; damage/repair; worker stale-result rejection |
| Offscreen simulation | Watched/unwatched equivalence; promotions/demotions if introduced; no duplicated people, cargo, harvests, or combat outcomes |
| Environment | Bounded temperature/water/populations; seasonal transitions; resource renewal; drought/flood recovery; no negative ecological counts |
| Politics and conflict | Treaty start/expiry/breach; succession; recruitment accounting; supply interruption; retreat/surrender; peace and reconstruction |
| Saves | Mid-shipment, mid-fire, mid-build, mid-succession; old-schema fixtures; corrupt/truncated import; full storage; interrupted write; concurrent tabs |
| Workers and lifecycle | Startup failure; job failure/timeout; fallback once; cancellation; stale generation; repeated world reload; disposed resources |
| Accessibility/UI | Hidden-panel focus; expanded states; keyboard selection/follow; long names; text scaling; mobile drawers; safe imported text |

For determinism, compare canonical state with a stable serializer/hash that excludes presentation caches, wall-clock timestamps, GPU data, and purely cosmetic RNG. Sort maps/sets explicitly. Test worker results arriving in different orders. Floating-point accumulation should not silently influence conserved goods or authoritative decision ordering.

### 15.2 Browser visual acceptance matrix

Capture repeatable before/after images and short camera paths on a functioning WebGL browser. Record commit, seed, time/weather, resolution, DPR, quality, camera parameters, and whether external fonts loaded.

| Scene | What to inspect |
| --- | --- |
| Initial globe arrival | Loading feedback, continent readability, limb glow, clouds, labels, clear controls |
| Highmoor overview and market | Building hierarchy, paths/doors, population, work readability, label density, panel layout |
| Highmoor close follow | Feet/ground contact, tools, anchor use, selection, camera collision, character identity |
| Saltmere harbor | Shoreline, docks, navigable approaches, loading, water/material contact, ships with valid cargo |
| Brightwater mill | Water flow, wheel alignment, operational/idle differences, inputs and outputs |
| Khaz Durak / Deepdelve | Mountain integration, entrances, terraces, industrial silhouettes, lighting |
| Silverbough / Moonwell | Canopy visibility, bridges, restrained glow, readable paths and residents |
| Thistledown / Wyrdring | Unusual scale, magic focal points, effect readability, reduced-motion behavior |
| Fanghold / Tuskport | Cultural identity, grazing/trade activity, landscape adaptation |
| Cinderhold / Mount Cindermaw | Dark materials, lava/ash, emissive detail, dragon scale and safe visual intensity |
| Duskmere at night | Navigability, moon/lamplight, fog, inhabited character, readable dark silhouettes |
| Frostreach | Snow transitions, pass geometry, pale-material contrast, Skarn’s behavior |
| Each dragon flying and landing | Anatomy, silhouette, banking, wing folding, ground clearance, breath origin, follow framing |
| A burning then rebuilt granary | Clear incident stages, responders, effects, persistent damage, repaired function |
| Globe → street → globe tour | LOD continuity, streaming, instance growth, label transitions, stable performance |

Run at minimum a desktop viewport, a 16:10 viewport, and a narrow touch viewport. Verify balanced/performance/cinematic presets where supported, day/night/overcast conditions, reduced motion, and 200% text scaling. Exercise Chromium and Firefox; add Safari/WebKit coverage where the project intends to support it. Do not equate software-rendered CI FPS with real GPU performance.

**Visual failure conditions:** persistent holes/seams, buildings floating or buried, ships passing through land, people traversing solid walls, clipped tools, unreadable nights, bloom hiding useful detail, unexplained actor popping, unstable shadow/light assignment, or panels blocking necessary controls.

### 15.3 Long-running simulation and balance

Create deterministic scenario fixtures: a healthy connected region, isolated village, difficult winter, drought, blocked trade route, empty workplace inputs, fire during harvest, leadership death, and a supernatural disturbance.

For each supported milestone, run a short regression sweep and a longer endurance run. Suggested initial endurance target is ten simulated years across ten seeds/configurations, with the default authored world included; revise duration based on what the systems actually model. Report population, food security, jobs blocked, wealth/resource distributions, trade completion, incident frequency, ecological stability, and recovery time.

Look for pathological attractors: everyone starving, everyone becoming a guard, all wealth trapped in one institution, permanent cargo queues, infinite rebuilding, endlessly repeated rumors, wars that never terminate, or a dragon destroying its only food source without adapting.

Do not secretly reset the world to pass endurance tests. Fix the decision rules, add visible recovery mechanisms, or make a destructive scenario explicitly opt-in.

### 15.4 Usability and enjoyment checks

Ask a tester unfamiliar with the implementation to complete these tasks without a developer explaining the UI:

1. Find Highmoor and follow someone to work.
2. Explain why a building is idle.
3. Find where a shipment came from and what it carries.
4. Identify why food availability changed.
5. Follow a rumor to its source and distinguish it from confirmed history.
6. Pause, visit another region, and inspect it without time advancing.
7. Save during an incident, reload, and find the same people and event.
8. Observe a dragon and explain its current goal.
9. Locate a remembered event after it leaves the live Chronicle.
10. Understand what a proposed stewardship intervention would cost and change.

Measure task success, confusion, and the explanations testers give. The world should be interesting before they learn its internal data structures.

## 16. Instructions for the implementing coding agent

### 16.1 Start here

1. Read the current repository and any current `AGENTS.md` instructions before editing. Compare its HEAD with the reviewed commit. If it has advanced, reconcile this handoff against the new code and mark already-completed findings accordingly.
2. Run the current tests and launch the app through `npm start`; do not use `file://` for ES modules/workers.
3. Record baseline console errors, a browser walkthrough, representative screenshots, and measured performance. Keep environment failures separate from application defects.
4. Read the source in this order: `package.json`, `src/main.js`, `world/atlas.js`, `world/build.js`, `world/field.js`, `world/settlements.js`, `world/structures.js`, `life/people.js`, `life/traffic.js`, `life/events.js`, `life/wildlife.js`, `life/dragons.js`, `core/camera.js`, `ui/hud.js`, and the renderer/worker modules.
5. Reproduce F01–F06 and write narrowly targeted regressions. For the sea-lane test, validate the final world after local streets/features are added as well as the base generated geography.
6. Introduce the smallest authoritative state/clock/ID layer needed to fix them without replacing the working visual world.
7. Implement persistence and the Valdren grain/fire slice. Wire existing models, anchors, vehicles, effects, Atlas, and Chronicle to real state.
8. Complete the milestone’s browser, save/load, deterministic, and endurance checks before broadening content.

Current baseline commands:

```sh
npm test
npm start
node tools/map.mjs 1200 -90,90,-180,180 map.png
```

The last command generates a diagnostic terrain preview, not an in-game screenshot. Add explicit scripts for content validation, headless scenarios, browser tests, and benchmarks as those tools become real.

### 16.2 Requirements for each feature implementation

For each new system or substantial enhancement, deliver:

- The user-visible behavior and why it improves the world.
- Data definitions and migration implications.
- Clear ownership of authoritative state versus presentation.
- Inputs, decisions, outputs, costs, failure states, and recovery.
- Integration with at least one existing system where appropriate.
- Visual representation and an inspector explanation.
- Offscreen and pause/fast-forward behavior.
- Save/load behavior and bounded resource usage.
- Meaningful regression/invariant coverage.
- A small reproducible scenario demonstrating the result.

A feature is incomplete if its only evidence is a Chronicle sentence, a static counter, an animation, a TODO stub, or a menu option with no real consequence.

### 16.3 Preserve and migrate deliberately

Keep the default map, recognizable locations, named dragons, and procedural art assets unless a documented problem requires a change. When moving a port, road endpoint, or plot to correct invalid geography, preserve IDs and provide a migration strategy for existing world state.

Retire legacy event spawners and decorative economic behavior when their authoritative replacement is active. Use temporary compatibility adapters or feature flags only where they prevent duplication and have a clear removal point.

Do not assert completion from passing the existing seven tests. Do not invent benchmark numbers, screenshots, successful save migrations, supported browsers, or implemented mechanics. Record what was tested and what remains unresolved.

### 16.4 Documentation and delivery

Add concise project documentation covering setup, controls, architecture, simulation units, determinism rules, saves, content definitions, supported browsers, and performance testing. Document the project’s intended license separately from third-party licenses; obtain the maintainer’s choice before selecting a new license for their code. Keep third-party asset/font/library attribution with the assets.

For each milestone, summarize the concrete before/after behavior, relevant test results, visual comparisons, migration effects, and remaining limitations. Maintain a small issue list keyed to finding IDs and milestone gates rather than scattering TODOs through unrelated files.

The release should be considered ready when the default world is pleasant to explore, its systems can explain their behavior, time and persistence are reliable, and new mechanics leave observable lasting consequences.

## 17. Source map and research references

### 17.1 Repository evidence

All links below are pinned to the reviewed commit, so later changes do not silently alter the audit’s evidence.

| Evidence | Source |
| --- | --- |
| Bootstrap, rendering setup, time split, app lifecycle | [src/main.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/main.js), especially the frame step around lines 164–202 |
| Clock, day length, local hours and celestial cycles | [src/render/sky.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/sky.js) |
| Residents, schedules, navigation, activation and recreation | [src/life/people.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/people.js), including `Nav.path`, `SiteSim`, and `People.update` |
| Event IDs, camera bias, rumors and staged incidents | [src/life/events.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/events.js) |
| Traffic routes, shuttle movement and sea-vessel height | [src/life/traffic.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/traffic.js) |
| Authored geography, sites, cultures, routes and dragons | [src/world/atlas.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/atlas.js) |
| Terrain field and derived roads/rivers/sea lanes | [src/world/field.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/field.js), [src/world/build.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/build.js) |
| Layout, construction-stage selection, batch/anchor lifecycle | [src/world/settlements.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/settlements.js), [src/world/structures.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/world/structures.js) |
| Model grammar and culture assets | [src/models/kit.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/models/kit.js), [human.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/models/human.js), [cultures.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/models/cultures.js), [characters.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/models/characters.js) |
| Wildlife and dragons | [src/life/wildlife.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/wildlife.js), [src/life/dragons.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/life/dragons.js) |
| Materials, atmosphere, grade, quality, local lights | [src/render/materials.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/materials.js), [post.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/post.js), [quality.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/quality.js), [nightlights.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/render/nightlights.js) |
| Camera, selection, panels and CSS | [src/core/camera.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/core/camera.js), [src/ui/hud.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/ui/hud.js), [src/ui/style.css](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/ui/style.css) |
| Terrain jobs and fallback | [src/terrain/pool.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/terrain/pool.js), [worker.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/terrain/worker.js), [terrain.js](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/src/terrain/terrain.js) |
| Test scope and diagnostic map | [tests/render.test.mjs](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/tests/render.test.mjs), [tools/map.mjs](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/tools/map.mjs), [package.json](https://github.com/otectus/Sosaria/blob/3e75e4dc3cd6a77331f556810c770a42e15a3f89/package.json) |

### 17.2 Primary technical references

The implementation proposals are tailored design recommendations, not claims that these references prescribe Sosaria’s architecture. Verify APIs against the project’s pinned Three.js revision before using current documentation examples.

- **[R1] Three.js — Color Management:** https://threejs.org/manual/pages/color-management.html. Reference for the linear working space and final display conversion; preserve the current custom pipeline’s single conversion.
- **[R2] Three.js — BatchedMesh:** https://threejs.org/docs/pages/BatchedMesh.html. Reference for geometry layout compatibility, capacity, instance changes, and bounds.
- **[R3] Three.js — InstancedMesh:** https://threejs.org/docs/pages/InstancedMesh.html. Reference for buffer updates, per-instance transforms, bounds, and instance-resource lifecycle.
- **[R4] Three.js — Cleanup:** https://threejs.org/manual/pages/cleanup.html. Reference for explicit disposal and resource ownership.
- **[R5] MDN — IndexedDB API:** https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API. Reference for structured asynchronous persistence and transactions.
- **[R6] MDN — Storage quotas and eviction criteria:** https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria. Reference for quota/error handling and why exportable backups matter.
- **[R7] W3C — WCAG 2.2 Quick Reference:** https://www.w3.org/WAI/WCAG22/quickref/. Reference for keyboard access, focus, contrast, reflow, targets, and motion guidance.
- **[R8] Glenn Fiedler — Fix Your Timestep!:** https://gafferongames.com/post/fix_your_timestep/. Primary engineering discussion informing bounded fixed-step scheduling. Sosaria’s proposed minute-based scheduler and multi-rate systems are adaptations, not code copied from that article.
- **[R9] MDN — Using Web Workers:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers. Reference for background execution and message/transfer boundaries.
- **[R10] MDN — WebGL context loss:** https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost. Reference for detecting context loss and designing recovery.

### 17.3 Design inspiration, with limits

- **Dwarf Fortress, official feature overview:** https://www.bay12games.com/dwarves/features.html. Its persistent history, linked people/sites, institutions, and revisitable worlds suggest the value of continuity. The recommendation here is to adopt that principle at a manageable browser scale, not recreate its full simulation or interface.
- **RimWorld, official overview:** https://rimworldgame.com/. Its emphasis on people, relationships, needs, and emergent stories suggests prioritizing legible personal consequences. Sosaria should retain an autonomous world and use its presentation director to surface stories, with deliberate scenario rules governing any added drama.

The distinguishing opportunity for Sosaria is the combination of continuous globe-to-street exploration, authored fantasy geography, visible daily life, and a durable causal history. Build that combination deeply, then expand its breadth.
