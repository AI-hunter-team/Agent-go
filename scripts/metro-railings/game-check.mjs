import { browserCheck, sleep } from "../station-kit/browser-harness.mjs";

const [chrome, output, address, mode = "full"] = process.argv.slice(2);
if (!chrome || !output || !address) throw new Error("Usage: node scripts/metro-railings/game-check.mjs <chrome> <output-directory> <game-url?debug=1> [full|failure]");
await browserCheck(chrome, output, address, async ({ send, evaluate, waitFor, click, screenshot, consoleErrors, responses }) => {
  if (mode === "failure") {
    await send("Network.setBlockedURLs", { urls: ["*/assets/metro-railings/models/glass-straight.glb"] });
    await send("Page.reload", { ignoreCache: true }); await waitFor("document.body.innerText.includes('站厅素材加载失败')");
    await screenshot("fallback.png"); const expectedErrors = consoleErrors.splice(0);
    await send("Network.setBlockedURLs", { urls: [] }); await click("重试三维素材");
    await waitFor("window.stationSceneInspect?.().modelIds.includes('glass-stairs')");
    await screenshot("recovered.png");
    if (await evaluate("document.body.innerText.includes('站厅素材加载失败')")) throw new Error("Failure notice survived recovery");
    if (consoleErrors.length) throw new Error(consoleErrors.join("\n"));
    return { newRailingFailureAndRetry: true, expectedErrors };
  }
  const initial = await waitFor("window.stationSceneInspect?.().loaded && window.stationSceneInspect()");
  for (const id of ["metal-straight", "glass-straight", "glass-stairs"]) if (!initial.modelIds.includes(id)) throw new Error("Missing formal railing: " + id);
  if (initial.modelIds.includes("railing-straight")) throw new Error("Legacy railings still used in the game");
  if (initial.ceiling !== 6 || initial.stairs?.count !== 20) throw new Error("Display/stair dependency was not preserved: " + JSON.stringify(initial));
  await screenshot("01-station.png");
  const cycles = [];
  for (let i = 0; i < 3; i++) {
    await click("总览"); await sleep(250); if (!i) await screenshot("02-overview.png");
    await click("跟随"); await sleep(300); cycles.push(await evaluate("window.stationSceneInspect()"));
  }
  if (cycles[2].gpuGeometries !== cycles[1].gpuGeometries || cycles[2].gpuTextures !== cycles[1].gpuTextures) throw new Error("Formal scene resources grew: " + JSON.stringify(cycles));
  await evaluate("(()=>{const input=document.querySelector('#scenario-seed');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'28');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await click("准备开局"); await click("出发"); await click("4×");
  let seenSecurity = false, seenStairs = false, ending;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    ending = await evaluate("window.stationSceneInspect()");
    if (ending.player.screened && !seenSecurity) { seenSecurity = true; await screenshot("03-security-metal.png"); }
    if (ending.player.activity === "stairs" && !seenStairs) {
      seenStairs = true; await click("暂停"); await sleep(250); await screenshot("04-stair-glass.png");
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 800, y: 500, deltaX: 0, deltaY: -250 });
      await screenshot("05-stair-detail.png"); await click("继续");
    }
    if (ending.phase === "ended") break;
    await sleep(100);
  }
  if (!ending?.player.onPlatform || !ending.player.screened || !ending.player.passedGate || !seenStairs) throw new Error("Offline journey incomplete: " + JSON.stringify({ ending, seenStairs }));
  await screenshot("06-platform.png");
  if (consoleErrors.length) throw new Error(consoleErrors.join("\n"));
  return { initial, cycles: cycles.map((s) => ({ geometries: s.gpuGeometries, textures: s.gpuTextures })), ending, seenSecurity, seenStairs, loadedNewModels: responses.filter((r) => r.url.includes('/assets/metro-railings/models/') && r.status === 200).length };
});
