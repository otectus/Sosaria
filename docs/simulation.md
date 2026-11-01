# Simulation rules and units (0.2.0)

All numbers below are balance values in `src/content/*` and `src/sim/*`. They are a starting point to tune, not lore.

## Time

- One integer **tick** is one in-world minute; 1,440 ticks make a day. At 1× a day takes 420 real seconds, the original pacing, so 1× is 24/7 ticks per real second. Speeds are 1×, 4×, 16× and 64×.
- Real time becomes ticks through an exact rational accumulator: a real microsecond at 1× adds 24 units and a tick costs 7,000,000. The same real time split into different frames yields the same tick count.
- The kernel runs owed ticks within a per-frame budget. Debt beyond two real seconds at the requested speed is dropped: the whole world slows together and the toolbar shows the achieved speed. Pause halts authoritative change at once, including owed ticks. Hidden tabs do not simulate, and returning never replays the time away.
- The calendar (`content/calendar.js`) has a 120-day year: spring, summer, autumn and winter, 30 days each. The default world opens on day 52 (summer 22) of year 1. Calendar days turn over at midnight on Highmoor's meridian. Each settlement keeps an integer local clock from its longitude for schedules. The sky's sun declination follows the same year.

## Randomness and identity

- Saved random streams (`weather`, `economy`, `households`, `incidents`, `travel`, `people`, plus per-actor streams created on demand) use a 32-bit mulberry32 state stored in the world. Effects and particles use `Math.random`, which the simulation never reads.
- Authored entities get IDs from scenario, site and index (`person:highmoor:17`, `household:highmoor:5`, `field:millbrook:3`, `building:<site>:<n>`). Later entities draw from saved allocators at commit time: `event`, `job`, `shipment`, `contract`, `incident`, `report`, `command`, `project`.

## People

- Population per settlement kind as before (Highmoor 150, Saltmere 70, Brightwater 64, Millbrook 34, and so on): 1,158 residents in 640 households. Detailed towns use authored occupation counts; elsewhere specialists are a share of the population, so every community keeps hands for its food.
- **Needs** in hundredths of a point (0–10,000), updated at decisions from elapsed ticks. Per tick: food −4 (the dead do not eat); rest −6 awake, +20 asleep; company −3, +25 socialising; safety +5 recovery; warmth −8 outdoors in winter, otherwise +30.
- **Decision order** at each task end: (1) a fire response role, (2) loading a wagon, (3) unfinished work in the shift, (4) sleep (night window or rest below 1,500; displaced people sleep at the temple or tavern), (5) the daily meal (18:00–20:30 or when food is below 3,500, from the household pantry, in the order bread, fish, provisions, flour, grain), (6) shelter from cold, (7) work, (8) evening company (17:00–22:00), (9) an errand or time at home.
- A **task** stores where it starts and ends on the walkable graph, departure, arrival and end ticks, and a reason. Walking is 0.04 planet units per tick (running 0.1). An unreachable destination becomes a 30-minute wait with the reason "unreachable", never movement through walls. An interruption (alarm, loading call, journey) credits labour done and leaves the person at the last graph node they actually passed.
- Health: two missed meals make a person hungry (work at 80%), four make them weak (60%). Skill 30–90 sets work speed (70% + 0.6 × skill); diligent workers work longer and faster.

## Work

Jobs are created by work rules (`sim/production.js`) and run as steps: **fetch** (inputs reserved in one or more stores, carried by the worker), **work** (at most 180-minute chunks), **deliver**. Carried goods live in the worker's own inventory. A job paused for a day returns its goods to store; if nothing had been fetched it reopens for a replacement worker. Open jobs not taken within two days release their reservations.

