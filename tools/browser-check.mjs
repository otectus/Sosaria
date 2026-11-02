// Browser integration check via Chrome's DevTools protocol; no npm dependencies.
// Start `npm start -- 5174`, then `npm run test:browser`. CHROME_BIN, SOSARIA_TEST_URL and
// SOSARIA_TEST_ARTIFACTS override the defaults. Headless Chrome renders with SwiftShader: timings
// are diagnostic only and say nothing about a real GPU.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const url = process.env.SOSARIA_TEST_URL || 'http://localhost:5174';
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
const checks = [], metrics = [], errors = [];
const pass = name => { checks.push(name); console.log(`ok - ${name}`); };
let browserWs;

async function page(port, target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
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
    const timer = setTimeout(() => { calls.delete(id); reject(new Error(`DevTools timed out: ${method}`)); }, 60000);
    calls.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, tries = 240) => { for (let i = 0; i < tries; i++) { if (await evaluate(expression)) return; await sleep(500); } throw new Error(`Timed out: ${expression}\n${errors.join('\n')}`); };
  const frames = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const screenshot = async name => { const shot = await cdp('Page.captureScreenshot', { format: 'png' }); await writeFile(join(artifactDir, name), Buffer.from(shot.data, 'base64')); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  return { ws, cdp, evaluate, waitFor, frames, screenshot };
}

