import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const base = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.APP_PORT || 8080}`;
const response = await fetch(base);
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /<div id="root">/);
const script = html.match(/src="([^\"]+\.js)"/)?.[1];
assert.ok(script, "Built entry script is linked");
const asset = await fetch(new URL(script, base));
assert.equal(asset.status, 200);
assert.match(asset.headers.get("content-type"), /javascript/);
assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
const unknownApi = await fetch(`${base}/api/missing`);
assert.equal(unknownApi.status, 404);
assert.match(unknownApi.headers.get("content-type"), /application\/json/);
assert.equal(typeof (await (await fetch(`${base}/api/health`)).json()).llm, "boolean");

// Run a fake upstream inside the container: no host ports, real keys or paid requests.
async function checkContainer() {
  const { default: assert } = await import("node:assert/strict");
  const { createServer } = await import("node:http");
  const { existsSync } = await import("node:fs");
  assert.notEqual(process.getuid(), 0, "Runtime must not run as root");
  for (const path of [".env", "server/index.ts", "node_modules/esbuild", "node_modules/tsx"]) {
    assert.equal(existsSync(path), false, `Runtime excludes ${path}`);
  }
  const upstream = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== "Bearer compose-fake-key") { res.writeHead(401); res.end("{}"); return; }
    if (req.url === "/v1/models") { res.end(JSON.stringify({ data: [{ id: "compose-fake-model" }] })); return; }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(request.model, "compose-fake-model");
    res.end(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: {
      role: "assistant", content: null, tool_calls: [{ id: "fake-call", type: "function", function: {
        name: "wait", arguments: JSON.stringify({ seconds: 1, reason: "Compose 模拟验证" }),
      } }],
    } }] }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const api = `http://127.0.0.1:${process.env.PORT}`;
  const call = async (path, body, token, method = body === undefined ? "GET" : "POST") => {
    const res = await fetch(api + path, { method, headers: { "content-type": "application/json", ...(token ? { "x-model-config": token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: res.status === 204 ? null : await res.json() };
  };
  try {
    const baseUrl = `http://127.0.0.1:${upstream.address().port}`;
    assert.equal((await call("/api/model/verify", { baseUrl, apiKey: "wrong-fake-key" })).status, 422);
    const verified = await call("/api/model/verify", { baseUrl, apiKey: "compose-fake-key" });
    assert.equal(verified.status, 200);
    assert.deepEqual(verified.data.models, ["compose-fake-model"]);
    const token = verified.data.token;
    assert.equal((await call("/api/model/enable", { model: "compose-fake-model" }, token)).status, 200);
    assert.equal((await call("/api/health", undefined, token)).data.model, "compose-fake-model");
    const session = await call("/api/session", { guidance: "" }, token);
    const decision = await call("/api/agent/decide", { sessionId: session.data.sessionId, turn: {
      triggers: [], lastResult: null, observation: { t: 0, self: { timeLeft: 180 } },
    } }, token);
    assert.equal(decision.data.action?.type, "wait");
    assert.equal((await call(`/api/session/${session.data.sessionId}`, undefined, token, "DELETE")).status, 204);
    assert.equal((await call("/api/model/config", undefined, token, "DELETE")).status, 204);
    assert.equal((await call("/api/health", undefined, token)).status, 401);
  } finally { await new Promise((resolve) => upstream.close(resolve)); }
  console.log("Non-root runtime, production-only dependencies and model configuration flow passed.");
}
console.log(docker("compose", "exec", "-T", "app", "node", "--input-type=module", "-e", `await (${checkContainer.toString()})();`));
docker("compose", "stop", "--timeout", "15", "app");
const id = docker("compose", "ps", "--all", "--quiet", "app");
assert.equal(docker("inspect", "--format", "{{.State.ExitCode}}", id), "0", "SIGTERM must stop the server cleanly");
console.log("Compose HTTP, model configuration and graceful shutdown smoke checks passed.");
