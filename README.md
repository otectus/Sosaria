# Sosaria

An explorable fantasy planet in the browser: a hand-drawn globe of kingdoms, holds, glades and dragon country that you can descend into, street by street, and watch live. Version 0.2.0 adds a persistent, deterministic simulation underneath the scenery. Every person you see is a saved resident with a household, a job and a reason for what they are doing. The Valdren grain network (Millbrook, Brightwater, Highmoor and Saltmere) runs as a real economy: harvests, milling, baking, trade, fire, relief and repair.

## Run it

Requirements: Node.js 22.15 or newer (tested with 26.12.1) and a desktop browser with WebGL 2, ES modules, import maps, module workers and IndexedDB.

```sh
npm start            # serves the project at http://localhost:5173 (pass another port: npm start -- 5174)
```

Open the printed address. The app must be served over HTTP; opening `index.html` from disk cannot load ES modules or workers. There is no build step and there are no npm dependencies. Three.js is vendored.

## Controls

| Action | Pointer | Keyboard |
| --- | --- | --- |
| Turn the globe / pan | drag | W A S D or arrow keys |
| Rotate and tilt | right-drag, middle-drag or Shift-drag; two-finger twist | Q E rotate, R F tilt |
| Zoom | scroll; pinch | + and − |
| Dive to a point | double-click | |
| Inspect something | click it (a small list appears when several things overlap) | I reopens the inspector |
| Follow the selection | "Follow" in the inspector | G; Esc stops |
| Pause, speed | toolbar | Space; 1–4 for 1×, 4×, 16×, 64× |
| Atlas, Chronicle, World and saves | toolbar | M, C, O |
| Overview, back, face north | compass button | H, B, N |

Panels close with Esc and return focus to the control that opened them. On narrow screens one drawer is shown at a time. Settings (gear button) offer visual quality, reduced motion and calm effects (no flashing, softer glow).

## What you can do in 0.2.0

- **Follow a life.** Click a resident in Highmoor. The inspector explains the current task ("Why this task?"), household, needs, memories and acquaintances. Leave the town, save, reload: it is the same person.
- **Trace a sack of grain.** Millbrook farmers harvest, Brightwater millers grind, Highmoor bakers bake. Wagons carry manifests along the generated roads, and the inspector shows the cargo, carrier, route, ETA and contract terms.
- **Watch the granary burn (as an experiment).** World → Experiments starts a separate branch. A test fire triggers an alarm and response roles (bucket lines limited by approach space and the well), damage, recorded losses, rationing if food runs short, relief from neighbours by real roads, and a staged repair that consumes timber, stone and labour.
- **Read history with its causes.** The Chronicle is searchable and labels observed events, carried reports, rumours and legends. Every entry opens "Why did this happen?" and "What changed?".
- **Keep worlds.** Manual save slots, three rotating autosaves, export/import files, a recovery snapshot per slot, and one-time migration of a 0.1 (localStorage) world.

Elsewhere, the other 32 settlements have persistent residents and households living by a documented subsistence economy. Dragons, wildlife and decorative road and sea traffic are presentation in this release and say so when inspected.

## Project layout

```
src/content/      data: calendar, goods, recipes and projects, occupations and species, the scenario, validation
src/sim/          the headless kernel: clock, RNG streams, IDs, scheduler, residents, jobs, households,
                  markets, travel, buildings, incidents, history, commands, snapshots, migration, read models
src/persistence/  IndexedDB and in-memory save backends, the save service and the world lock
src/world/        authored atlas, terrain field, roads, settlement layout, walkable graphs, sea routes, structures
src/life/         views of simulation state: residents, journeys, incident effects; ambient wildlife and dragons
src/render/       Three.js materials, sky, water, clouds, particles, post-processing, lights
src/ui/           HUD, panel controller, inspector, Chronicle, World and saves panel, prose templates
tests/            Node test suites (no browser or WebGL needed)
tools/            scenario, endurance, validation, browser check, terrain map
docs/             architecture, simulation rules, saves, benchmark protocol, issue list, earlier design notes
```

Further reading: [architecture](docs/architecture.md) · [simulation rules and units](docs/simulation.md) · [saves](docs/saves.md) · [benchmark protocol](docs/benchmark-protocol.md) · [issues and milestone gates](docs/issues.md) · [changelog](CHANGELOG.md).

## Checks

```sh
npm test                    # 80 Node tests: clock, identity, history, sea routes, buildings, determinism,
                            # navigation, resources, jobs, the grain-network slice, saves, workers, content
npm run validate            # content definitions, sea routes, walkability and required roads
npm run test:scenario       # the granary-fire slice with an event trace and a balanced resource ledger
npm run test:endurance -- --years 10 --seeds 10 --json results.json
npm start -- 5174 & npm run test:browser   # headless Chrome integration check (see below)
npm run map -- 1200 -90,90,-180,180 map.png  # diagnostic terrain preview, not an in-game image
```

The browser check drives a separate headless Chrome profile (default `/opt/google/chrome/chrome`; override with `CHROME_BIN`, `SOSARIA_TEST_URL` and `SOSARIA_TEST_ARTIFACTS`). It covers panels and focus, Atlas search, paused travel, inspectors, a fire experiment, IndexedDB reload, export/import, pause, Chronicle causes, WebGL context loss, a read-only second tab and the narrow layout. Headless Chrome renders in software (SwiftShader); its timings are diagnostics, not performance claims.

## Browsers

Tested in this release: headless Chrome 154 on Linux (SwiftShader) through the browser check. Intended: current Chromium-based browsers, Firefox and Safari with WebGL 2. Firefox and Safari have not been exercised for 0.2.0, and no real-GPU performance pass has been recorded (see [issues](docs/issues.md)).

## License

The maintainer has not chosen a license for Sosaria's own code and content yet; until then, all rights are reserved. Third-party components keep their own licenses: see [THIRD_PARTY.md](THIRD_PARTY.md).
