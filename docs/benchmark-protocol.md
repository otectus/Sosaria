# Benchmark protocol

Performance numbers are only comparable when they are reproducible. Record every item below with each measurement, and keep CPU (simulation, view extraction, UI) separate from GPU-bound rendering.

## What to record

- Commit, browser and version, OS, device (CPU, GPU, RAM), display resolution, device pixel ratio, window size, the quality preset (Auto resolves to Performance, Balanced or Cinematic), whether external fonts loaded, and the world seed.
- The camera path, simulated duration, speed, and a warm-up of at least 20 seconds after the globe appears.
- Median and 95th-percentile frame time (not average FPS), simulation milliseconds per frame (`__sosaria.stats.simMs`), view and life update time (`lifeMs`), draw calls, triangles, JS heap, and the achieved simulation speed (`__sosaria.sim.clock.achieved`). The World panel's "Performance and reproducibility" section shows these live.

## Scenes

1. Orbit: the globe at altitude 180, paused and running.
2. Highmoor streets: altitude 2.5 over the market, at 1× and 64×.
3. The granary fire: a branch with a test fire, the camera at altitude 0.9 over the granary.
4. Globe → street → globe tour: fly from orbit to Highmoor, follow a resident for a minute, return to orbit, repeated five times. Watch heap and draw calls for unbounded growth.

## Targets (from the handoff, to be revised after measurement)

Balanced desktop: 60 FPS at 1080p, with a 95th percentile around 25 ms or lower after warm-up. Performance mode on low-power devices: about 30 FPS stable, with readable UI and identical simulation outcomes. These are engineering targets, not promises. Simulation correctness is never traded for frame rate.

## Headless measurements (recorded)

`npm run test:endurance` measures the kernel alone in Node. On the development machine (Linux, Node 26.12.1) the full atlas costs about 55–110 µs per tick depending on load: roughly 13–25 ms of CPU per real second at 64×, which is 219 ticks a second. The browser check records frame metrics under headless Chrome's SwiftShader software renderer. Those numbers (frames of 150 ms at orbit and over a second in town) describe a CPU rasterizer and are not GPU results.

## Not yet measured

No real-GPU measurement has been made for 0.2.0, including the reference desktop (i7, RTX 4050 6 GB, 32 GB) and an integrated-GPU laptop. That pass belongs to milestone M2's gate (see [issues](issues.md)).
