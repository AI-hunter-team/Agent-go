import { browserCheck, sleep } from "./browser-harness.mjs";

const [chrome, destination, address = "http://127.0.0.1:5192/?debug=1", mode = "full"] = process.argv.slice(2);
if (!chrome || !destination) throw new Error("Usage: game-check.mjs <Chrome> <evidence directory> [URL with debug=1] [full|smoke|failure]");
await browserCheck(chrome, destination, address, async ({ send, evaluate, waitFor, click, screenshot, consoleErrors, responses }) => {
  if (mode === "failure") {
    await send("Network.setBlockedURLs", { urls: ["*/assets/station-kit/models/railing-straight.glb"] });
    await send("Page.reload", { ignoreCache: true });
    await waitFor("document.body.innerText.includes('站厅素材加载失败')");
    if ((await evaluate("[...document.querySelectorAll('[role=status]')].filter(e=>e.textContent.includes('站厅素材加载失败')).length")) !== 1) throw new Error("Repeated asset failure notices.");
    if (await evaluate("!!window.stationSceneInspect")) throw new Error("Failed assets unexpectedly became the imported scene.");
    await screenshot("game-fallback.png");
    await send("Network.setBlockedURLs", { urls: [] });
    await click("重试三维素材"); await waitFor("window.stationSceneInspect?.().loaded");
    if (await evaluate("document.body.innerText.includes('站厅素材加载失败')")) throw new Error("Stale asset failure notice after recovery.");
    await screenshot("game-recovered.png");
    return { fallbackAndRetry: true, expectedAssetErrors: consoleErrors.splice(0) };
  }
  await waitFor("window.stationSceneInspect?.().loaded");
  const initial = await evaluate("window.stationSceneInspect()"); await screenshot("game-interior.png");
  await click("总览"); const overview = await waitFor("window.stationSceneInspect?.().overview && window.stationSceneInspect()");
  if (overview.modelIds.includes("ceiling-panel")) throw new Error("Overview ceiling obscures the map.");
  await screenshot("game-overview.png");
  await click("跟随"); await sleep(400);
  const before = await evaluate("window.stationSceneInspect()");
  for (let i = 0; i < 3; i++) { await click("总览"); await sleep(200); await click("跟随"); await sleep(200); }
  const after = await evaluate("window.stationSceneInspect()");
  if (after.gpuGeometries !== before.gpuGeometries || after.gpuTextures !== before.gpuTextures) throw new Error("View switches leaked GPU resources: " + JSON.stringify({ before, after }));
  await click("显示设置"); await click("使用节能预设");
  const displaySettings = await evaluate("JSON.parse(localStorage.getItem('agent-go.display.v1'))");
  if (displaySettings.quality !== "low" || displaySettings.targetFps !== 30 || !displaySettings.simpleCrowd) throw new Error("Economy preset was not applied.");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor("window.stationSceneInspect?.().shadows === false");
  if (mode === "smoke") {
    if (consoleErrors.length) throw new Error(consoleErrors.join("; "));
    return { initial, overview, displaySettings, resourceStability: { before: before.gpuGeometries, after: after.gpuGeometries }, importedModels: responses.filter((r) => r.url.endsWith('.glb') && r.status === 200).length };
  }
  await evaluate("(()=>{const input=document.querySelector('#scenario-seed');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'28');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await click("准备开局"); await click("出发"); await waitFor("!!document.querySelector('[aria-label=\"世界时间\"]')");
  await evaluate("window.stationPerformance={start:performance.now(),last:performance.now(),frame:window.stationSceneInspect().renderedFrames,samples:[],done:false};requestAnimationFrame(function sample(t){const p=window.stationPerformance,f=window.stationSceneInspect().renderedFrames;if(f!==p.frame){p.samples.push(t-p.last);p.last=t;p.frame=f;}if(t-p.start<60000)requestAnimationFrame(sample);else {p.end=t;p.done=true;}});true");
  await click("4×"); await sleep(600); await click("暂停"); await sleep(200);
  const paused = await evaluate("window.stationSceneInspect()"); await sleep(800);
  if ((await evaluate("window.stationSceneInspect().t")) !== paused.t) throw new Error("World time advanced while paused.");
  await click("继续");
  const observed = { screened: false, passedGate: false, onPlatform: false, gateOpened: false, states: new Set() };
  const started = Date.now(), deadline = started + 180000;
  while (Date.now() < deadline) {
    const state = await evaluate("window.stationSceneInspect()");
    observed.screened ||= state.player.screened; observed.passedGate ||= state.player.passedGate; observed.onPlatform ||= state.player.onPlatform;
    observed.gateOpened ||= state.devices.some((d) => d.opening > 0.5 && d.hinges.every((v) => Math.abs(v) > 0.5));
    state.devices.forEach((d) => observed.states.add(d.state));
    if (state.player.screened && !observed.securityScreenshot) { await screenshot("game-security.png"); observed.securityScreenshot = true; }
    if (state.phase === "ended") break;
    await sleep(350);
  }
  const ending = await evaluate("window.stationSceneInspect()");
  if (!ending.player.onPlatform || !observed.gateOpened) throw new Error("Offline journey/gate animation did not complete: " + JSON.stringify({ ending, observed: { ...observed, states: [...observed.states] } }));
  await screenshot("game-platform.png"); await click("查看轨迹回放");
  await waitFor("!!document.querySelector('[role=\"dialog\"] canvas')"); await screenshot("game-replay.png");
  await waitFor("window.stationPerformance.done", 70000);
  const performance = await evaluate("(()=>{const p=window.stationPerformance,s=p.samples.slice().sort((a,b)=>a-b);return {seconds:(p.end-p.start)/1000,renderUpdates:s.length,fps:s.length*1000/(p.end-p.start),p95IntervalMs:s[Math.ceil(s.length*.95)-1],quality:'low',targetFps:30,includesPausedAndIdle:true,userAgent:navigator.userAgent};})()");
  if (consoleErrors.length) throw new Error(consoleErrors.join("; "));
  return { initial, overview, ending, displaySettings, performance, pausedTime: paused.t, resourceStability: { geometries: after.gpuGeometries, textures: after.gpuTextures }, observed: { ...observed, states: [...observed.states] }, elapsedRealSeconds: (Date.now() - started) / 1000, importedModels: responses.filter((r) => r.url.endsWith('.glb') && r.status === 200).length };
});
