import { afterEach, beforeEach, expect, test, vi } from "vitest";

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