| Recipe | Inputs → outputs | Labour (worker-minutes) |
| --- | --- | --- |
| Sow | 8 grain (seed) → a growing plot | 90 |
| Tend | – (untended plots grow at half speed) | 60 |
| Harvest | ripe plot → 300 × fertility × (60% + 40% × care) grain | 240 |
| Mill | 40 grain → 40 flour (needs wind of 15% or more and a free windmill) | 120 |
| Bake | 40 flour + 2 firewood → 60 bread | 150 |
| Fell | woodland −3 → 2 timber + 4 firewood (at most 4 at once per town) | 180 |
| Fish | fish stock −8 → up to 8 fish (fewer as the stock thins) | 120 |
| Forge | 2 iron + 2 firewood → 1 tools | 240 |
| Subsistence (other settlements) | → 5 provisions (60% in winter) | 120 |
| Forage (rationing only) | woodland −1 → 2 provisions | 120 |

Fields grow daily by the season's rate (spring 100, summer 120, autumn 60, winter 10; ripe at 2,400), halved when untended and cut by severe dryness. Sowing happens in spring and autumn, and stops once a town holds eight times its grain target. Fertility: Millbrook 170, Saltmere 70, Highmoor 60, Brightwater 35 (wet river meadows). That is why Brightwater mills Millbrook's grain.

Builders and labourers carry project materials (12 units a trip) and book labour in 120-minute shares, with at most six on a stage. A stage completes only when every material is on site and its labour is done.

## Goods, stores and the ledger

Goods (`content/goods.js`) are integer units: grain, flour, bread, fish, provisions, timber, firewood, stone, iron, tools and coin (pennies). Food is one ration per unit. Bread loses 10% a day, fish 20% and provisions 2%. Every change goes through `sim/inventory.js`:

- `reserve` and `release` never move goods; `transfer` and `consume` are all-or-nothing; `lose` is bounded by what exists and trims reservations that can no longer be met.
- The ledger keeps per good: initial + produced = held + eaten + used + spoiled + burned + lost. `balance()` is zero for every good in every test, scenario and endurance day. Coin is never produced; it only moves.

## The M1 economy: civic allocation and trade between treasuries

- Each detailed town keeps stores by role: dry (granary, or Millbrook's barns), reserve (Highmoor's keep), food (the market), yard, and treasury. Other settlements share one commons.
- **Allocation**: at local dawn the town issues rations to each household's pantry, up to two days for present eaters (one day while rationing; in emergency, only the shortfall). The starting household rotates daily so any shortage is shared.
- **Prices** per town and good are bounded at 0.5–4× base by free stock against the town's target, and move a quarter of the way each day.
- **Food outlook**: rations held by stores and households ÷ people who eat. Below 8 days the steward rations and, if less than two days of food is incoming, asks for relief (a two-day cooldown follows). Below 3 days is emergency. Rationing ends at 9.6 days.
- **Procurement contracts** (`scenario.procurement`): the buyer orders when its free stock plus incoming falls below a threshold, and a second order may run when the shortfall is deep. The seller sells only above its own target. Coin is escrowed from the buyer's treasury and released to the seller on delivery. The rules: Millbrook grain to Brightwater and to Highmoor; Brightwater flour to Highmoor and Saltmere; Saltmere fish, stone and timber to Highmoor and Brightwater; Scalegate provisions to Saltmere by sea.
- **Relief**: candidates are settlements within three road edges that are not rationing, have at least 12 days of food, and have a free carrier. They offer 60% of their food above ten days of their own need. Trust of 65 or more makes it a gift (answered in 20 minutes); otherwise a sale (90 minutes) if the buyer can pay, or credit (180 minutes, recorded as an obligation) if trust is at least 40, else a refusal. Delivered relief raises trust by 6, ordinary deliveries by 1. Relief convoys get carriers first, and a labourer may drive one when every merchant is away.
- **Dues and grants**: weekly, Valdren towns pass a quarter of their coin above 500 to Highmoor's treasury. Highmoor grants 300 to a town below 250 while keeping 1,200. Both are recorded events.
- **Hunger and migration**: a household that has gone hungry for four days in an emergency, with no relief arranged, moves to a road neighbour with at least six days of food. It returns home after 20 days once home is above 15 days and not rationing.

## Journeys

