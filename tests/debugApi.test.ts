import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { createApp } from "../server/app";
import { DebugLogger, debugFetch } from "../server/debug";
import { ResponsesClient, ResponsesLlmService } from "../server/responses";
import { SessionStore } from "../server/sessions";
import { GameRunner } from "../src/agent/runner";
import { Engine } from "../src/sim/engine";
import type { CreativeClassification, DecisionResult, GameReport } from "../src/shared/types";
import { jsonResponse, response, toolCall } from "./responsesSupport";

test("HTTP flow correlates preparation, decision, classification and persisted final report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-debug-api-"));
  const secret = "local-test-credential";
  const logger = new DebugLogger(true, dir, [secret]);
  const fetcher = debugFetch((async (_url, init) => {
    const request = JSON.parse(init!.body as string);
    const value = request.tools ? response({ output: [toolCall(JSON.stringify({ intent: "飞过去", reason: "测试" }), undefined, "attempt_creative")] })
      : jsonResponse(request.text.format.name === "guidance"
        ? { summary: "测试", risk: "未说明", priorities: [], rules: [], creativeIdeas: [], notExecutable: [], initialPlan: [] }
        : { mechanic: "unsupported", reason: "不支持飞行" });
    return Response.json({ ...value, model: "model-test" }, { headers: { "x-request-id": "upstream-id" } });
  }) as typeof fetch);
  const llm = new ResponsesLlmService(new ResponsesClient("https://example.test/v1", secret, fetcher), { model: "model-test", maxTokens: 4096, reasoningEffort: "none" as const, openaiStream: true });
  const sessions = new SessionStore();
  const server = createApp({ llm, sessions, debugLogger: logger, modelParameters: { reasoningEffort: "none", maxTokens: 4096 } }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  /** 调用独立的本地测试 API。 */
  async function api(path: string, body?: unknown, method = "POST") {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  try {
    const runId = crypto.randomUUID();
    const normalized = await api("/api/guidance/normalize", { text: "测试", runId });
    const sessionId = (await api("/api/session", { guidance: "测试", normalized: normalized.body.guidance, runId })).body.sessionId;
    let disposal: Promise<void> | undefined;
    const runner = new GameRunner(new Engine(1), {
      kind: "llm",
      decide: async (turn) => (await api("/api/agent/decide", { sessionId, turn })).body as DecisionResult,
      dispose: (report?: GameReport) => disposal = (async () => {
        expect((await api(`/api/session/${sessionId}/report`, { report })).status).toBe(204);
        await api(`/api/session/${sessionId}`, undefined, "DELETE");
      })(),
    }, async (intent, observation) => (await api("/api/creative/classify", { sessionId, intent, observation })).body as CreativeClassification,
    { runId, preparation: { durationMs: 1, server: normalized.body.debug } });
    runner.start(); await runner.pending;
    expect(runner.report().debug!.attempts.map((a) => a.server?.calls[0].providerRequestId)).toEqual(["upstream-id", "upstream-id"]);
    const mismatch = await api(`/api/session/${sessionId}/report`, { report: { status: "success", debug: { runId: "wrong" } } });
    expect(mismatch.status).toBe(400);
    runner.stop(); await disposal;
    expect(sessions.size).toBe(0);
    const logs = (await Promise.all((await readdir(dir)).map((file) => readFile(join(dir, file), "utf8")))).join("");
    expect(logs).not.toContain(secret);
    const records = logs.trim().split("\n").map((line) => JSON.parse(line));
    const operations = records.filter((r) => r.event === "model_operation");
    expect(operations.map((r) => r.debug.operation)).toEqual(["normalize", "decide", "classify"]);
    expect(operations.every((r) => r.debug.runId === runId)).toBe(true);
    const final = records.find((r) => r.event === "run_report");
    expect(final.report.debug.attempts).toHaveLength(2);
    expect(final.report.debug.attempts[1].classification).toMatchObject({ mechanic: "unsupported", source: "llm" });
    expect(final.report.debug.summary.aiWaitMs).toBeGreaterThan(0);
    expect(final.report.debug.summary.internalReasoningMs).toBeNull();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
