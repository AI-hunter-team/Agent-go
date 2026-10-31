import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { createApp, type LlmService } from "../server/app";
import { SessionStore } from "../server/sessions";
import { ReviewFailure, buildReviewInput } from "../src/shared/review";
import { analysis, failedReport } from "./reviewFixture";

let server: Server;
afterEach(() => server?.close());
async function start(llm: LlmService | null) {
  const sessions = new SessionStore();
  server = createApp({ llm, sessions }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { sessions, call: async (path: string, body: unknown) => {
    const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
