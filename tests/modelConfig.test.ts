import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ModelConfigStore } from "../server/modelConfig";
import { createApp, type AppDeps } from "../server/app";
import { ResponsesClient, ResponsesLlmService } from "../server/responses";
import { debugFetch } from "../server/debug";
import { SessionStore } from "../server/sessions";
import { Engine } from "../src/sim/engine";
import { DebugLogger } from "../server/debug";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { response, jsonResponse, toolCall } from "./responsesSupport";

const secret = "user-private-key";
/** 提供可验证的 Responses 工具调用，不访问真实供应商。 */
const completion = () => Response.json(response({ model: undefined, output: [toolCall(JSON.stringify({ seconds: 1, reason: "验证" }), undefined, "wait")] }));
/** 模拟模型发现去重与异常条目过滤。 */
const list = () => Response.json({ data: [{ id: "model-b" }, { id: "model-a" }, { id: "model-a" }, {}, null] });
let server: Server | null = null;
afterEach(() => { server?.close(); server = null; vi.useRealTimers(); });

/** 启动隔离 API，保留独立 NPC 与诊断注入。 */
async function start(fetcher: typeof fetch, debugLogger?: DebugLogger, npc: Pick<AppDeps, "npcLlm" | "npcModelParameters"> = {}) {
  const modelConfigs = new ModelConfigStore(fetcher);
  server = createApp({ llm: null, sessions: new SessionStore(), modelConfigs, debugLogger, ...npc }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server!.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  /** 携带指定页面 token 调用本地测试服务。 */
  const call = async (path: string, body?: unknown, token?: string, method = body === undefined ? "GET" : "POST") => {
    const response = await fetch(base + path, { method, headers: {
      "content-type": "application/json", ...(token ? { "x-model-config": token } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  return { call, modelConfigs };
}

describe("browser model configuration", () => {
  test("authenticates model discovery, normalizes the domain and keeps keys private", async () => {
    const fetcher = vi.fn(async () => list());
    const store = new ModelConfigStore(fetcher);
    const result = await store.verify("https://gateway.test", secret);
    expect(result.baseUrl).toBe("https://gateway.test");
    expect(result.models).toEqual(["model-a", "model-b"]);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(fetcher).toHaveBeenCalledWith("https://gateway.test/models", expect.objectContaining({
      headers: { authorization: `Bearer ${secret}` }, redirect: "error",
    }));
    expect(store.get(result.token).llm).toBeNull();
    const custom = await store.verify("https://gateway.test/custom/api/", secret);
    expect(custom.baseUrl).toBe("https://gateway.test/custom/api");
  });

  test.each(["bad-url", "file:///etc/passwd", "https://user:pass@example.test", "https://gateway.test?key=oops", "https://gateway.test/#fragment"])("rejects invalid base URL %s before sending credentials", async (url) => {
    const fetcher = vi.fn();
    await expect(new ModelConfigStore(fetcher).verify(url, secret)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test.each([401, 403, 429, 500])("reports HTTP %i without leaking upstream response or credentials", async (status) => {
    const store = new ModelConfigStore(async () => new Response(secret, { status }));
    await expect(store.verify("https://gateway.test", secret)).rejects.not.toThrow(secret);
    await expect(store.verify("https://gateway.test", secret)).rejects.toMatchObject({ status: 422 });
  });

  test("supports a manual model when discovery is unavailable and probes real tool compatibility", async () => {
    const requests: { url: string; body: any }[] = [];
    const store = new ModelConfigStore(async (input, init) => {
      requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return requests.length === 1 ? new Response(null, { status: 404 }) : completion();
    });
    const result = await store.verify("https://gateway.test", secret);
    expect(result.models).toEqual([]);
    expect(await store.enable(result.token, "manual-model")).toEqual({ llm: true, model: "manual-model" });
    expect(requests[1]).toMatchObject({ url: "https://gateway.test/responses", body: {
      model: "manual-model", tool_choice: "required", parallel_tool_calls: false, reasoning: { effort: "none" },
    } });
  });

  test("refuses to enable a model that cannot return a valid action", async () => {
    const store = new ModelConfigStore(async (input) => String(input).endsWith("/models") ? list() : Response.json(response({ output: [] })));
    const { token } = await store.verify("https://gateway.test", secret);
    await expect(store.enable(token, "model-a")).rejects.toThrow("模型验证失败");
    expect(store.get(token).llm).toBeNull();
  });

  test("explains an advertised but unavailable model, logs its probe safely and allows selecting another model", async () => {
    const directory = await mkdtemp(join(tmpdir(), "model-probe-"));
    const fetcher = vi.fn(async (input, init) => {
      if (String(input).endsWith("/models")) return list();
      const model = JSON.parse(String(init?.body)).model;
      return model === "model-a" ? Response.json({ error: { type: "invalid_request_error",
        message: `The model is not supported when using Codex with a ChatGPT account. ${secret}`,
      } }, { status: 400, headers: { "x-request-id": "failed-probe" } }) : completion();
    });
    try {
      const { call } = await start(fetcher, new DebugLogger(true, directory));
      const verified = await call("/api/model/verify", { baseUrl: "https://gateway.test", apiKey: secret });
      const token = verified.body.token;
      const rejected = await call("/api/model/enable", { model: "model-a" }, token);
      expect(rejected.status).toBe(422);
      expect(rejected.body.error).toContain("当前上游账号不支持此模型");
      expect(fetcher).toHaveBeenCalledTimes(2); // Discovery + one probe, without hidden retry.
      const logs = (await Promise.all((await readdir(directory)).map((name) => readFile(join(directory, name), "utf8")))).join("");
      expect(logs).not.toContain(secret);
      const record = JSON.parse(logs.trim());
      expect(record.input).toEqual({ purpose: "model_verification", model: "model-a", reasoningEffort: "none" });
      expect(record.debug).toMatchObject({ operation: "decide", error: expect.stringContaining("当前上游账号不支持此模型") });
      expect(record.debug.calls[0]).toMatchObject({ status: 400, providerRequestId: "failed-probe" });
      expect((await call("/api/health", undefined, token)).status).toBe(409);
      expect((await call("/api/model/enable", { model: "model-b" }, token)).body).toEqual({ llm: true, model: "model-b" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("expires idle credentials and clears discarded credentials", async () => {
    const store = new ModelConfigStore(async () => list());
    const { token } = await store.verify("https://gateway.test", secret);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    expect(() => store.get(token)).toThrow("过期");
    vi.restoreAllMocks();
    const next = await store.verify("https://gateway.test", secret);
    store.delete(next.token);
    expect(() => store.get(next.token)).toThrow("过期");
  });

  test("activates only the requesting browser and pins each game's model", async () => {
    const requestedModels: string[] = [];
    const requestedEfforts: string[] = [];
    const npcSecret = "developer-npc-private-key";
    const npcRequests: { url: string; authorization: string | null; body: any }[] = [];
    const npcLlm = new ResponsesLlmService(new ResponsesClient("https://npc-gateway.test/v1", npcSecret, debugFetch(async (input, init) => {
      npcRequests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
      return Response.json(jsonResponse({ accepted: true, reply: "可以，你先吧", reason: "愿意帮助" }, { model: "developer-npc" }));
    })), { model: "developer-npc", maxTokens: 4096, reasoningEffort: "none", openaiStream: false });
    const { call } = await start(async (input, init) => {
      if (String(input).endsWith("/models")) return list();
      const request = JSON.parse(String(init?.body));
      requestedModels.push(request.model);
      requestedEfforts.push(request.reasoning.effort);
      if (request.text) {
        const value = request.text.format.name === "guidance"
          ? { summary: "自定义模型指导", risk: "保守", priorities: [], rules: [], creativeIdeas: [], notExecutable: [], initialPlan: [] }
          : request.text.format.name === "npc_reply"
            ? { accepted: true, reply: "可以，你先吧", reason: "愿意帮助" }
            : { mechanic: "unsupported", reason: "自定义模型分类" };
        return Response.json(jsonResponse(value, { model: request.model }));
      }
      return completion();
    }, undefined, { npcLlm, npcModelParameters: { provider: "responses", model: "developer-npc", maxTokens: 4096 } });
    const verified = await call("/api/model/verify", { baseUrl: "https://gateway.test", apiKey: secret });
    const token = verified.body.token;
    expect(verified.status).toBe(200);
    expect((await call("/api/health", undefined, token)).status).toBe(409);
    expect((await call("/api/model/enable", { model: "model-a" }, token)).body).toEqual({ llm: true, model: "model-a" });
    expect((await call("/api/health")).body).toEqual({ llm: false, model: null });
    expect((await call("/api/health", undefined, token)).body.model).toBe("model-a");
    expect((await call("/api/guidance/normalize", { text: "稳妥过闸" }, token)).body.guidance.summary).toBe("自定义模型指导");
    const session = await call("/api/session", { guidance: "", runId: "configured-debug-run" }, token);
    await call("/api/model/enable", { model: "model-b", reasoningEffort: "max" }, token);
    const turn = { triggers: [], lastResult: null, observation: new Engine(1).observe() };
    const body = { sessionId: session.body.sessionId, turn };
    expect((await call("/api/agent/decide", body)).status).toBe(403);
    const decision = await call("/api/agent/decide", body, token);
    expect(decision.body.action.type).toBe("wait");
    expect(decision.body.debug).toMatchObject({ runId: "configured-debug-run", parameters: { model: "model-a", maxTokens: 4096, reasoningEffort: "none", effort: "none" } });
    expect(decision.body.debug.calls).toHaveLength(1);
    expect(decision.body.debug.calls[0]).toMatchObject({ model: "model-a", status: 200 });
    expect(JSON.stringify(decision.body.debug)).not.toContain(secret);
    const classification = { sessionId: session.body.sessionId, intent: "飞过去", observation: turn.observation };
    expect((await call("/api/creative/classify", classification)).status).toBe(403);
    expect((await call("/api/creative/classify", classification, token)).body).toMatchObject({ reason: "自定义模型分类", source: "llm" });
    const dialogue = { sessionId: session.body.sessionId, npc: { id: "p2", trait: "普通乘客", temperament: "愿意帮助", facility: "TVM-1", queuePosition: 1, queueLength: 2 }, message: "能让我先吗", history: [], model: "model-b", apiKey: secret, baseUrl: "https://gateway.test" };
    expect((await call("/api/npc/negotiate", dialogue)).status).toBe(403);
    const npc = await call("/api/npc/negotiate", dialogue, token);
    expect(npc.body).toMatchObject({ accepted: true, source: "llm", model: "developer-npc", debug: { runId: "configured-debug-run", operation: "negotiate", parameters: { model: "developer-npc", maxTokens: 4096 } } });
    expect(npc.body.debug.calls).toHaveLength(1);
    expect(JSON.stringify(npc.body.debug)).not.toContain(secret);
    expect(JSON.stringify(npc.body)).not.toContain(npcSecret);
    const nextSession = await call("/api/session", { guidance: "向 NPC 求助" }, token);
    const nextNpc = await call("/api/npc/negotiate", { ...dialogue, sessionId: nextSession.body.sessionId }, token);
    expect(nextNpc.body.model).toBe("developer-npc");
    expect(npcRequests).toHaveLength(2);
    for (const sent of npcRequests) {
      expect(sent).toMatchObject({ url: "https://npc-gateway.test/v1/responses", authorization: `Bearer ${npcSecret}`, body: { model: "developer-npc", reasoning: { effort: "none" } } });
      expect(JSON.stringify(sent.body)).not.toContain(secret);
    }
    expect(requestedModels).toEqual(["model-a", "model-a", "model-b", "model-a", "model-a"]);
    expect(requestedEfforts).toEqual(["none", "none", "max", "none", "none"]);
    const next = await call("/api/session", { guidance: "" }, token);
    const newDecision = await call("/api/agent/decide", { sessionId: next.body.sessionId, turn }, token);
    expect(newDecision.body.debug.parameters).toMatchObject({ model: "model-b", reasoningEffort: "max" });
    expect(requestedEfforts.at(-1)).toBe("max");
    await call("/api/session/" + next.body.sessionId, undefined, token, "DELETE");
    const report = { status: "success", debug: { runId: "configured-debug-run" } };
    expect((await call(`/api/session/${session.body.sessionId}/report`, { report })).status).toBe(403);
    expect((await call(`/api/session/${session.body.sessionId}/report`, { report }, token)).status).toBe(204);
    expect((await call(`/api/session/${session.body.sessionId}`, undefined, undefined, "DELETE")).status).toBe(403);
    expect((await call(`/api/session/${session.body.sessionId}`, undefined, token, "DELETE")).status).toBe(204);
    expect((await call("/api/model/config", undefined, token, "DELETE")).status).toBe(204);
    expect((await call("/api/health", undefined, token)).status).toBe(401);
  });

  test("a user-configured agent cannot supply the missing developer NPC model", async () => {
    const requestedModels: string[] = [];
    const { call } = await start(async (input, init) => {
      if (String(input).endsWith("/models")) return list();
      requestedModels.push(JSON.parse(String(init?.body)).model);
      return completion();
    });
    const { body: { token } } = await call("/api/model/verify", { baseUrl: "https://gateway.test", apiKey: secret });
    await call("/api/model/enable", { model: "model-a" }, token);
    const { body: { sessionId } } = await call("/api/session", { guidance: "向 NPC 求助" }, token);
    const npc = await call("/api/npc/negotiate", { sessionId, npc: { id: "p2", trait: "普通乘客", temperament: "友善", facility: "TVM-1", queuePosition: 1, queueLength: 2 }, message: "能让我先吗", history: [] }, token);
    expect(npc.status).toBe(503);
    expect(npc.body).toMatchObject({ accepted: false, source: "error", model: null });
    expect(requestedModels).toEqual(["model-a"]);
  });
});

test.each(["none", "low", "high", "max"] as const)("enable probes and stores %s explicitly", async (reasoningEffort) => {
  const requests: any[] = [];
  const store = new ModelConfigStore(async (url, init) => {
    if (String(url).endsWith("/models")) return list();
    requests.push(JSON.parse(String(init?.body))); return completion();
  });
  const { token } = await store.verify("https://api.deepseek.com/", secret);
  await store.enable(token, "deepseek-flash", reasoningEffort);
  expect(requests[0].reasoning.effort).toBe(reasoningEffort);
  expect(store.get(token).settings?.reasoningEffort).toBe(reasoningEffort);
  const previous = store.get(token).llm;
  await expect(store.enable(token, "deepseek-flash", "unknown")).rejects.toMatchObject({ status: 400 });
  expect(store.get(token).llm).toBe(previous);
  expect(requests).toHaveLength(1);
});

test("unsupported effort is reported without downgrading or overwriting enabled settings", async () => {
  let calls = 0;
  const store = new ModelConfigStore(async (url) => String(url).endsWith("/models") ? list()
    : ++calls === 1 ? completion() : new Response("private upstream message", { status: 400 }));
  const { token } = await store.verify("https://gateway.test/v1/", secret);
  await store.enable(token, "model-a");
  const previous = store.get(token).llm;
  await expect(store.enable(token, "model-a", "max")).rejects.toThrow("思考档位");
  expect(store.get(token).llm).toBe(previous);
  expect(store.get(token).settings?.reasoningEffort).toBe("none");
  expect(calls).toBe(2);
});
