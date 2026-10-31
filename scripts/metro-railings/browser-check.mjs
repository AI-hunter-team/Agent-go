import { browserCheck } from "../station-kit/browser-harness.mjs";

const [chrome, destination, address] = process.argv.slice(2);
if (!chrome || !destination || !address) throw new Error("Usage: node scripts/metro-railings/browser-check.mjs <chrome> <output-directory> <preview-url>");
await browserCheck(chrome, destination, address, async ({ evaluate, waitFor, screenshot, send, consoleErrors, responses }) => {
  await waitFor("window.metroRailingsInspect?.().loaded");
  const compare = await evaluate("window.metroRailingsInspect()"); await screenshot("01-compare.png");
  for (const [mode, file] of [["metal", "02-metal.png"], ["glass", "03-glass.png"], ["corner", "04-corners.png"], ["stairs", "05-stairs.png"]]) {
    await evaluate(`window.metroRailingsSetView(${JSON.stringify(mode)},3)`);
    await waitFor(`window.metroRailingsInspect().mode===${JSON.stringify(mode)}`); await screenshot(file);
  }
  await evaluate("window.metroRailingsSetView('glass',0.32)"); await screenshot("06-short-span.png");
  await evaluate("window.metroRailingsSetView('compare',6)"); await screenshot("07-long-span.png");
  const cycles = [];
  for (let i = 0; i < 3; i++) {
    for (const mode of ["metal", "glass", "stairs", "corner", "compare"]) await evaluate(`window.metroRailingsSetView(${JSON.stringify(mode)},4.2)`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    cycles.push(await evaluate("window.metroRailingsInspect()"));
  }
  if (cycles[2].geometries !== cycles[1].geometries || cycles[2].textures !== cycles[1].textures) throw new Error("Resource growth between repeated view cycles: " + JSON.stringify(cycles));
  await evaluate("window.metroRailingsSetView('compare',3)");
  await send("Emulation.setDeviceMetricsOverride", { width: 480, height: 900, deviceScaleFactor: 1, mobile: false });
  await screenshot("08-narrow.png");
  const narrow = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
  if (narrow.scroll > narrow.width) throw new Error("Narrow layout overflows horizontally");
  if (consoleErrors.length) throw new Error("Browser errors: " + consoleErrors.join("\n"));
  if (responses.filter((r) => /metro-railings\/models\/.*\.glb/.test(r.url) && r.status === 200).length !== 7) throw new Error("Not all seven exported models were loaded");
  return { compare, cycles, narrow, checkedModes: ["compare", "metal", "glass", "corner", "stairs"], loadedGLBs: 7 };
});
