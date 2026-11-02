# Issues and milestone gates

Keyed to the findings and milestones of the handoff in [`sosaria_update.md`](../sosaria_update.md) (reviewed commit `3e75e4d`). Status is for 0.2.0, which delivers milestones M0 and M1. "Test" names the regression in `tests/`.

## Findings

| ID | Finding | 0.2.0 status | Evidence |
| --- | --- | --- | --- |
| F01 | Time-speed disagreement | **Fixed.** One integer minute clock with an exact rational accumulator; the sky, people, journeys, fires and Chronicle all read it. Bounded debt, coherent slowdown with achieved speed shown, immediate pause. | `clock.test.mjs`, `determinism.test.mjs`, browser check |
| F02 | People vanish when their town unloads | **Fixed.** 1,158 persistent residents with deterministic IDs; towns show views of them. | `identity.test.mjs` |
| F03 | Camera activation stalls while paused | **Fixed.** Activation follows the camera and real time; paused travel streams towns without changing the state hash. | `identity.test.mjs`, browser check |
| F04 | Chronicle event IDs repeat | **Fixed.** A saved allocator issues IDs at commit; an archive and yearly summaries keep references resolvable. 10,000 unique IDs survive compaction and reload. | `history.test.mjs` |
| F05 | Sea lanes cross land | **Fixed.** Water-grid routing with harbour approaches, line-of-sight simplification, constrained smoothing and full validation on the final terrain. Ghost ships keep an explicit supernatural route. Tracked ships wait out closed passages. | `maritime.test.mjs`, `npm run validate` |
| F06 | Construction is staged art | **Fixed.** Projects consume carried materials and labour per stage, block with a reason, complete into a working watchtower, and share the lifecycle with damage and repair. The render adapter registers later geometry and updates anchors, heights and bounds. | `buildings.test.mjs` |
| F07 | Events depend on the camera and frame rate | **Fixed.** Incidents come from world conditions or recorded commands; simulation streams are saved and separate from cosmetic randomness. | `determinism.test.mjs` |
| F08 | Navigation bypasses obstacles | **Fixed.** Weighted A* over validated connectors, closures around fires, waits with reasons instead of moving through walls, and journeys that reroute or wait at closed roads and bridges. | `navigation.test.mjs` |
| F09 | Temporary events close no loop | **Fixed for the granary-fire slice** (Section 8). Other ambient staging (dragon breath, decorative traffic) is labelled as presentation. | `slice.test.mjs`, `npm run test:scenario` |
| F10 | UI accessibility and layout | **Fixed in scope.** One panel controller (expanded state, hidden and inert closed panels, focus moved in and restored), map labels are buttons with the Atlas as the accessible list, occlusion-aware picking with a chooser for overlaps, no Atlas/Graphics overlap (settings moved to a panel), a single drawer on narrow screens, opt-in polite announcements, and reduced-motion and calm-effects settings. | browser check |
| F11 | No invalidation contracts | **Fixed for what changes in 0.2.0.** Building changes are published; worker results carry a world revision and stale ones are rejected. Land-use patches and terrain mutation are not yet needed. | `buildings.test.mjs`, `workers.test.mjs` |
| F12 | Incomplete failure handling | **Fixed.** Shared fallback start, timeouts with one retry, cancellation, typed job errors, a recoverable error dialog, WebGL context-loss handling, and no saving after a simulation error. | `workers.test.mjs`, browser check |

## Milestone gates

**M0 (trustworthy baseline): met.** The original seven rendering tests still pass (eight with the updated scaffold test). New regressions reproduce the old defects and pass: for example, the maritime test first checks that the authored lanes did cross land. The README and benchmark protocol are written. No visual claims are made beyond the recorded headless screenshots.

**M1 (persistent living region): met for the specified slice.** The headless kernel, saves, residents and households, jobs, food and timber inventories, real shipments and the building lifecycle are in place, and Section 8 works watched and unwatched, at every speed, paused between steps, and across a save mid-fire (`slice.test.mjs`, completion-gate test). The resource ledger balances in every test, in the scenario and on every day of the endurance runs.

## Known limitations and open items

- **Balance**: in ten seeds × ten years ([evidence](evidence/endurance-10x10.md)), hunger is uncommon and always recovers, but it happens. Highmoor ran out of grain in three seeds: in a seed's first spring, before Millbrook's harvest reached it, and late in one seed, when Highmoor's treasury was too low to buy Millbrook's surplus until dues refilled it. Millbrook meanwhile builds stores of up to about 16,000 grain. Tuning stewardship, storage and the flow of coin is M3 work; its gate is a multi-year run that shows variation and recovery without unexplained collapse or runaway resources.
- **Browsers and GPUs**: only headless Chrome (SwiftShader) has been exercised. Firefox, Safari and a real-GPU performance pass are needed before M2.
- **Visual acceptance matrix** (handoff 15.2): not done; it is M2's gate and needs human approval of screenshots.
- **Usability testing** with someone unfamiliar with the project (handoff 15.4): not done.
- **Economy scope**: civic allocation plus treasury trade (the handoff's step 1 with a single currency between treasuries). Household budgets, wages and taxes on households are later steps. Iron is a fixed starting stock with no mining yet (the ore-and-tools chain is M3), so smiths eventually idle with that reason shown.
- **Other settlements** run a documented subsistence economy. Their full production chains, and the dragons' and wildlife's agency, are M3–M5.
- **Geography notes**: Tuskport's harbour is a coastal anchorage about 3.5° from the town, with no overland transfer modelled. Brightwater's authored watermill never fit its riverbank in the layout, so its two windmills do the milling. One woodland edge at Tuskport is unreachable on foot and is not used.
- **Simulation worker**: the kernel runs on the main thread (about 0.2 ms per frame at 64× in Node). Moving it to a worker is deferred until profiling in real browsers asks for it.
- **License**: the maintainer has not chosen one yet.

## Deferred milestones

M2 (art direction gallery, terrain and town transitions, state-driven materials, audio, camera presets and photo mode), M3 (climate and water model, agriculture beyond the grain plots, animals and ecology), M4 (institutions, treaties, justice, conflict), M5 (dragon AI, magic, expeditions, relics, belief) and M6 (content packs, interiors, alternate scenarios). Each begins only after the previous gate, as the handoff's delivery order requires.
