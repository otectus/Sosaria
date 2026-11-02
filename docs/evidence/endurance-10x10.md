# Endurance run: ten seeds × ten simulated years (0.2.0)

Run on 1 November 2026 under Linux with Node 26.12.1, on the code of commit `59d3f7d` (the 0.2.0 release commit):

```
node --import ./tools/three-node.mjs tools/endurance.mjs --years 10 --seeds 10 --json endurance-10x10.json
```

`npm run test:endurance -- --years 10 --seeds 10` runs the same script. Each seed simulates 1,728,000 one-minute ticks over the whole atlas: 36 settlements and 1,158 residents. After every simulated day the tool checks that the resource ledger balances and that no stock is negative, and stops at the first failure. The run took 14.5 minutes and exited with code 0.

| Seed | µs/tick, mean | µs/tick, busiest day | Residents at the end: Millbrook / Brightwater / Highmoor / Saltmere | Harvests | Deliveries | Relief contracts | Fires | Hunger episodes | Households away / home again | Peak hungry households | Lowest town outlook (days) | Largest save (MB) | Ledger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sosaria-living-1 | 59 | 118 | 34 / 64 / 150 / 70 | 1175 | 1571 | 193 | 16 | 1 | 0 / 0 | 0 | 2.6 | 2.45 | zero |
| endurance-1 | 47 | 96 | 34 / 64 / 150 / 70 | 1130 | 1177 | 328 | 13 | 3 | 0 / 0 | 0 | 1.7 | 2.27 | zero |
| endurance-2 | 45 | 74 | 34 / 64 / 150 / 70 | 1142 | 974 | 336 | 13 | 0 | 0 / 0 | 0 | 1.6 | 2.26 | zero |
| endurance-3 | 48 | 71 | 34 / 64 / 150 / 70 | 1152 | 1211 | 234 | 24 | 94 | 2 / 2 | 6 | 0 | 2.40 | zero |
| endurance-4 | 48 | 83 | 34 / 64 / 150 / 70 | 1166 | 1323 | 225 | 15 | 0 | 0 / 0 | 0 | 0.1 | 2.32 | zero |
| endurance-5 | 50 | 80 | 34 / 64 / 150 / 70 | 1155 | 1325 | 330 | 14 | 282 | 7 / 7 | 77 | 0 | 2.44 | zero |
| endurance-6 | 48 | 70 | 34 / 64 / 150 / 70 | 1122 | 1191 | 323 | 13 | 10 | 3 / 3 | 0 | 1.1 | 2.32 | zero |
| endurance-7 | 50 | 102 | 34 / 64 / 150 / 70 | 1147 | 1227 | 333 | 17 | 68 | 5 / 5 | 0 | 0.7 | 2.31 | zero |
| endurance-8 | 51 | 86 | 34 / 64 / 150 / 70 | 1161 | 1311 | 307 | 14 | 0 | 0 / 0 | 0 | 2.7 | 2.41 | zero |
| endurance-9 | 56 | 83 | 34 / 64 / 150 / 70 | 1168 | 1447 | 197 | 22 | 12 | 0 / 0 | 6 | 1 | 2.39 | zero |

- **µs/tick**: the mean over the whole run (including the sampling below), and the mean over the run's busiest day, timed in Node.
- **Residents at the end**: the residents living in each town when the run ends, which equal the starting populations.
- **Harvests, deliveries, relief contracts, fires and hunger episodes** are totals over the decade. A hunger episode is a household with someone hungry two days running.
- **Households away / home again**: households that left home for a neighbour in hard times, and those that came back. The run's `household_left` count also includes the journeys home, so away = `household_left` − `household_returned`.
- **Peak hungry households, lowest town outlook** (the minimum over the four towns) **and save size** come from samples every ten days. The save size is the length of the serialized JSON, which is ASCII.

## Reading the results

- **Conservation**: every good balanced, and no stock went negative, on every simulated day of every seed.
- **No collapse**: every seed ends with the four towns at their starting populations, and every household that left came home. Harvests (about 1,150 per decade), trade and fires (13–24) recur throughout. Millbrook builds a large grain surplus: its stores peak at 14,013–15,927 grain, with outlooks of up to 414–470 days, and hold 7,245–14,397 at the end.
- **Hunger is uncommon and recovers, but it happens.** Three seeds had no hunger episode, four had 1–12, and `endurance-7`, `endurance-3` and `endurance-5` had 68, 94 and 282. Hungry households showed in the ten-day samples in three seeds, always at Highmoor, in emergency rationing with its grain all but gone (0–26):
  - `endurance-3` and `endurance-9`, in their first spring (year 2, run days 80–90, peak 6 households). Millbrook itself held only 346–1,156 grain in the samples before its spring harvest. By the next sample Highmoor had about 2,900 grain.
  - `endurance-5`, from late winter in year 9 into spring of year 10 (run days 1020–1030, peak 46) and in spring of year 11 (run day 1170, peak 77). Here grain was available: Millbrook held 6,196–10,273 at those samples. But Highmoor pays for imports from its treasury, which had fallen to 9–99 coin before the first shortage and 11–34 before the second. Each time it restocked (1,723 and 1,923 grain by the next sample) once dues had refilled it.

  No shortage showed in more than two consecutive samples.
- **Saves**: the largest was 2.45 MB (`sosaria-living-1` at run day 1180). Saves grow over the decade, from about 1.7 MB at run day 100 to 2.22–2.41 MB at the end, and almost all of the growth is the event archive (1,993–2,656 entries at the end). The archive is capped at 5,000 entries, beyond which the oldest unreferenced, less important entries fold into yearly summaries. No run reached the cap, so these runs do not show where saves level off.
- **Kernel cost**: 45–59 µs per tick on average for the full atlas; the busiest day of each run averaged 70–118 µs per tick.

What these runs do not show: real-GPU frame times, browser behaviour, or player experience. See the [benchmark protocol](../benchmark-protocol.md) and [issues](../issues.md).
