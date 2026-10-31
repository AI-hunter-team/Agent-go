import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const [chrome, destination, address = "http://127.0.0.1:5190/"] = process.argv.slice(2);
if (!chrome || !destination) throw new Error("Usage: node browser-check.mjs <Chrome executable> <artifact directory> [preview URL]");
const output = resolve(destination); await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "agent-go-kit-browser-"));
const browser = spawn(chrome, [
  "--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
  "--user-data-dir=" + profile, "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  "--disable-background-networking", "about:blank",
], { windowsHide: true, stdio: "ignore" });
// 等待浏览器完成启动、渲染或资源释放。
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
// 核对实际场景中的路线穿口、模块端点连续性以及箭头所在直段。
function checkGuideRoutes(scene) {
  const routes = scene.guides.filter((item) => item.id.startsWith("route-"));
  const expectedCrossings = scene.layout === "straight" ? [-1.5] : scene.layout === "dogleg" ? [-4.5, 4.5] : [-4.5, 1.5];
  const crossings = routes.filter((item) => item.id === "route-straight" && item.z === -1.5).map((item) => item.x).sort((a, b) => a - b);
  if (JSON.stringify(crossings) !== JSON.stringify(expectedCrossings) || crossings.some((x) => !scene.securityOpenings.includes(x))) {
    throw new Error(scene.layout + ": guide route crosses a wall or misses its opening: " + JSON.stringify(crossings));
  }
  const endpoints = routes.flatMap((item, index) => {
    const local = item.id === "route-straight" ? [[0, 1.5], [0, -1.5]] : item.id === "route-turn" ? [[0, 1.5], [1.5, 0]] : [[0, 1.5], [-1.5, 0], [1.5, 0]];
    return local.map(([x, z]) => ({ index, x: item.x + x * Math.cos(item.rotation) + z * Math.sin(item.rotation), z: item.z - x * Math.sin(item.rotation) + z * Math.cos(item.rotation) }));
  });
  const unmatched = endpoints.filter((point) => !endpoints.some((other) => other.index !== point.index && Math.hypot(point.x - other.x, point.z - other.z) < 0.001));
  const expectedEnds = scene.layout === "straight" ? [[-1.5, 9], [-1.5, -9]] : [[-1.5, 9], [-4.5, -9], [1.5, -9]];
  if (unmatched.length !== expectedEnds.length || expectedEnds.some(([x, z]) => !unmatched.some((point) => Math.hypot(point.x - x, point.z - z) < 0.001))) {
    throw new Error(scene.layout + ": guide modules have disconnected endpoints: " + JSON.stringify(unmatched));
  }
  const arrows = scene.guides.filter((item) => item.id === "marking-arrow");
  if (arrows.length < 3 || arrows.some((arrow) => !routes.some((route) => {
    const dx = arrow.x - route.x, dz = arrow.z - route.z;
    return route.id === "route-straight" && Math.abs(dx * Math.cos(route.rotation) - dz * Math.sin(route.rotation)) < 0.001
      && Math.abs(dx * Math.sin(route.rotation) + dz * Math.cos(route.rotation)) <= 1.501 && Math.cos(arrow.rotation - route.rotation) > 0.999;
  }))) throw new Error(scene.layout + ": an arrow is detached from its route or points across it.");
}
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await sleep(100); }
  }
  if (!port) throw new Error("Chrome did not expose a debugging port.");
  const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then((r) => r.json());
  const target = targets.find((t) => t.type === "page"); if (!target) throw new Error("No browser page.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  let sequence = 0; const pending = new Map(), consoleErrors = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id) {
      const handler = pending.get(message.id);
      if (handler) { clearTimeout(handler.timer); pending.delete(message.id); message.error ? handler.reject(new Error(JSON.stringify(message.error))) : handler.resolve(message.result); }
    } else if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails.text + " " + (message.params.exceptionDetails.exception?.description ?? ""));
    else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") consoleErrors.push(message.params.entry.text);
  });
  // 发送带超时的 DevTools 请求，并按请求编号接收结果。
  const send = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); rejectCall(new Error("CDP timeout: " + method)); }, 15000);
    pending.set(id, { resolve: resolveCall, reject: rejectCall, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  // 在被测页面读取状态或操作控件，页面异常直接使检查失败。
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  // 等待画面稳定后保存本地核对截图。
  const screenshot = async (name) => {
    await sleep(600);
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(output, name), Buffer.from(r.data, "base64"));
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1060, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: address });
  let status;
  for (let i = 0; i < 150; i++) {
    status = await evaluate("window.stationKitValidation ?? null");
    if (status?.ready) break;
    if (status?.errors.length) throw new Error(status.errors.join("; "));
    await sleep(250);
  }
  if (!status?.ready || status.loaded !== status.expected || status.boundsChecked !== status.expected) {
    await writeFile(join(output, "station-kit-browser-failure.json"), JSON.stringify({ status, consoleErrors, page: await evaluate("({url:location.href,text:document.body.innerText.slice(0,2000)})") }, null, 2));
    throw new Error("Not all GLBs passed browser loading and bounds checks: " + JSON.stringify(status) + "; " + consoleErrors.join("; "));
  }
  await screenshot("station-kit-scene.png");
  const interior = await evaluate("window.stationKitInspect()");
  checkGuideRoutes(interior);
  if (interior.cameraView !== "interior" || Math.abs(interior.cameraPosition[1] - 1.62) > 0.02) throw new Error("Default interior camera is not at eye height.");
  if (interior.ceilingPanels !== 48 || interior.reflections !== 1 || !interior.contactShadows) throw new Error("Interior atmosphere components are missing.");
  await evaluate("document.querySelector('#surface-detail').click()");
  if ((await evaluate("window.stationKitInspect()")).contactShadows) throw new Error("Contact-shadow switch failed.");
  await evaluate("document.querySelector('#surface-detail').click()");
  await evaluate("document.querySelector('[data-camera=\"overview\"]').click()");
  const overview = await evaluate("window.stationKitInspect()");
  if (overview.cameraView !== "overview" || overview.cameraPosition[1] < 10) throw new Error("Assembly overview camera failed.");
  if (overview.ceilingPanels || overview.reflections) throw new Error("Overview did not remove the obstructing ceiling/reflection layer.");
  await screenshot("station-kit-overview.png");
  await evaluate("document.querySelector('[data-camera=\"interior\"]').click()");
  await evaluate("document.querySelector('[data-layout=\"dogleg\"]').click()");
  const dogleg = await evaluate("window.stationKitInspect()");
  checkGuideRoutes(dogleg);
  if (dogleg.layout !== "dogleg" || dogleg.meshes < 100) throw new Error("Dog-leg assembly did not render.");
  await screenshot("station-kit-dogleg.png");
  await evaluate("document.querySelector('[data-asset=\"fare-gate\"]').click(); const s=document.querySelector('#state');s.value='broken';s.dispatchEvent(new Event('change')); const g=document.querySelector('#gate');g.value='100';g.dispatchEvent(new Event('input'))");
  const gate = await evaluate("window.stationKitInspect()");
  if (gate.hinges.length !== 2 || gate.hinges.some((v) => Math.abs(v) < 1) || !gate.indicators.every((name) => name === "kit.status.broken")) throw new Error("Gate hinge/state check failed: " + JSON.stringify(gate));
  const download = await evaluate("document.querySelector('#download').href");
  if (!download.endsWith("fare-gate-broken.glb")) throw new Error("Download does not match selected variant.");
  await screenshot("station-kit-gate.png");
  await evaluate("document.querySelector('[data-mode=\"materials\"]').click()");
  const materials = await evaluate("window.stationKitInspect()");
  if (materials.meshes !== 12) throw new Error("Material swatch scene missing geometry.");
  await screenshot("station-kit-materials.png");
  const geometryBefore = await evaluate("window.stationKitInspect().gpuGeometries");
  for (let i = 0; i < 3; i++) {
    await evaluate("document.querySelector('[data-mode=\"scene\"]').click()"); await sleep(300);
    await evaluate("document.querySelector('[data-mode=\"materials\"]').click()"); await sleep(300);
  }
  const geometryAfter = await evaluate("window.stationKitInspect().gpuGeometries");
  if (geometryAfter !== geometryBefore) throw new Error("Repeated view switches leaked GPU geometries: " + geometryBefore + " -> " + geometryAfter);
  await evaluate("document.querySelector('[data-mode=\"scene\"]').click();document.querySelector('[data-layout=\"straight\"]').click()");
  const straight = await evaluate("window.stationKitInspect()");
  checkGuideRoutes(straight);
  if (straight.layout !== "straight") throw new Error("Straight layout switch failed.");
  await evaluate("document.querySelector('[data-camera=\"overview\"]').click()");
  await screenshot("station-kit-straight.png");
  const report = { browser: await send("Browser.getVersion"), validation: status, checks: { interior, overview, dogleg, straight, gate, materialMeshes: materials.meshes, geometryBefore, geometryAfter, downloadMatchesVariant: true }, consoleErrors };
  await writeFile(join(output, "station-kit-browser-check.json"), JSON.stringify(report, null, 2) + "\n");
  if (consoleErrors.length) throw new Error("Browser errors: " + consoleErrors.join("; "));
  console.log(JSON.stringify({ passed: true, modelsLoaded: status.loaded, boundsChecked: status.boundsChecked, gateHinges: gate.hinges, renderer: status.renderer, routeLayoutsChecked: 3, screenshots: 6 }));
} finally {
  socket?.close(); browser.kill();
  await sleep(700);
  // Only clean the unique temporary profile created by this process.
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && profile.split(sep).pop().startsWith("agent-go-kit-browser-")) {
    try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chrome children can release files later. */ }
  }
}
