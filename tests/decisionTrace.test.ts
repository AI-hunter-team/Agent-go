import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { DecisionAttempt, DecisionRecord, DecisionResult } from "../src/shared/types";
import { Engine } from "../src/sim/engine";
import { GameRunner } from "../src/agent/runner";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { DecisionLog } from "../src/ui/DecisionLog";
import { ReportSummary } from "../src/ui/ReportView";

const first: DecisionResult = { action: null, thinking: "首次思考，尚未选定动作。", model: "test-model", usage: null, latencyMs: 10, error: "未调用工具" };
const final: DecisionResult = {
  action: { type: "wait", seconds: 3, reason: "观察现场" }, thinking: "再次评估后等待。", model: "test-model", usage: null, latencyMs: 20, error: null,
  output: { id: "message-2", stopReason: "tool_use", content: [
    { type: "thinking", thinking: "再次评估后等待。", signature: "signature" },
    { type: "text", text: "模型返回的中间文本。" },
    { type: "tool_use", id: "tool-2", name: "wait", input: { seconds: 3, reason: "完整工具参数" } },
  ] },
};
const attempt = (index: number, response: DecisionResult): DecisionAttempt => ({
  decisionIndex: 1, attempt: index, status: response.error ? "error" : "completed", startedAt: "2026-10-30T12:00:00.000Z", finishedAt: "2026-10-30T12:00:01.000Z",
  input: { triggers: [], lastResult: null, observation: new Engine(1).observe(), ...(index === 2 ? { retry: true } : {}) },
  response, execution: index === 2 ? { ok: true, text: "原地等待 3 秒" } : null,
});
const record = (): DecisionRecord => ({
  index: 1, t: 0, triggers: [], observationSummary: "", action: final.action, result: { ok: true, text: "原地等待 3 秒" },
  thinking: final.thinking, model: final.model, usage: null, latencyMs: 30, error: null, fallback: false, classification: null,
  attempts: [attempt(1, first), attempt(2, final)],
});

test("decision details display failed reasoning, retry output, tool parameters and execution result", () => {
  const html = renderToStaticMarkup(createElement(DecisionLog, { decisions: [record()] }));
  for (const text of ["首次思考，尚未选定动作。", "再次评估后等待。", "模型返回的中间文本。", "完整工具参数", "未调用工具", "原地等待 3 秒", "第 1 次尝试", "第 2 次尝试"]) expect(html).toContain(text);
});

test("old decisions without attempt records still display their returned thinking", () => {
  const old = record();
  delete old.attempts;
  expect(renderToStaticMarkup(createElement(DecisionLog, { decisions: [old] }))).toContain("再次评估后等待。");
});

test("a canceled pending request remains visible in the report before any decision was executed", () => {
  const runner = new GameRunner(new Engine(1), {
    kind: "llm", decide: () => new Promise<DecisionResult>(() => {}), dispose: async () => {},
  }, offlineClassifier);
  runner.start();
  runner.stop();
  const html = renderToStaticMarkup(createElement(ReportSummary, { report: runner.report() }));
  expect(html).toContain("全部调用记录");
  expect(html).toContain("请求中");
  expect(html).toContain("第 1 次尝试");
});
