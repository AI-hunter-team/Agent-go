import { expect, test } from "vitest";
import { failedReport } from "./reviewFixture";
import { decisionAttempts, describeReviewAction, filterDecisions, reportOutcome } from "../src/ui/reportPresentation";
import type { DecisionAttempt, DecisionRecord } from "../src/shared/types";
import { Engine } from "../src/sim/engine";

const decision = (index: number): DecisionRecord => ({ index, t: index, triggers: [], observationSummary: "可见队列", action: { type: "wait", seconds: 1, reason: "等候" }, result: { ok: true, text: "已等待" }, classification: null, thinking: null, usage: null, model: null, latencyMs: 0, error: null, fallback: false });

test("manual termination is distinct from failure without awarding a score", () => {
  const report = failedReport();
  expect(reportOutcome(report).tone).toBe("stopped");
  expect(report.score).toBeNull();
  report.failReason = "超过截止时间";
  expect(reportOutcome(report)).toMatchObject({ tone: "failed", detail: "超过截止时间" });
  report.status = "success";
  expect(reportOutcome(report).tone).toBe("success");
});

test("analysis filters distinguish action failure, model delay and dialogue without modifying records", () => {
  const report = failedReport();
  report.decisions = [decision(1), { ...decision(2), result: { ok: false, text: "目标不可达" } }, { ...decision(3), latencyMs: 5200 }, { ...decision(4), action: { type: "talk", npcId: "p1", message: "可以先让我过去吗", goal: "yield", reason: "协商" } }];
  const before = JSON.stringify(report);
  expect(filterDecisions(report, "failed").map(d => d.index)).toEqual([2]);
  expect(filterDecisions(report, "slow").map(d => d.index)).toEqual([3]);
  expect(filterDecisions(report, "dialogue").map(d => d.index)).toEqual([4]);
  expect(filterDecisions(report, "retry")).toEqual([]);
  expect(decisionAttempts(report, report.decisions[0])).toEqual([]);
  expect(JSON.stringify(report)).toBe(before);
});

test("review labels use place names while preserving unknown future locations", () => {
  expect(describeReviewAction({ type: "move_to", target: "TICKETS_C", reason: "" })).toBe("前往自动售票机前比较点");
  expect(describeReviewAction({ type: "move_to", target: "future-place", reason: "" })).toContain("future-place");
});

test("analysis preserves legacy embedded attempts and includes later report-level retries", () => {
  const report = failedReport();
  const first: DecisionAttempt = { decisionIndex: 1, attempt: 1, status: "error", startedAt: "2026-10-31T00:00:00Z", finishedAt: null, input: { triggers: [], lastResult: null, observation: new Engine(1).observe() }, response: null, execution: null };
  const retry: DecisionAttempt = { ...first, attempt: 2, status: "completed", input: { ...first.input, retry: true } };
  report.decisions = [{ ...decision(1), attempts: [first] }];
  report.attempts = [];
  expect(decisionAttempts(report, report.decisions[0])).toEqual([first]);
  report.attempts = [first, retry];
  expect(decisionAttempts(report, report.decisions[0])).toEqual([first, retry]);
  expect(filterDecisions(report, "retry")).toEqual(report.decisions);
  expect(filterDecisions(report, "failed")).toEqual(report.decisions);
});