- Wagons travel at 0.0204 planet units per tick, riders at 0.041, ships at 0.0467 (the original on-screen pacing). Loading and unloading take 30 minutes; at most two wagons unload at a town at once, and the rest queue visibly.
- Routes are the cheapest open path by travel time over roads (wagons) or validated sea routes (ships). Closing a road or bridge stops wagons that have not yet reached the closure point; they resume from where they stood. At a junction with the way ahead closed, a wagon takes a longer open route if that is faster than waiting (or the wait exceeds a day), and otherwise waits. Ships wait in port while a strong storm covers their passage.
- Cargo leaves the seller's store at departure, sits in the shipment's own inventory, and is delivered exactly once at arrival. A replayed arrival is ignored.
- Travellers carry up to four notable events their origin knows and the destination does not, never a town's own news back to it. A first-hand account has confidence 100, then 75 and 50 with each relay; below 75 it is labelled a rumour. Legends stay legends.

## Fire

- **Ignition**: by command (an experiment) or naturally. Each hour in a detailed town with working hearths (bake or forge jobs in the work step), the risk is (dryness/100)² × hearths × (0.5 + wind/100) × 0.0015 × the ignition rule. Rain over 30% prevents it.
- **Detection** after 7 minutes by day or 22 at night, minus one per guard on watch (at most four) and five for a working watchtower, never under two. The bell rings two minutes later and every present resident is assigned a role in a stable order: children and elders shelter; parents of young children living within 0.6 units protect them; two guards hold the crowd back; storekeepers (and bakers, at a granary) salvage stores; then bucket lines up to the building's approach slots (granary 10, barn 8, mill 6, tavern 8, others 6); then up to eight water carriers; the rest watch from a distance.
- **Dynamics per tick**: buckets drawn = min(arrived liners + half the arrived carriers, well level ÷ 4, 12), each costing 4 from the well. Intensity grows by intensity × (40 + 0.6 × dryness + 0.4 × wind) ÷ 4000 + 4 while fuel lasts, falls by 7 per bucket and by rain ÷ 4, and is capped at 1,000. Fuel burns at intensity ÷ 40. Condition falls by one per 300 accumulated intensity. Each flammable stored good loses ⌊held × intensity ÷ 60,000⌋, plus one above intensity 500, recorded once as `burned`. In strong wind (over 45%) at intensity over 600, a neighbour within 0.4 units may catch.
- **Resolution**: put out (intensity at most 30 with buckets still landing), burned out, destroyed (condition 0), or abandoned when nobody has worked the line for an hour while it is still strong. Responders remember the fire and the bucket line forms acquaintances. A repair project is planned, scaled by damage; homes below 50% displace their households until repaired.

## Buildings and projects

- A building works while its condition is at least 40%, it is not burning, and it is not under construction or ruined.
- The Highmoor tower site (`construct0`) is a real project: foundations (16 stone), lower walls (20 stone, 6 timber), upper walls (20 stone, 8 timber), roof and lookout (14 timber, 1 tools). It then becomes a working watchtower that shortens fire detection. The capital starts with 40 stone, so it must import stone from Saltmere to finish.
- Repairs: clear debris, then rebuild walls and floor (10 timber, 8 stone), then a new roof (10 timber, 1 tools), all scaled by damage (at least 25%).

## History and knowledge

- Events are committed with IDs from the allocator. Up to 1,600 stay live (compacted to 1,200). Older events move to an archive of up to 5,000 if referenced (by memories, town knowledge, incidents, projects, contracts, shipments, reports or commands) or if important. Otherwise they become yearly counts by place and kind. Every issued ID still resolves, at worst to a "summarized" marker.
- Towns know up to 48 events and keep 24 recent ones; residents keep 8 memories and 6 acquaintances (the weakest is forgotten first).

## Rules and experiments

World rules: destructive emergencies on or off, natural fire frequency (0–300%), and neighbourly relief on or off. Rule changes and experiments (test fire, drought, closures) are recorded as interventions. In the interface, experiments always run in a branch saved to its own slot, carrying the origin slot, tick and state hash.
