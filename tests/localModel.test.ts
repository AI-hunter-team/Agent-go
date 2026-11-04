import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ModelConnection } from "../src/agent/localModel";
const fixture: ModelConnection = { baseUrl: "https://models.example.invalid", apiKey: "fixture-only-key", model: "fixture", reasoningEffort: "none", token: "fixture-capability" };
const v1 = "agent-go.model-connection.v1", v2 = "agent-go.model-connection.v2";
let data: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); data = new Map();
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
});
afterEach(() => { vi.unstubAllGlobals(); });
test("default connection and capability stay only in memory across panel reopen", async () => {
  const store = await import("../src/agent/localModel");
  expect(store.saveLocalModel(fixture).saved).toBe(false); expect(data.size).toBe(0);
  expect(store.getLocalModel()).toEqual({ ...fixture, rememberKey: false });
  vi.resetModules(); expect((await import("../src/agent/localModel")).getLocalModel()).toBeNull();
});
test("explicit consent restores both credentials and token without network calls", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const store = await import("../src/agent/localModel"); expect(store.saveLocalModel(fixture, true).saved).toBe(true);
  vi.resetModules(); expect((await import("../src/agent/localModel")).getLocalModel()).toEqual({ ...fixture, rememberKey: true });
  expect(fetcher).not.toHaveBeenCalled();
});
test("legacy consent survives and migrates only after successful saving", async () => {
  data.set(v1, JSON.stringify(fixture)); const store = await import("../src/agent/localModel");
  expect(store.loadLocalModel()?.rememberKey).toBe(true); expect(data.has(v1)).toBe(true);
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: () => { throw Error("quota"); }, removeItem: (k: string) => data.delete(k) });
  expect(store.saveLocalModel(fixture, true).warning).toBeTruthy(); expect(data.has(v1)).toBe(true);
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
  store.saveLocalModel(fixture, true); expect(data.has(v1)).toBe(false); expect(JSON.parse(data.get(v2)!).version).toBe(2);
});
test("revoking consent deletes both disk versions and preserves the active connection", async () => {
  const store = await import("../src/agent/localModel"); store.saveLocalModel(fixture, true); data.set(v1, JSON.stringify(fixture));
  store.rememberLocalModel(false);
  expect(data.size).toBe(0); expect(store.getLocalModel()?.token).toBe(fixture.token); expect(store.getLocalModel()?.rememberKey).toBe(false);
  store.clearLocalModel(); expect(store.getLocalModel()).toBeNull();
});
test("storage failure does not turn successful model activation into an error", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw Error("blocked"); }, removeItem: () => {} });
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => Response.json(url.endsWith("verify") ? { token: "fixture-capability", baseUrl: fixture.baseUrl, models: ["fixture"] } : { llm: true, model: "fixture" }));
  vi.stubGlobal("fetch", fetcher); const { Api } = await import("../src/agent/remoteAgent");
  await Api.verifyModel(fixture.baseUrl, fixture.apiKey); const enabled = await Api.enableModel(fixture.token!, "fixture", "none", true);
  expect(enabled.llm).toBe(true); expect(enabled.storageWarning).toBeTruthy();
  await Api.health(); expect(new Headers(fetcher.mock.calls.at(-1)![1]?.headers).get("x-model-config")).toBe(fixture.token);
});
test("expired connections remove saved capability without a paid probe", async () => {
  const store = await import("../src/agent/localModel"); store.saveLocalModel(fixture, true);
  const fetcher = vi.fn(async () => Response.json({ error: "API 配置已过期" }, { status: 401 })); vi.stubGlobal("fetch", fetcher);
  const { Api } = await import("../src/agent/remoteAgent"); await expect(Api.health()).rejects.toThrow("会话已失效");
  expect(fetcher).toHaveBeenCalledTimes(1); expect(store.loadLocalModel()?.token).toBeUndefined(); expect(store.loadLocalModel()?.apiKey).toBe(fixture.apiKey);
});
test("failed removal is visible and invalid schemas cannot restore credentials", async () => {
  const store = await import("../src/agent/localModel"); store.saveLocalModel(fixture, true);
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, removeItem: () => { throw Error("blocked"); } });
  expect(store.rememberLocalModel(false).warning).toBeTruthy();
  data.set(v2, JSON.stringify({ version: 2, ...fixture, rememberKey: false })); expect(store.loadLocalModel()).toBeNull();
});
