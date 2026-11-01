// Browser integration check via Chrome's built-in DevTools protocol; no npm dependencies.
// Start `npm start -- 5174`, then `npm run test:browser`.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const baseline = process.argv.includes('--baseline');
const viewsOnly = process.argv.includes('--views');
const url = process.env.SOSARIA_TEST_URL || (baseline ? 'http://localhost:5175' : 'http://localhost:5174');
const artifactDir = process.env.SOSARIA_TEST_ARTIFACTS || '/tmp/sosaria-browser-check';
await mkdir(artifactDir, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'sosaria-chrome-'));
const chrome = spawn(process.env.CHROME_BIN || '/opt/google/chrome/chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--no-first-run', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--window-size=1280,900', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = ''; chrome.stderr.on('data', d => { stderr = (stderr + d).slice(-5000); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
const errors = [], metrics = [];
try {
  let port;
  for (let i = 0; i < 150; i++) {
    try { port = +(await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch {}
    if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
    await sleep(100);
  }
  if (!port) throw new Error(`Chrome did not start: ${stderr}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let serial = 0; const calls = new Map();
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) { const c = calls.get(m.id); calls.delete(m.id); if (m.error) c?.reject(new Error(JSON.stringify(m.error))); else c?.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.description || a.value).join(' '));
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { calls.delete(id); reject(new Error(`DevTools timed out: ${method}`)); }, 45000);
    calls.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 180; i++) { if (await evaluate(expression)) return; await sleep(500); }
    throw new Error(`Timed out: ${expression}\n${errors.join('\n')}`);
  };
  const frames = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const screenshot = async name => {
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(artifactDir, name), Buffer.from(shot.data, 'base64'));
  };
  const measure = async name => {
    const samples = [];
    for (let i = 0; i < 8; i++) { samples.push(await evaluate('({...__sosaria.stats, frameMs: window.testFrameMs, tick: __sosaria.sim?.state.tick, heapMB: performance.memory?.usedJSHeapSize/1048576})')); await sleep(100); }
    const frame = samples.map(s => s.frameMs).filter(Number.isFinite).sort((a,b) => a-b);
    const rules = samples.map(s => s.simMs).filter(Number.isFinite).sort((a,b) => a-b);
    metrics.push({ name, frameMedianMs: frame[Math.floor(frame.length/2)], rulesMaxMs: rules.at(-1), lifeMaxMs: Math.max(...samples.map(s=>s.lifeMs || 0)), drawCalls: samples.at(-1).calls,
      triangles: samples.at(-1).tris, heapMB: samples.at(-1).heapMB, quality: samples.at(-1).quality });
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'let testLast; function testFrame(now) { window.testFrameMs=testLast===undefined?0:now-testLast; testLast=now; requestAnimationFrame(testFrame); } requestAnimationFrame(testFrame);' });
  await cdp('Page.navigate', { url });
  await waitFor('!!window.__sosaria?.hud && !document.getElementById("loading")');
  console.log('World loaded.');
  await evaluate('__sosaria.setQuality("performance"); __sosaria.clock.paused = true; __sosaria.controls.flight = null;');
  await evaluate('__sosaria.controls.setView(__sosaria.controls.focus, 180, 0)');
  await frames(); await measure('orbit');
  if (baseline || process.env.SOSARIA_BASELINE === '1') {
    await evaluate('(() => {const a=__sosaria; a.controls.setView(a.sites.find(s=>s.s.id==="highmoor").centerWorld.clone().normalize(),2.5,0); a.people.lastScan=null; })()');
    await frames(); await measure('town');
    await writeFile(join(artifactDir, 'baseline-results.json'), JSON.stringify({ metrics, errors, renderer: 'headless Chrome SwiftShader; performance quality; 1280×900' }, null, 2));
    console.log(JSON.stringify({ baseline: metrics, errors }, null, 2));
  } else if (viewsOnly) {
    await evaluate(`(() => { const a=__sosaria; a.newWorld('sosaria-living-1'); a.clock.paused=true; a.controls.reducedMotion=true; a.hud.living.openTown('highmoor'); })()`);
    await frames(); await sleep(800);
    await evaluate('document.querySelector("[data-person]").click()');
    await waitFor('__sosaria.hud.followTarget?.kind === "person"');
    await evaluate('__sosaria.hud.stopFollow()');
    await evaluate(`(() => { const a=__sosaria; a.newWorld('sosaria-living-1'); a.clock.paused=true; a.sim.advance(110,1); const b=Object.values(a.sim.state.buildings)[0], r=a.structures.byBuilding.get(b.id); a.controls.reducedMotion=true; a.hud.living.openTown('highmoor'); a.hud.living.action({dataset:{action:'building',building:b.id}}); a.controls.tiltOffset=-0.35; a.controls.groundH=Math.max(0,a.structures.roofAt(a.controls.focus),a.field.height(...a.controls.focus.toArray())); a.hud.living.toggle(false); })()`);
    await frames(); await screenshot('fire-close-view.png');
    await evaluate(`(() => { const a=__sosaria; a.sim.advance(70,1); const b=Object.values(a.sim.state.buildings)[0]; a.sim.command({type:'repair',site:'highmoor',building:b.id}); })()`);
    await frames();
    assert.equal(await evaluate('__sosaria.structures.changeOverlays.children.length'), 1);
    await screenshot('repair-close-view.png');
    // A followed merchant resting after delivery stays at the destination.
    assert.ok(await evaluate(`(() => { const a=__sosaria, t=a.sim.state.trips.find(t=>t.status==='travelling' && Object.keys(t.cargo).length); if(!t)return false; const actor=a.sim.state.residents[t.carrier]; a.sim.advance(t.duration-t.progress,1); while(a.sim.time.pending>=1)a.sim.advance(0,1); const home=a.sites.find(s=>s.s.id===actor.site), destination=a.sites.find(s=>s.s.id===actor.location); const fake={personId:actor.id, name:actor.name, race:'human', role:'merchant', home:actor.home}; a.hud.follow({kind:'person',ref:fake,sim:{site:home}}); const pos=a.controls.followFn(); return actor.location!==actor.site && pos.distanceTo(destination.plazaWorld)<0.001; })()`));
    assert.deepEqual(errors, []);
    await writeFile(join(artifactDir, 'focused-results.json'), JSON.stringify({ errors, checks: 'Atlas town arrival and resident button; fire and scaffold close views; following a merchant at the destination' }, null, 2));
    console.log('Focused scene and merchant-follow checks passed.');
  } else {
  await evaluate(`(() => { const a=__sosaria; a.newWorld('sosaria-living-1'); a.clock.paused=true; const s=a.sites.find(s=>s.s.id==='highmoor'); a.controls.setView(s.centerWorld.clone().normalize(), 2.5, 0); a.hud.living.openTown('highmoor', false); })()`);
  await frames();
  await waitFor('!!__sosaria.people.active.get("highmoor")');
  await sleep(800);
  assert.equal(await evaluate('document.querySelectorAll("[data-person]").length'), 6);
  await evaluate('window.testGuard = {...__sosaria.people.active.get("highmoor").agents.find(a=>a.personId)};');
  await screenshot('highmoor-register.png'); await measure('town');
  await evaluate('__sosaria.controls.setView(__sosaria.controls.focus, 200, 0)'); await frames();
  assert.equal(await evaluate('__sosaria.people.active.size'), 0);
  await evaluate('__sosaria.controls.setView(__sosaria.controls.focus, 2.5, 0)'); await frames();
  assert.ok(await evaluate('(() => { const a=__sosaria.people.active.get("highmoor").agents.find(a=>a.personId===testGuard.personId); return a.name===testGuard.name && a.x===testGuard.x && a.y===testGuard.y; })()'));
  console.log('Resident identity and position survived leaving and revisiting while paused.');
  await evaluate('__sosaria.sim.advance(110,1); __sosaria.clock.paused=false'); await sleep(1000);
  await evaluate('__sosaria.clock.paused=true'); await frames();
  assert.equal(await evaluate('Object.values(__sosaria.sim.state.buildings)[0].status'), 'burning');
  await evaluate('(() => { const a=__sosaria, b=Object.values(a.sim.state.buildings)[0], r=a.structures.byBuilding.get(b.id); a.controls.setView(new a.THREE.Vector3().setFromMatrixPosition(r.matrix).normalize(),0.8,0); })()');
  await frames();
  await evaluate('window.midFire = __sosaria.exportWorld(); __sosaria.save();');
  await screenshot('active-fire.png'); await measure('fire');
  await cdp('Page.reload');
  await waitFor('!!window.__sosaria?.hud && !document.getElementById("loading")');
  assert.equal(await evaluate('Object.values(__sosaria.sim.state.buildings)[0].status'), 'burning');
  assert.ok(await evaluate('__sosaria.sim.state.trips.some(t=>t.status==="travelling")'));
  await evaluate(`(() => { const a=__sosaria; a.clock.paused=true; a.controls.flight=null; const s=a.sites.find(s=>s.s.id==='highmoor'); a.controls.setView(s.centerWorld.clone().normalize(),2.5,0); a.hud.living.openTown('highmoor',false); const n=180-a.sim.state.tick; a.sim.advance(n,1); while(a.sim.time.pending>=1)a.sim.advance(0,1); })()`);
  await frames(); await sleep(800);
  await evaluate('window.beforeCoins = __sosaria.sim.state.settlements.highmoor.stocks.coin; document.querySelector("[data-action=repair]").click();');
  assert.equal(await evaluate('Object.values(__sosaria.sim.state.buildings)[0].status'), 'repairing');
  assert.equal(await evaluate('__sosaria.sim.state.settlements.highmoor.stocks.coin'), await evaluate('beforeCoins-12'));
  await evaluate('(() => { const a=__sosaria, b=Object.values(a.sim.state.buildings)[0], r=a.structures.byBuilding.get(b.id); a.controls.setView(new a.THREE.Vector3().setFromMatrixPosition(r.matrix).normalize(),0.8,0); })()');
  await frames(); await screenshot('repair-scaffolding.png');
  await evaluate('__sosaria.sim.advance(91,1)'); await frames();
  assert.equal(await evaluate('Object.values(__sosaria.sim.state.buildings)[0].status'), 'repaired');
  assert.equal(await evaluate('__sosaria.structures.changeOverlays.children.length'), 0);
  console.log('Browser reload preserved an active fire and cargo. The repair control charged reserves and restored the building.');
  await evaluate('(() => { const a=__sosaria; a.controls.setView(a.sites.find(s=>s.s.id==="brightwater").centerWorld.clone().normalize(),2.5,0); a.hud.living.openTown("brightwater",false); })()');
  await frames(); await sleep(800);
  await evaluate('document.querySelector("[data-tab=journeys]").click()'); await sleep(200);
  assert.ok(await evaluate('document.querySelector("#world-body").textContent.includes("grain") || document.querySelector("#world-body").textContent.includes("flour")'));
  await evaluate('document.querySelector("[data-action=trip]")?.click()');
  assert.equal(await evaluate('__sosaria.hud.followTarget?.kind'), 'traffic');
  await evaluate('__sosaria.hud.stopFollow(); window.roundtrip = __sosaria.exportWorld(); __sosaria.sim.advance(3,1); __sosaria.importWorld(roundtrip);');
  assert.equal(await evaluate('__sosaria.exportWorld()'), await evaluate('roundtrip'));
  assert.ok(await evaluate('(() => { try { __sosaria.importWorld("{bad"); return false; } catch { return __sosaria.exportWorld()===roundtrip; } })()'));
  // Real time buttons use one clock, and pause leaves every logical record unchanged.
  await evaluate('document.querySelector("#speed-64").click(); __sosaria.clock.paused=false;'); await sleep(1000);
  await evaluate('__sosaria.clock.paused=true; window.pausedWorld = __sosaria.exportWorld();'); await sleep(700);
  assert.equal(await evaluate('__sosaria.exportWorld()'), await evaluate('pausedWorld'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('document.querySelector("[data-tab=save]").click()'); await frames();
  assert.ok(await evaluate('document.querySelector(".toolbar").getBoundingClientRect().left >= 0 && document.querySelector(".toolbar").getBoundingClientRect().right <= innerWidth'));
  await screenshot('mobile-world-saves.png');
  assert.deepEqual(errors, []);
  const device = await evaluate('({ userAgent:navigator.userAgent, cores:navigator.hardwareConcurrency, gpu:__sosaria.renderer.capabilities.isWebGL2, renderer:__sosaria.renderer.getContext().getParameter(__sosaria.renderer.getContext().RENDERER) })');
  await writeFile(join(artifactDir, 'results.json'), JSON.stringify({ url, device, metrics, errors, checks: 'resident revisit; active fire and trip reload; repair UI; cargo follow; import/export; corrupt import rejection; fast-forward; pause; mobile layout' }, null, 2));
  console.log(JSON.stringify({ metrics, errors, artifacts: artifactDir }, null, 2));
  }
} finally {
  ws?.close(); chrome.kill('SIGTERM');
}