try {
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    try { port = +(await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch {}
    if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
    await sleep(100);
  }
  if (!port) throw new Error(`Chrome did not start: ${stderr}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const P = await page(port, targets.find(t => t.type === 'page'));
  const { cdp, evaluate, waitFor, frames, screenshot } = P;
  const measure = async name => {
    const s = [];
    for (let i = 0; i < 10; i++) { s.push(await evaluate('({ ...__sosaria.stats })')); await sleep(100); }
    const f = s.map(x => x.frameMs).filter(Number.isFinite).sort((a, b) => a - b);
    metrics.push({ name, frameMedianMs: f[Math.floor(f.length / 2)], rulesMaxMs: Math.max(...s.map(x => x.simMs || 0)), drawCalls: s.at(-1).calls, triangles: s.at(-1).tris, heapMB: s.at(-1).heapMB, quality: s.at(-1).quality });
  };
  const hash = () => evaluate('(async () => { const m = await import("/src/sim/snapshot.js"); return m.stateHash(__sosaria.sim.state); })()');
  await cdp('Page.navigate', { url });
  await waitFor('!!window.__sosaria?.hud && !document.getElementById("loading")');
  pass('the world loads');
  await evaluate('__sosaria.setQuality("performance"); __sosaria.controls.flight = null; __sosaria.controls.reducedMotion = true;');
  await evaluate('__sosaria.newWorld("sosaria-living-1"); __sosaria.clock.paused = true;');
  await evaluate('__sosaria.controls.setView(__sosaria.controls.focus, 180, 0)'); await frames(); await measure('orbit');

  // Panels: closed panels are hidden and inert; buttons report their state; focus returns.
  const panelState = () => evaluate(`[...document.querySelectorAll('.panel')].map(p => ({ id: p.id, open: p.classList.contains('open'), hidden: p.hidden, inert: p.inert }))`);
  for (const p of await panelState()) if (!p.open) { assert.ok(p.hidden && p.inert, `${p.id} closed panels are hidden and inert`); }
  await evaluate('document.getElementById("btn-atlas").focus(); document.getElementById("btn-atlas").click()'); await sleep(400);
  assert.equal(await evaluate('document.getElementById("btn-atlas").getAttribute("aria-expanded")'), 'true');
  assert.equal(await evaluate('document.getElementById("atlas").inert'), false);
  assert.equal(await evaluate('document.getElementById("atlas").contains(document.activeElement)'), true, 'focus moves into the panel');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400);
  assert.equal(await evaluate('document.getElementById("btn-atlas").getAttribute("aria-expanded")'), 'false');
  assert.equal(await evaluate('document.activeElement?.id'), 'btn-atlas', 'focus returns to the opener');
  assert.equal(await evaluate('document.getElementById("atlas").hidden && document.getElementById("atlas").inert'), true);
  assert.ok(await evaluate('[...document.querySelectorAll(".label.place")].every(l => l.tagName === "BUTTON")'), 'map labels are buttons');
  pass('panel state, focus restoration and semantic labels (F10)');

  // Atlas search to an inspector.
  await evaluate('document.getElementById("btn-atlas").click()'); await sleep(300);
  assert.ok(await evaluate('(() => { const a = document.getElementById("atlas").getBoundingClientRect(), p = document.getElementById("plaque").getBoundingClientRect(); return a.width > 0 && (a.top >= p.bottom || a.left >= p.right); })()'), 'the open Atlas does not overlap the plaque');
  await evaluate('const q = document.getElementById("atlas-search"); q.value = "high"; q.dispatchEvent(new Event("input"));'); await sleep(100);
  assert.ok(await evaluate('[...document.querySelectorAll("#atlas-body [data-site]")].map(b => b.dataset.site).includes("highmoor")'));
  await evaluate('document.querySelector("#atlas-body [data-site=highmoor]").click()'); await sleep(600);
  await evaluate('__sosaria.controls.flight = null; __sosaria.controls.setView(__sosaria.sites.find(s => s.s.id === "highmoor").centerWorld.clone().normalize(), 2.5, 0)');
  await waitFor('__sosaria.people.active.has("highmoor")');
  await sleep(600);
  assert.match(await evaluate('document.getElementById("inspector").innerText'), /Food is|Stores/);
  await screenshot('highmoor-inspector.png'); await measure('town');
  await evaluate('document.querySelector("#inspector details[data-key=people]").open = true; __sosaria.hud.inspector.render(true);');
  assert.equal(await evaluate('document.querySelector("#inspector details[data-key=people]").open'), true, 'expanded sections survive a refresh');
  pass('Atlas search opens the settlement inspector');

  // Residents persist across unloading while paused; the authoritative hash does not move.
  const h0 = await hash();
  await evaluate('window.probe = [...__sosaria.people.active.get("highmoor").agents.values()][5]; window.probeId = probe.personId; window.probeName = probe.name;');
  await evaluate('__sosaria.controls.setView(__sosaria.controls.focus, 200, 0)'); await frames(); await sleep(400); await frames();
  assert.equal(await evaluate('__sosaria.people.active.size'), 0);
  await evaluate('__sosaria.controls.setView(__sosaria.sites.find(s => s.s.id === "saltmere").centerWorld.clone().normalize(), 2.5, 0)'); await frames(); await sleep(400); await frames();
  assert.ok(await evaluate('__sosaria.people.active.has("saltmere")'), 'paused travel streams the destination');
  await evaluate('__sosaria.controls.setView(__sosaria.sites.find(s => s.s.id === "highmoor").centerWorld.clone().normalize(), 2.5, 0)'); await frames(); await sleep(400); await frames();
  assert.equal(await evaluate('__sosaria.people.active.get("highmoor").agents.get(probeId)?.name'), await evaluate('probeName'));
  assert.equal(await hash(), h0, 'paused exploration does not change the world');
  pass('residents persist across unload while paused (F02, F03)');

  // Selection and follow are separate; the inspector explains the task.
  await evaluate('__sosaria.hud.select({ kind: "person", id: probeId })'); await sleep(400);
  assert.match(await evaluate('document.getElementById("inspector").innerText'), /Household|Needs/);
  assert.equal(await evaluate('__sosaria.hud.followTarget'), null);
  await evaluate('document.querySelector("#inspector [data-act=follow]").click()');
  assert.equal(await evaluate('__sosaria.hud.followTarget?.kind'), 'person');
  await evaluate('__sosaria.hud.stopFollow()');
  pass('person inspector, then an explicit follow');

  // An experiment branch: the granary fire, its response, damage, and the repair.
  await evaluate('window.confirm = () => true');
  const branch = await evaluate('__sosaria.branch("Browser fire experiment").then(m => !!m)');
  assert.ok(branch, 'the branch is saved');
  await evaluate('__sosaria.sim.run(200)');
  assert.ok((await evaluate('__sosaria.sim.command({ type: "ignite", building: __sosaria.catalog.byId.highmoor.granaries[0] })')).ok);
  await evaluate('__sosaria.sim.run(6)');
  await evaluate('(() => { const a = __sosaria, r = a.structures.byBuilding.get(a.catalog.byId.highmoor.granaries[0]); a.controls.setView(new a.THREE.Vector3().setFromMatrixPosition(r.matrix).normalize(), 0.9, 0); a.hud.select({ kind: "building", id: a.catalog.byId.highmoor.granaries[0] }); })()');
  await frames(); await sleep(800);
  assert.ok(await evaluate('Object.values(__sosaria.sim.state.incidents).some(x => x.status === "burning")'));
  await screenshot('granary-fire.png'); await measure('fire');
  await evaluate('__sosaria.sim.run(240)'); await frames(); await sleep(500);
  assert.ok(await evaluate('Object.values(__sosaria.sim.state.incidents).every(x => x.ended !== null)'), 'the fire resolved');
  await evaluate('__sosaria.hud.inspector.render(true)');
  assert.match(await evaluate('document.getElementById("inspector").innerText'), /Repair|repair|Clear debris|Rebuild/);
  assert.ok(await evaluate('__sosaria.structures.changeOverlays.children.length >= 1'), 'repair scaffolding is drawn from the project');
  await screenshot('granary-repair.png');
  pass('fire, response and repair in an experiment branch');

  // Saves: IndexedDB slot, reload restores the same world.
  const saved = await evaluate('__sosaria.save("manual-check", { name: "Browser check" }).then(m => m && m.slot)');
  assert.equal(saved, 'manual-check');
  const before = await hash(), tick = await evaluate('__sosaria.sim.state.tick');
  await cdp('Page.reload');
  await waitFor('!!window.__sosaria?.hud && !document.getElementById("loading")');
  await evaluate('__sosaria.clock.paused = true');
  await evaluate('__sosaria.loadSlot("manual-check")');
  assert.equal(await evaluate('__sosaria.sim.state.tick'), tick);
  assert.equal(await hash(), before);
  pass('IndexedDB save survives a reload with the same state hash');

  // Export and import; a corrupt file is rejected without touching the world.
  await evaluate('window.roundtrip = __sosaria.exportWorld()');
  await evaluate('__sosaria.sim.run(10)');
  await evaluate('__sosaria.importWorld(roundtrip)');
  assert.equal(await hash(), before);
  assert.ok(await evaluate('__sosaria.importWorld("{bad").then(() => false, () => true)'));
  assert.equal(await hash(), before);
  pass('export/import round trip and corrupt import rejection');

  // Time controls: pause freezes the world; 64x reports achieved speed.
  await evaluate('document.querySelector("#speed-64").click(); __sosaria.clock.paused = false;'); await sleep(1500);
  assert.equal(await evaluate('document.querySelector("#speed-64").getAttribute("aria-pressed")'), 'true');
  const achieved = await evaluate('__sosaria.sim.clock.achieved');
  await evaluate('__sosaria.clock.paused = true'); await sleep(200);
  const frozen = await hash(); await sleep(700);
  assert.equal(await hash(), frozen);
  metrics.push({ name: 'achieved-speed-at-64x', achieved });
  pass('pause freezes the world; speed state is announced');

  // Chronicle search and the causal inspector.
  await evaluate('document.getElementById("btn-chron").click()'); await sleep(300);
  await evaluate('const q = document.getElementById("chron-q"); q.value = "fire"; q.dispatchEvent(new Event("input"));'); await sleep(200);
  assert.ok(await evaluate('document.querySelectorAll("#chron-list [data-event]").length > 0'));
  await evaluate('document.querySelector("#chron-list [data-event]").click()'); await sleep(300);
  assert.match(await evaluate('document.getElementById("inspector").innerText'), /Why did this happen\?[\s\S]*What changed\?/);
  pass('Chronicle search leads to causes and effects');

  // WebGL context loss shows a recoverable state; restoring hides it.
  await evaluate('window.lose = __sosaria.renderer.getContext().getExtension("WEBGL_lose_context"); lose.loseContext();'); await sleep(500);
  assert.equal(await evaluate('!document.getElementById("app-error")?.hidden'), true);
  await evaluate('lose.restoreContext()'); await sleep(800);
  assert.equal(await evaluate('document.getElementById("app-error").hidden'), true);
  pass('graphics context loss is explained and recovered');

  // A second tab on the same world is read-only.
  const second = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const P2 = await page(port, second);
  await P2.waitFor('!!window.__sosaria?.hud && !document.getElementById("loading")');
  assert.equal(await P2.evaluate('__sosaria.readOnly'), true);
  assert.equal(await P2.evaluate('__sosaria.save("manual-other").then(m => !!m)'), false);
  P2.ws.close();
  pass('a second tab is read-only and refuses to save');

  // Narrow touch layout: one drawer at a time, controls inside the viewport.
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.dispatchEvent(new Event("resize"))'); await sleep(300);
  await evaluate('__sosaria.hud.panels.open("atlas")'); await sleep(200);
  await evaluate('__sosaria.hud.panels.open("chronicle")'); await sleep(400);
  assert.equal(await evaluate('[...document.querySelectorAll(".panel.open")].length'), 1);
  assert.equal(await evaluate('document.getElementById("btn-atlas").getAttribute("aria-expanded")'), 'false', 'the closed drawer updates its button');
  assert.ok(await evaluate('(() => { const r = document.querySelector(".toolbar").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()'));
  await screenshot('mobile-chronicle.png');
  pass('narrow layout keeps one drawer and the toolbar on screen');

  assert.deepEqual(errors, []);
  const device = await evaluate('({ userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, webgl2: __sosaria.renderer.capabilities.isWebGL2, renderer: __sosaria.renderer.getContext().getParameter(__sosaria.renderer.getContext().RENDERER) })');
  await writeFile(join(artifactDir, 'results.json'), JSON.stringify({ url, device, checks, metrics, errors, note: 'Headless Chrome with SwiftShader software rendering: timings are diagnostic, not GPU performance.' }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, metrics, errors, artifacts: artifactDir }, null, 2));
} finally {
  browserWs?.close(); chrome.kill('SIGTERM');
}
