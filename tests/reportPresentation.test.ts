import { expect, test } from "vitest";
import { failedReport } from "./reviewFixture";
import { decisionAttempts, describeReviewAction, filterDecisions, journeyEndOutcome, reportOutcome } from "../src/ui/reportPresentation";
import type { DecisionAttempt, DecisionRecord } from "../src/shared/types";
import { Engine } from "../src/sim/engine";

const decision = (index: number): DecisionRecord => ({ index, t: index, triggers: [], observationSummary: "可见队列", action: { type: "wait", seconds: 1, reason: "等候" }, result: { ok: true, text: "已等待" }, classification: null, thinking: null, usage: null, model: null, latencyMs: 0, error: null, fallback: false });

test("failure landing distinguishes the world deadline, technical interruption and manual stop without changing facts", () => {
  const report = failedReport();
  const before = JSON.stringify(report);
  expect(journeyEndOutcome(report)).toMatchObject({ tone: "stopped", title: "本局已结束" });
  expect(JSON.stringify(report)).toBe(before);
  report.goal = "board_train";
  report.failReason = "超时：120 秒内未登上地铁";
  expect(journeyEndOutcome(report)).toMatchObject({ tone: "failed", label: "挑战失败", title: "没赶上这趟车", marker: "clock", detail: report.failReason });
  for (const reason of ["模型请求超时", "超时：模型请求失败", "被安保确认违规行为，判负"]) {
    report.failReason = reason;
    expect(journeyEndOutcome(report)).toMatchObject({ tone: "failed", title: "这次没能登车", marker: "cross", detail: reason });
  }
  expect(report.score).toBeNull();
  report.failReason = null;
  expect(journeyEndOutcome(report).detail).toBe("未完成旅程");
  delete report.goal;
  report.failReason = "超过截止时间";
  expect(journeyEndOutcome(report).title).toBe("这次没能到站");
});

test("manual termination is distinct from failure without awarding a score", () => {
  const report = failedReport();
  expect(reportOutcome(report).tone).toBe("stopped");
  expect(report.score).toBeNull();
  report.failReason = "超过截止时间";
  expect(reportOutcome(report)).toMatchObject({ tone: "failed", detail: "超过截止时间" });
  report.status = "success";
  expect(reportOutcome(report).tone).toBe("success");
  delete report.goal;
  expect(reportOutcome(report).detail).toContain("旧版终点");
  report.goal = "board_train";
  expect(reportOutcome(report)).toMatchObject({ title: "成功登车", detail: "已登上地铁，进入车厢" });
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
