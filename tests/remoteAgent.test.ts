import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { turn } from "./responsesSupport";

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each(["fetch", "body"])("explains a disconnected local API during %s without exposing raw transport text", async (stage) => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (stage === "fetch") throw new TypeError("Load failed PRIVATE");
    return { text: async () => { throw new TypeError("Load failed PRIVATE"); } };
  }));
  const { Api } = await import("../src/agent/remoteAgent");
  await expect(Api.health()).rejects.toThrow("无法连接本地 API 服务，请确认前后端服务正在运行后重试");
});

test("explains request timeouts separately from a disconnected service", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("PRIVATE", "TimeoutError"); }));
  const { Api } = await import("../src/agent/remoteAgent");
  await expect(Api.health()).rejects.toThrow("本地服务或模型响应超时");
});

test("retains server validation errors and only enables a successful configuration", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ error: "模型验证失败：当前上游账号不支持此模型" }, { status: 422 }))
    .mockResolvedValueOnce(Response.json({ llm: true, model: "supported" }))
    .mockResolvedValueOnce(Response.json({ llm: true, model: "supported" }));
  vi.stubGlobal("fetch", fetcher);
  const { Api } = await import("../src/agent/remoteAgent");
  await expect(Api.enableModel("rejected", "unsupported")).rejects.toThrow("当前上游账号不支持此模型");
  await Api.enableModel("valid", "supported");
  await Api.health();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[2][1].headers).toMatchObject({ "x-model-config": "valid" });
});

test("browser switching and clearing models keep old session tokens until disposal", async () => {
  const { Api } = await import("../src/agent/remoteAgent");
  const calls: { path: string; method: string; token: string | null; body: any }[] = [];
  let nextSession = 0;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({ path, method: init.method!, token: headers.get("x-model-config"), body: init.body ? JSON.parse(String(init.body)) : null });
    if (path === "/api/session") return Response.json({ sessionId: "s" + ++nextSession });
    if (path === "/api/model/enable") return Response.json({ llm: true, model: "test-model" });
    return Response.json({ llm: false, model: null });
  });
  await Api.enableModel("a", "test-model");
  const first = await Api.createSession("", null);
  await Api.enableModel("b", "test-model", "max");
  const second = await Api.createSession("", null);
  await Api.clearModel();
  expect(calls.filter((call) => call.method === "DELETE")).toEqual([]);
  await Api.decide(first.sessionId, turn());
  await Api.decide(second.sessionId, turn());
  expect(calls.filter((call) => call.path === "/api/agent/decide").map((call) => call.token)).toEqual(["a", "b"]);
  expect(calls.filter((call) => call.path === "/api/model/enable").map((call) => call.body.reasoningEffort)).toEqual(["none", "max"]);
  await Api.deleteSession(first.sessionId);
  await Api.deleteSession(second.sessionId);
  expect(calls.filter((call) => call.path === "/api/model/config").map((call) => call.token)).toEqual(["a", "b"]);
});
