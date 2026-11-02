# Architecture

Sosaria has three responsibilities, kept apart:

1. **World definition**: authored geography and content. `src/world/atlas.js` (places, roads, lanes, dragons), `src/content/*` (calendar, goods, recipes, occupations, species, scenario), and the model registry. `src/world/definition.js` turns these into one final world: terrain and roads (`build.js`), settlement layouts (`settlements.js`), street flattening, then sea routes validated against that final terrain (`sealanes.js`).
2. **Authoritative simulation**: `src/sim/*`. A headless kernel with no Three.js, DOM, camera or wall-clock dependency. It owns every persistent record, the clock, the random streams, commands, history and saves.
3. **Presentation**: `src/life/*`, `src/render/*`, `src/world/structures.js`, `src/ui/*`. These read simulation state, draw it and submit commands. They never decide outcomes.

`src/main.js` composes these and owns the lifecycle: loading, the frame loop, the error state, WebGL context loss, autosave and `app.dispose()`.

## The catalog: immutable simulation inputs

`catalogFromWorld(world, sites)` (`src/sim/catalog.js`) derives what the simulation needs from the authored world. Nothing in it is saved; it is rebuilt on load and identified by a signature that saves must match.

- **Places**: settlement metadata, an integer minute offset from longitude, buildings with a *use* (home, farmstead, barn, granary, mill, bakery, tavern, smithy, temple, keep, guard post, construction), points of interest (doors, fields, docks, wells, stalls, woodland edge, plaza, yard, hall), and the stores each role draws on.
- **Walkable graphs** (`src/world/navgraph.js`): street polylines become weighted edges, crossings and T-junctions are joined, and every point of interest connects to a street only by a connector that does not pass through another building or wall. Disconnected street fragments are joined across short, clear open ground; anything still unconnected is marked unreachable. Every point of interest in the four detailed towns is reachable (`npm run validate`).
- **The travel network**: 29 road edges with travel times and the bridges they cross, plus harbour-to-harbour sea edges from validated routes.

## State contracts

The saved world (`state`, schema 2) is plain JSON, referenced only by stable IDs. It holds the header (schema, content and generation versions, scenario, catalog signature, seed, tick, ID allocators, random stream states, rules, interventions, branch origin), the stores (settlements, households, residents, buildings, fields, inventories, jobs, projects, shipments, contracts, incidents, closures, droughts, relations), history (live events, archive, yearly summaries, reports, commands), the due-work queue, and the resource ledger. Nothing in a save is a Three.js object, closure, worker handle or DOM node.

| Record | Key fields |
| --- | --- |
| Resident | ID, name, species, culture, faction, occupation, age, skill, traits, household, home site, current site and graph node, needs, health, task (from, to, departure, arrival, end, reason), job, memories, ties, journey |
| Household | members, home building, displaced flag, hunger days, migration (with origin, for return) |
| Building | use, condition, stage, current model, project, incident, last incident |
| Project | kind, stages (materials, labour, model), delivered and inbound materials, booked labour, crew, status, blocked reason, cause |
| Job | recipe, worker, steps (fetch, work, deliver), per-store reserved fetches, labour, outputs, field, building or project |
| Shipment | kind, contract, carrier, travellers, vehicle, route edges and nodes, leg timing, status, wait reason and progress, cargo (its own inventory), carried news |
| Contract | buyer, seller, goods, terms (sale, gift, credit), escrowed coin, status, negotiation end, cause |
| Incident | building, status, ignition, detection, alarm, intensity, fuel, responders by role, water used, damage, losses, salvage, outcome, linked events |
| Event | ID, tick, kind, place, actors, causes, payload, importance |
| Report | event, origin, destination, carrier, shipment, sent, arrived, hops, confidence |

Species, culture, faction and occupation are separate fields; Highmoor and Saltmere include residents of other species.

## Kernel flow

`stepWorld` (`src/sim/kernel.js`) advances one tick (one in-world minute): it pops every due queue item in `(tick, priority, entity, sequence)` order (resident decisions, settlement dawns, journey arrivals, half-hourly contracts, hourly weather and ignition checks), runs active fires, and once per calendar day compacts history and expires stale jobs; once a week it also collects realm dues and pays grants. Commands (`command()`) are validated before anything is committed and recorded with an `intervention` event.

`Simulation.advance(elapsed, speed, paused)` converts real time into whole ticks with an exact rational accumulator, runs them within a per-frame time budget, carries a bounded debt, reports achieved speed and halts at once on pause. A thrown error stops the kernel (`faulted`); the app then refuses to save, so a half-applied tick never replaces the last valid save.

## Presentation as projection

- `life/people.js`: a `SiteView` per active town holds one figure per resident present. Each frame it interpolates the resident's authoritative task along the same walkable graph, spreads figures that share a spot into a ring, and hides those inside. Town activation follows the camera and real time, never world time, so paused travel streams normally.
- `life/traffic.js`: tracked journeys are drawn from their current leg and progress; ambient road, river and sea traffic stays decorative, is labelled as such, and is kept off lanes that carry tracked sea trade.
- `world/structures.js`: the render adapter for buildings. `applyState` follows each building's model, condition, incident and project. `setModel` registers later-stage geometry, growing the `BatchedMesh` if needed, then rebuilds anchors, updates the roof-height lookup and bounds, and publishes the change.
- `life/events.js`: flames and smoke scale with a fire's intensity, using cosmetic randomness only.
- `ui/*`: one panel controller (`panels.js`); the inspector, Chronicle and World panel read structured facts from `sim/explain.js` and history, and turn them into prose with `ui/text.js`.

## Invalidation and revisions (finding F11)

- **Buildings**: every render-side change goes through `Structures.emit` (`onChange` subscribers). Night lights rebuild their candidates when anchors change.
- **Terrain workers**: jobs carry a world revision. `WorkerPool.invalidate()` bumps it and re-initialises worker fields; a result built for an older revision is rejected as `stale` and the chunk or scatter cell is requested again.
- **Walkable graphs**: closures (for example around a fire) are applied as keyed blocked-node sets, so cached distances for one closure set are never reused for another.

## Failure handling (finding F12)

The terrain pool has an idempotent, shared fallback start, a per-job timeout with one retry on the main thread, cancellation through `AbortSignal`, typed `JobError` codes (`timeout`, `cancelled`, `stale`, `failed`) and `dispose()`. The app shows a recoverable error dialog instead of looping on a broken frame, explains WebGL context loss and resumes on restore, and autosaves on context loss and when the tab is hidden.

## Determinism rules

- Authoritative code reads only the state, the catalog and the tick. It never reads the camera, the DOM, frame time or `Math.random`.
- Randomness comes from named, saved streams (`sim/rng.js`): weather, economy, households, incidents, travel, people, plus lazily created per-actor streams. Initial conditions use stateless hashes of the seed and an ID.
- Due work runs in a total order; entity iteration uses insertion or explicitly sorted order; conserved quantities are integers.
- Equality is checked on a key-sorted canonical serialization (`snapshot.canonical`) hashed with SHA-256 in tests and with a 26-hex-digit string hash in the app.
