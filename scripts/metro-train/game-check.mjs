import assert from "node:assert/strict";
import { browserCheck, sleep } from "../station-kit/browser-harness.mjs";

const [chrome, output = "tmp/metro-integration-browser", address = "http://127.0.0.1:5204/?debug=1", mode = "full"] = process.argv.slice(2);
if (!chrome) throw new Error("Pass the local Chromium executable as the first argument");
await browserCheck(chrome, output, address, async ({ send, evaluate, waitFor, click, screenshot, consoleErrors, responses }) => {
  await waitFor("window.stationSceneInspect?.().loaded && window.metroSceneInspect?.().loaded");
  const inspect = () => evaluate("window.metroSceneInspect()");
  const initial = await inspect();
  assert(initial.trainBounds.min[0] > initial.edgeX + 0.15); assert.equal(initial.staticDraws, 14);
  assert.equal(initial.doorStates.filter((door) => door.side === -1 && door.progress === 1).length, 10);
  assert.equal(initial.doorStates.filter((door) => door.side === 1 && door.progress === 0).length, 10);
  await screenshot("01-lobby.png");
  if (mode === "failure") {
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Network.setBlockedURLs", { urls: ["*/assets/metro-train/metro-head-car.glb"] });
    await send("Page.reload", { ignoreCache: true });
    await waitFor("document.body.innerText.includes('站台列车加载失败') && window.stationSceneInspect?.().loaded");
    assert.equal((await inspect()).loaded, false); await screenshot("failure-train-only.png");
    const expectedErrors = consoleErrors.splice(0);
    await send("Network.setBlockedURLs", { urls: [] }); await click("重试素材");
    await waitFor("window.metroSceneInspect?.().loaded");
    assert(!(await evaluate("document.body.innerText.includes('站台列车加载失败')")));
    await screenshot("recovered.png"); assert.equal(consoleErrors.length, 0);
    return { initial, failureKeepsStation: true, retryRecoversTrain: true, expectedErrors };
  }
  await evaluate("document.querySelector('[aria-label=\"打开设置\"]').click()");
  await click("离线体验");
  await evaluate("[...document.querySelectorAll('summary')].find((e)=>e.textContent==='显示设置').click()");
  await click("使用节能预设");
  await evaluate("[...document.querySelectorAll('summary')].find((e)=>e.textContent==='高级设置').click()");
  await evaluate("(()=>{const input=document.querySelector('input[aria-label=\"情景种子\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'5');input.dispatchEvent(new Event('input',{bubbles:true}));const select=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('对局时限')).querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'300');select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await evaluate("document.querySelector('[aria-label=\"关闭设置\"]').click()");
  await click("进入场景 →"); await click("确认角色 →"); await click("Agent Go · 开始行动 →");
  await waitFor("window.stationSceneInspect?.().phase === 'running'");
  await click("暂停"); await click("总览");
  await waitFor("window.stationSceneInspect?.().overview && window.metroSceneInspect?.().canopyVisible === false");
  await screenshot("02-overview-with-train.png");
  const cycles = [];
  for (let i = 0; i < 3; i++) { await click("跟随"); await sleep(350); cycles.push(await inspect()); await click("总览"); await sleep(300); }
  assert.deepEqual(cycles[2].geometryIds, cycles[1].geometryIds); assert.deepEqual(cycles[1].geometryIds, cycles[0].geometryIds);
  await click("跟随"); await click("4×"); await click("继续");
  let ending; const deadline = Date.now() + 210000;
  while (Date.now() < deadline) { ending = await evaluate("window.stationSceneInspect()"); if (ending.phase === "ended") break; await sleep(300); }
  assert(ending?.player.onPlatform && ending.player.screened && ending.player.passedGate, JSON.stringify(ending));
  await screenshot("03-platform-victory.png");
  await click("总览"); await screenshot("04-platform-overview.png");
  await waitFor("window.stationSceneInspect?.().shadows === false && window.metroSceneInspect?.().loaded");
  await screenshot("05-low-quality.png");
  const lowQuality = await inspect();
  await click("回正"); await sleep(500); await screenshot("06-platform-train.png");
  await send("Emulation.setDeviceMetricsOverride", { width: 480, height: 860, deviceScaleFactor: 1, mobile: false });
  await screenshot("07-mobile.png");
  const final = await inspect();
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1060, deviceScaleFactor: 1, mobile: false });
  await click("返回大厅");
  await evaluate("document.querySelector('[aria-label=\"打开设置\"]').click()");
  await evaluate("[...document.querySelectorAll('summary')].find((e)=>e.textContent==='显示设置').click()");
  await click("恢复默认"); await evaluate("document.querySelector('[aria-label=\"关闭设置\"]').click()");
  await waitFor("window.stationSceneInspect?.().shadows === true && window.metroSceneInspect?.().loaded");
  await screenshot("08-standard-restored.png");
  assert(responses.some((r) => r.url.endsWith('/assets/metro-train/metro-head-car.glb') && r.status === 200));
  assert.equal(consoleErrors.length, 0);
  return { initial, ending, cycles: cycles.map(({ geometries, textures }) => ({ geometries, textures })), lowQuality, final, stationAndTrainLoaded: true, unchangedPlatformVictory: true };
});
