# Changelog

## 0.2.0 (1 November 2026)

Milestones M0 and M1 of the handoff: a trustworthy baseline and a persistent living region. See [docs/issues.md](docs/issues.md) for each finding and gate.

### Added

- A headless, deterministic simulation kernel (`src/sim`): one-minute ticks with an exact accumulator, saved random streams, stable IDs, an ordered due-work queue, and validated commands.
- Persistent residents in every settlement (1,158 people; 640 households in the default world) with species, culture, faction and occupation kept separate; needs, a decision order with explained tasks, memories and acquaintances. On-screen people are views of these records.
- Jobs with reserved inputs, carried goods, labour, interruption and recovery; fields with seasons, sowing, tending and harvest; mills, bakeries, woodcutting, fishing and forges in the Valdren grain network (Millbrook, Brightwater, Highmoor, Saltmere); a documented subsistence economy elsewhere.
- Conserved, transactional inventories with a per-good ledger; civic allocation of rations; bounded prices; procurement and relief contracts paid between treasuries; weekly realm dues and grants.
- Journeys on roads and validated sea routes, with loading, unloading queues, closures of roads and bridges, rerouting, waiting, exactly-once delivery, return trips, and news carried by travellers (reports and rumours with confidence).
- Fire incidents: natural ignition or test fires, detection, alarm, response roles, bucket lines limited by approach space and well capacity, bounded losses of real stored goods, spread, explicit outcomes, rationing, relief, migration as a last resort (and return home), and repair projects.
- A building lifecycle: the Highmoor watchtower is built stage by stage from imported stone and timber and then shortens fire detection; repairs use the same system.
- Saves in IndexedDB: manual slots, three rotating autosaves, a previous snapshot per slot, export and import with full validation, conflict detection, a read-only second tab, refusal of newer schemas, and migration of 0.1 worlds.
- Interface: an entity inspector (person, building, settlement, journey, fire, event) with "Why this task?", "Why did this happen?" and "What changed?"; a searchable Chronicle with observed, report, rumour and legend labels and pinned threads; an Atlas with search, filters, favourites and recent places; a World panel for saves, rules, experiment branches and diagnostics; settings for quality, motion and calm effects; keyboard shortcuts.
- Tools: `npm run test:scenario` (event trace and ledger), `npm run test:endurance`, `npm run validate`; a rewritten browser check; and 80 Node tests across 14 suites.
- Documentation: README, architecture, simulation rules, saves, benchmark protocol, issue list, third-party notices.

### Changed

- Sea lanes are rebuilt from authored waypoints over navigable water and validated on the final terrain (F05).
- Walkable graphs join street crossings and T-junctions and validate every connector against buildings and walls (F08).
- The sky reads canonical time; the sun's declination follows the 120-day year.
- The structure batch can switch any building to later-stage geometry and keeps anchors, roof heights and bounds in agreement (F06, F11).
- The terrain worker pool gained timeouts, retries, cancellation, typed errors and stale-result rejection (F12).
- Selection now opens the inspector; following is a separate action. The graphics menu moved into a Settings panel. Shortcuts avoid the camera's movement keys.
- The package version is now 0.2.0 (it previously read 1.0.0, a placeholder).

### Removed

- The schema 1 simulation modules and town register (`src/sim/{state,step,economy,knowledge,storage,time}.js`, `src/ui/living-world.js`) and their tests, superseded by the kernel and the new suites. Schema 1 saves are migrated, not discarded.

## 0.1 (27 September 2026, local)

The first living-world release: a small simulation layer, a six-person named cast per town, a Highmoor house fire, a three-town trade chain, and localStorage saves. It was recorded in git as a separate commit before 0.2.0.
