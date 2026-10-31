import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { createApp, type LlmService } from "../server/app";
import { ModelConfigStore } from "../server/modelConfig";
import { jsonResponse, response, toolCall } from "./responsesSupport";
import { SessionStore } from "../server/sessions";
import { ReviewFailure, buildReviewInput } from "../src/shared/review";
import { analysis, failedReport } from "./reviewFixture";

let server: Server;
afterEach(() => { server?.close(); vi.restoreAllMocks(); });
async function start(llm: LlmService | null, reviewLlm?: LlmService | null, modelConfigs?: ModelConfigStore) {
  const sessions = new SessionStore();
  server = createApp({ llm, reviewLlm, sessions, modelConfigs }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { sessions, status: async (token?: string, reviewToken?: string) => {
    const r = await fetch(base + "/api/review/status", { headers: { ...(token ? { "x-model-config": token } : {}), ...(reviewToken ? { "x-review-config": reviewToken } : {}) } });
    return { status: r.status, body: await r.json() };
  }, call: async (path: string, body: unknown, token?: string, reviewToken?: string) => {
    const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-model-config": token } : {}), ...(reviewToken ? { "x-review-config": reviewToken } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  } };
}
const meta = { model: "test", usage: null, latencyMs: 1 };
const fake = () => ({ model: "test", decide: vi.fn(), normalize: vi.fn(), classify: vi.fn(),
  review: vi.fn(async () => ({ ...meta, analysis })),
  draftGuidance: vi.fn(async () => ({ ...meta, guidance: "保留原目标，换队前比较耗时。" })),
});

test("review is independent from disposed game sessions and retains full past evidence", async () => {
  const llm = fake(); const { call, sessions } = await start(llm);
  const session = sessions.create("", null); sessions.delete(session.id);
  const input = buildReviewInput(failedReport());
  const r = await call("/api/review", { input });
  expect(r.status).toBe(200); expect(r.body.analysis).toEqual(analysis);
  expect(llm.review).toHaveBeenCalledWith(input); expect(sessions.size).toBe(0);
  expect(llm.decide).not.toHaveBeenCalled();
});
test("rejects running/success reports, malformed references, and missing model", async () => {
  const llm = fake(); const { call } = await start(llm);
  const input = buildReviewInput(failedReport());
  for (const value of [null, {}, { ...input, status: "running" }, { ...input, status: "success" }, { ...input, elapsed: -1 }]) {
    expect((await call("/api/review", { input: value })).status).toBe(400);
  }
  expect(llm.review).not.toHaveBeenCalled();
});
test("unavailable model and malformed model results produce explicit errors", async () => {
  const { call } = await start(null);
  expect((await call("/api/review", { input: buildReviewInput(failedReport()) })).status).toBe(503);
});
test("draft sends only selected strategies and enforces the 300 character response limit", async () => {
  const llm = fake(); const { call } = await start(llm);
  const strategies = [analysis.strategies[1]];
  expect((await call("/api/review/guidance", { guidance: "稳妥通关", strategies })).status).toBe(200);
  expect(llm.draftGuidance).toHaveBeenCalledWith("稳妥通关", strategies);
  expect((await call("/api/review/guidance", { guidance: "稳妥通关", strategies: [] })).status).toBe(400);
  llm.draftGuidance.mockResolvedValue({ ...meta, guidance: "🚇".repeat(301) });
  expect((await call("/api/review/guidance", { guidance: "稳妥通关", strategies })).status).toBe(502);
});
test("API retains sanitized paid-failure metadata for provider and final validation failures", async () => {
  const llm = fake(); const { call } = await start(llm);
  const attempt = { ...meta, operation: "review" as const, status: "error" as const, usage: { inputTokens: 90, outputTokens: 80, thinkingTokens: null, cacheReadTokens: 0 } };
  llm.review.mockRejectedValueOnce(new ReviewFailure("private detail", attempt));
  const r = await call("/api/review", { input: buildReviewInput(failedReport()) });
  expect(r.body.attempt).toEqual(attempt); expect(JSON.stringify(r.body)).not.toContain("private detail");
  llm.draftGuidance.mockResolvedValueOnce({ ...meta, guidance: "快".repeat(301) });
  const failed = await call("/api/review/guidance", { guidance: "", strategies: [analysis.strategies[0]] });
  expect(failed.body.attempt).toMatchObject({ operation: "draft", status: "error", model: "test" });
});
test("model errors are safe and retryable; invalid review evidence cannot render as fact", async () => {
  const llm = fake(); const { call } = await start(llm);
  llm.review.mockRejectedValueOnce(new Error("private upstream detail"));
  const input = buildReviewInput(failedReport());
  const error = await call("/api/review", { input });
  expect(error.status).toBe(502); expect(JSON.stringify(error.body)).not.toContain("private upstream detail");
  expect((await call("/api/review", { input })).status).toBe(200);
  llm.review.mockResolvedValue({ ...meta, analysis: { ...analysis, turningPoints: [{ ...analysis.turningPoints[0], t: 999 }] } });
  expect((await call("/api/review", { input })).status).toBe(502);
});


test("server review and draft are available when no user model was configured", async () => {
  const reviewer = fake();
  const { call, status } = await start(null, reviewer);
  expect(await status()).toEqual({ status: 200, body: { available: true } });
  const input = buildReviewInput(failedReport());
  expect((await call("/api/review", { input })).status).toBe(200);
  expect((await call("/api/review/guidance", { guidance: "稳妥通关", strategies: [analysis.strategies[0]] })).status).toBe(200);
  expect(reviewer.review).toHaveBeenCalledWith(input);
  expect(reviewer.draftGuidance).toHaveBeenCalledWith("稳妥通关", [analysis.strategies[0]]);
});

test("review uses the developer's reviewer instead of the game's default model", async () => {
  const gameplay = fake(); const reviewer = fake();
  const { call } = await start(gameplay, reviewer);
  expect((await call("/api/review", { input: buildReviewInput(failedReport()) })).status).toBe(200);
  expect(reviewer.review).toHaveBeenCalledTimes(1);
  expect(gameplay.review).not.toHaveBeenCalled();
});

test("a report without either a user model or a server fallback returns unavailable", async () => {
  const { call, status } = await start(fake(), null);
  expect(await status()).toEqual({ status: 200, body: { available: false } });
  const r = await call("/api/review", { input: buildReviewInput(failedReport()) });
  expect(r.status).toBe(503);
  expect(r.body.error).toContain("复盘服务暂不可用");
  expect((await call("/api/review/guidance", { guidance: "", strategies: [analysis.strategies[0]] })).status).toBe(503);
});


test("review and draft keep the user's start-of-run model after switching models and disposing the session", async () => {
  const requests: string[] = [];
  const modelConfigs = new ModelConfigStore(async (url, init) => {
    if (String(url).endsWith("/models")) return Response.json({ data: [{ id: "start-model" }, { id: "later-model" }] });
    const body = JSON.parse(String(init?.body));
    if (body.tool_choice === "required") return Response.json(response({ model: body.model, output: [toolCall('{"seconds":1,"reason":"验证"}', undefined, "wait")] }));
    requests.push(body.model);
    const result = body.text.format.name === "round_review" ? analysis : { guidance: "保持原目标，比较队列耗时。" };
    return Response.json(jsonResponse(result, { model: body.model }));
  });
  const config = await modelConfigs.verify("https://user-model.test", "test-user-key");
  await modelConfigs.enable(config.token, "start-model");
  const fallback = fake();
  const { call, status, sessions } = await start(null, fallback, modelConfigs);
  const offline = await call("/api/review/binding", {}, config.token);
  expect(offline.status).toBe(200);
  expect(typeof offline.body.reviewToken).toBe("string");
  const started = await call("/api/session", { guidance: "", normalized: null, runId: "bound-review-run" }, config.token);
  expect(started.status).toBe(200);
  expect(typeof started.body.reviewToken).toBe("string");
  await modelConfigs.enable(config.token, "later-model");
  sessions.delete(started.body.sessionId);
  modelConfigs.delete(config.token);
  // SessionStore disposal does not discard the short-lived review capability.
  // The run's LLM instance is pinned independently of the editable page config.
  const capability = started.body.reviewToken;
  expect(await status(undefined, capability)).toEqual({ status: 200, body: { available: true } });
  const result = await call("/api/review", { input: buildReviewInput(failedReport()) }, undefined, capability);
  expect(result.status).toBe(200);
  expect(result.body.model).toBe("start-model");
  const drafted = await call("/api/review/guidance", { guidance: "", strategies: [analysis.strategies[0]] }, undefined, capability);
  expect(drafted.status).toBe(200);
  expect(drafted.body.model).toBe("start-model");
  expect(await status(undefined, offline.body.reviewToken)).toEqual({ status: 200, body: { available: true } });
  expect(requests).toEqual(["start-model", "start-model"]);
  expect(fallback.review).not.toHaveBeenCalled();
  expect(fallback.draftGuidance).not.toHaveBeenCalled();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30 * 60_000 + 1);
  expect((await status(undefined, capability)).status).toBe(410);
  expect(fallback.review).not.toHaveBeenCalled();
});
