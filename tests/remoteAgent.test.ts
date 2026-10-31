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


test("reports without a user binding use the server review fallback even after a page model change", async () => {
  const fetcher = vi.fn(async () => Response.json({ available: true, llm: true, model: "browser-model" }));
  vi.stubGlobal("fetch", fetcher);
  const { Api } = await import("../src/agent/remoteAgent");
  const { failedReport, analysis } = await import("./reviewFixture");
  const { buildReviewInput } = await import("../src/shared/review");
  await Api.enableModel("browser-secret-token", "browser-model");
  await Api.reviewStatus();
  await Api.review(buildReviewInput(failedReport()));
  await Api.draftGuidance("", [analysis.strategies[0]]);
  await Api.health();
  for (const [path, init] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
    if (path.startsWith("/api/review")) expect(new Headers(init.headers).has("x-model-config")).toBe(false);
  }
  expect(new Headers((fetcher.mock.calls.at(-1) as unknown as [string, RequestInit])[1].headers).get("x-model-config")).toBe("browser-secret-token");
});


test("a run's review capability survives session disposal and later page-model changes", async () => {
  const { Api } = await import("../src/agent/remoteAgent");
  const { failedReport } = await import("./reviewFixture");
  const calls: { path: string; headers: Headers }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    calls.push({ path, headers: new Headers(init.headers) });
    if (path === "/api/session") return Response.json({ sessionId: "run-session", reviewToken: "start-review-capability" });
    return Response.json({ available: true, llm: true, model: "test-model" });
  });
  await Api.enableModel("start-config", "test-model");
  const started = await Api.createSession("", null, "run-with-model");
  const report = failedReport(); report.debug!.runId = "run-with-model";
  await Api.enableModel("later-config", "test-model");
  await Api.deleteSession(started.sessionId);
  const reviewApi = Api.forReview(report);
  await reviewApi.reviewStatus();
  await reviewApi.review((await import("../src/shared/review")).buildReviewInput(report));
  const reviews = calls.filter(c => c.path.startsWith("/api/review"));
  expect(reviews).toHaveLength(2);
  expect(reviews.map(c => c.headers.get("x-review-config"))).toEqual(["start-review-capability", "start-review-capability"]);
  expect(reviews.every(c => !c.headers.has("x-model-config"))).toBe(true);
});

test("offline starts snapshot an existing user configuration but remain offline when none exists", async () => {
  const { Api } = await import("../src/agent/remoteAgent");
  const calls: { path: string; headers: Headers }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    calls.push({ path, headers: new Headers(init.headers) });
    return Response.json(path === "/api/review/binding" ? { reviewToken: "offline-user-review" } : { available: true, llm: true, model: "test-model" });
  });
  await Api.bindReview("no-user-run");
  expect(calls).toEqual([]);
  await Api.enableModel("start-config", "test-model");
  await Api.bindReview("offline-user-run");
  await Api.clearModel();
  const { failedReport } = await import("./reviewFixture");
  const report = failedReport(); report.debug!.runId = "offline-user-run";
  await Api.forReview(report).reviewStatus();
  expect(calls.find(c => c.path === "/api/review/binding")?.headers.get("x-model-config")).toBe("start-config");
  expect(calls.at(-1)?.headers.get("x-review-config")).toBe("offline-user-review");
});

test("a quickly-ended offline report waits for its user binding instead of charging the server fallback", async () => {
  const { Api } = await import("../src/agent/remoteAgent");
  let completeBinding!: (value: Response) => void;
  const reviews: Headers[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/review/binding") return new Promise<Response>(r => { completeBinding = r; });
    if (path === "/api/review/status") reviews.push(new Headers(init.headers));
    return Response.json({ llm: true, model: "user-model", available: true });
  });
  await Api.enableModel("user-config", "user-model");
  const pending = Api.bindReview("quick-offline-run");
  const { failedReport } = await import("./reviewFixture");
  const report = failedReport(); report.debug!.runId = "quick-offline-run";
  const status = Api.forReview(report).reviewStatus();
  expect(reviews).toEqual([]);
  completeBinding(Response.json({ reviewToken: "quick-review" }));
  await pending; await status;
  expect(reviews.map(h => h.get("x-review-config"))).toEqual(["quick-review"]);
});

test("a failed offline binding can retry with the start configuration after the page model changes", async () => {
  const { Api } = await import("../src/agent/remoteAgent");
  const calls: { path: string; headers: Headers }[] = [];
  let bindingCalls = 0;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    calls.push({ path, headers: new Headers(init.headers) });
    if (path === "/api/review/binding") {
      if (++bindingCalls === 1) return Response.json({ error: "temporary outage" }, { status: 503 });
      return Response.json({ reviewToken: "recovered-start-review" });
    }
    return Response.json({ llm: true, model: "test", available: true });
  });
  await Api.enableModel("start-config", "test");
  await expect(Api.bindReview("recover-offline-run")).rejects.toThrow("temporary outage");
  await Api.enableModel("later-config", "test");
  expect(calls.some(c => c.path === "/api/model/config" && c.headers.get("x-model-config") === "start-config")).toBe(false);
  const { failedReport } = await import("./reviewFixture");
  const report = failedReport(); report.debug!.runId = "recover-offline-run";
  const client = Api.forReview(report);
  await expect(client.reviewStatus()).resolves.toEqual({ llm: true, model: "test", available: true });
  await client.reviewStatus();
  expect(calls.filter(c => c.path === "/api/review/binding").map(c => c.headers.get("x-model-config"))).toEqual(["start-config", "start-config"]);
  expect(calls.filter(c => c.path === "/api/review/status").map(c => c.headers.get("x-review-config"))).toEqual(["recovered-start-review", "recovered-start-review"]);
  expect(calls.filter(c => c.path === "/api/review/status").every(c => !c.headers.has("x-model-config"))).toBe(true);
});
