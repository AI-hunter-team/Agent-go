import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
export async function browserCheck(chrome, destination, address, check) {
  const output = resolve(destination); await mkdir(output, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), "agent-go-integration-browser-"));
  const gpuFlags = process.env.STATION_BROWSER_GPU === "hardware" ? [] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  const browser = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + profile, ...gpuFlags, "--disable-background-networking", "--disable-background-timer-throttling", "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i++) { try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await sleep(100); } }
    if (!port) throw new Error("Chrome did not expose a debugging port.");
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((done, fail) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", fail, { once: true }); });
    let sequence = 0; const pending = new Map(), consoleErrors = [], responses = [];
    socket.addEventListener("message", ({ data }) => {
      const m = JSON.parse(String(data));
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } }
      else if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
      else if (m.method === "Network.responseReceived") responses.push({ url: m.params.response.url, status: m.params.response.status });
    });
    const send = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); rejectCall(new Error("CDP timeout: " + method)); }, 20000);
      pending.set(id, { resolve: resolveCall, reject: rejectCall, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (expression, timeout = 45000) => { const deadline = Date.now() + timeout; while (Date.now() < deadline) { const value = await evaluate(expression); if (value) return value; await sleep(250); } throw new Error("Condition timed out: " + expression); };
    const click = (text) => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click();return true;})()`);
    const screenshot = async (name) => { await sleep(500); const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(join(output, name), Buffer.from(r.data, "base64")); };
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1060, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: address });
    let result;
    try { result = await check({ send, evaluate, waitFor, click, screenshot, consoleErrors, responses, output }); }
    catch (error) {
      await writeFile(join(output, "failure.json"), JSON.stringify({ consoleErrors, responses, page: await evaluate("({text:document.body.innerText,url:location.href})") }, null, 2));
      await screenshot("failure.png"); throw error;
    }
    const report = { browser: await send("Browser.getVersion"), result, consoleErrors, responses };
    await writeFile(join(output, "game-browser-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ passed: true, ...result, consoleErrors }));
  } catch (error) {
    await writeFile(join(output, "failure.txt"), String(error.stack ?? error)); throw error;
  } finally {
    socket?.close(); browser.kill(); await sleep(700);
    const checked = resolve(profile);
    if (checked.startsWith(resolve(tmpdir()) + sep) && checked.split(sep).pop().startsWith("agent-go-integration-browser-")) {
      try { await rm(checked, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Browser processes can release their unique temporary profile later. */ }
    }
  }
}
