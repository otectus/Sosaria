> **Historical (0.1).** This describes the first living-world release of 27 September 2026. Version 0.2.0 replaces its simulation, saves and interface; see the [README](../README.md) and [CHANGELOG](../CHANGELOG.md). Worlds saved by 0.1 are migrated automatically ([saves](saves.md)).

# Living world: first playable release

This implements the first-release scope selected from [the blueprint](Sosaria_Living_World_Blueprint.md): continuity, named residents, a recoverable incident, material trade, carried knowledge, and limited interventions. The globe and its authored places remain the setting.

## Try the story

Run `npm start` and open the printed local address. Use **Atlas → Highmoor** to open the town register. **World** reopens the register; its settlement selector also lets you visit Brightwater and Millbrook.

- The default history seed is `sosaria-living-1`. Highmoor starts in the morning. One full day is 420 world seconds; 1×, 4×, 16× and 64× share one clock. Pause freezes the simulation. A hidden tab pauses; returning does not simulate time spent away. A catching-up indicator means pending ticks are still being processed.
- Follow a named guard from the register, leave the town and return. The persistent cast contains 147 people across the existing 36 settlements. The rest of each town is a cohort represented by ambient figures near the camera. At most three towns have detailed local crowds.
- The introductory Highmoor fire starts at world second 90 in suitable weather. Bucket carriers reduce damage, the roof retains a scorched tint, and repair scaffolding appears while work proceeds. **Fund repair** spends 12 town coin, 6 timber and 1 tool and completes after 90 world seconds. Otherwise the town schedules its own slower repair. The repair record links back to the fire and intervention.
- Millbrook supplies grain to Brightwater; Brightwater mills flour for Highmoor's bakers. The **Journeys** tab shows known manifests, carriers, status and ETA. A tracked wagon reserves stock at departure and transfers it once at arrival. Merchants rest at the destination and make a return journey. Ambient travellers are explicitly labelled as having no tracked cargo.
- **Road watch** spends 2 town coin to inspect a connecting road for 90 world seconds. Cargo and reports wait, then resume. A shortage changes bread availability and the baker's activity; river fish provide a recovery floor.
- The **Chronicle** contains learned local records, carried reports, and explicitly unverified legends. Visit a town to consult its current register. Reports arrive on actual connecting journeys. Open an account to inspect its source and known causes, or request a courier. Visiting and inspecting do not change simulation outcomes.

## Save and resume

**World → World & saves** provides manual save, JSON export/import, and a history seed for a new world. Names and incident selection use the seed; terrain stays authored. Autosave runs every 30 real seconds and on page exit/visibility changes.

The initial format is schema v1, stored separately from graphics and observation preferences in browser local storage. It records dynamic world state, not meshes or terrain. A rotating previous snapshot supports recovery; export a file to retain an independent world. Invalid, future-version, incompatible-layout, and inconsistent saves are rejected before replacing the running world. An unreadable primary is retained separately on the next successful save. Subsecond render interpolation is intentionally not serialized.

## Validation commands

- `npm test`: rendering tests and deterministic simulation scenarios, including all offered speeds, pause/backlog handling, observer independence, resident continuity, save/reload, fire eligibility/recovery, interrupted cargo/report timing, return travel, material conservation, and bounded multi-week histories.
- `npm run test:scenario`: generates the actual atlas and runs seven days, including a save/reload comparison. Prints the state hash, archive size, rule timings, and all eight material-balance residuals.
- `npm start -- 5174`, then `npm run test:browser`: launches a separate headless Chrome profile and exercises the rendered application. Chrome defaults to `/opt/google/chrome/chrome`; override with `CHROME_BIN`. Set `SOSARIA_TEST_URL` for another server and `SOSARIA_TEST_ARTIFACTS` for another artifact directory. The default is `/tmp/sosaria-browser-check`.

The browser check covers an orbit/town/fire tour, resident revisit, reload during a fire and trip, funded repair, manifested cargo follow, JSON round trip, invalid import rejection, speed/pause controls, and a 390-pixel mobile viewport. **World & saves → Performance & reproducibility** shows live frame, rule, draw-call and heap measurements. Headless SwiftShader timings describe software rendering, not a representative gaming GPU or a 60-FPS acceptance result.

## Deliberate boundaries

Production and consumption are active in the three-town material chain. Other cultures retain named residents and bounded baseline reserves; their full needs and economies are later work. There are no new raids, casualties, dynasties, harvest seasons, ecological recovery, or realm wars in this release. Existing fantasy scenery, dragons and ambient wildlife remain available to observe, with the shared clock. Storm trajectories are shared between rendered clouds and fire eligibility; a new seasonal climate system is deferred.

History is a bounded recent archive, with explicit notices when earlier causes have been archived. This is not reverse simulation or an unlimited historical database. The browser checks are scripted integration checks, not a twenty-minute human playtest. A representative hardware performance/playability pass is still needed before claiming the blueprint's frame-time targets.

## Recorded validation · 27 September 2026

The final checks passed: 14 simulation tests and 8 rendering/lifecycle tests; the seven-day full-atlas scenario; the complete browser integration tour; and focused checks for the timber scaffold and following a merchant at a destination. The simulation suite was retained after the final presentation-only changes; the affected rendering tests and focused browser checks were rerun.

The default-seed seven-day state hash is `afc2e31035b545eaa3f5126be492e49a634cbf4fba2a13f36d216e3ec8beb9f7`. Its snapshot was 205,170 bytes. All eight material-balance residuals were zero. Measured headless rule cost was about 0.056 ms at the 95th percentile, with a 0.875 ms maximum in that run; this does not include rendering or local scene adaptation.

Browser checks used Linux Headless Chrome 154, SwiftShader, performance quality, a 1280×900 launch window and a separate temporary profile. No application console errors were reported. Baseline source and enhanced-source orbit/town measurements were captured, but software rendering and differing streamed scene detail make these diagnostic samples unsuitable for a desktop performance or regression claim.

Artifacts from this run are in `/tmp/sosaria-browser-check/`: `results.json`, `focused-results.json`, `baseline-results.json`, `scenario-results.json`, and screenshots including `highmoor-register.png`, `repair-close-view.png`, and `mobile-world-saves.png`. These are local validation artifacts, not files required to run the application.
