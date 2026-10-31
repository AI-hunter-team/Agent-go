import { browserCheck, sleep } from "../station-kit/browser-harness.mjs";

const [chrome, output, address] = process.argv.slice(2);
if (!chrome || !output || !address) throw new Error("Usage: node scripts/metro-railings/showroom-check.mjs <chrome> <output-directory> <showroom-url>");
await browserCheck(chrome, output, address, async ({ evaluate, screenshot, waitFor, consoleErrors }) => {
  const loaded = await waitFor("window.stationKitValidation?.ready && window.stationKitValidation");
  if (loaded.expected !== 40 || loaded.loaded !== 40 || loaded.errors.length) throw new Error("Showroom assets incomplete: " + JSON.stringify(loaded));
  await screenshot("01-room.png");
  for (const id of ["metal-straight", "glass-straight", "glass-stairs", "glass-corner"]) {
    await evaluate(`document.querySelector('[data-asset="${id}"]').click()`); await sleep(300); await screenshot(id + ".png");
  }
  const cycles = [];
  for (let i = 0; i < 3; i++) {
    for (const layout of ["straight", "split", "dogleg"]) {
      await evaluate(`document.querySelector('[data-mode="scene"]').click();document.querySelector('[data-layout="${layout}"]').click()`); await sleep(250);
    }
    cycles.push(await evaluate("window.stationKitInspect()"));
  }
  if (cycles[2].gpuGeometries !== cycles[1].gpuGeometries) throw new Error("Showroom resources grew across layout changes");
  if (consoleErrors.length) throw new Error(consoleErrors.join("\n"));
  return { loaded, cycles };
});
