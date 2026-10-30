import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { Engine } from "../src/sim/engine";
import { ReportSummary, EventTimeline } from "../src/ui/ReportView";

const props = { onRetry: () => undefined, onEdit: () => undefined };

test("a completed run renders a score, breakdown and export action", async () => {
  const runner = new GameRunner(new Engine(1), new HeuristicAgent(), offlineClassifier);
  await runner.runToEnd();
  const report = runner.report();
  const html = renderToStaticMarkup(createElement(ReportSummary, { ...props, report }));
  expect(html).toContain("已下楼到达站台");
  expect(html).toContain("下楼梯");
  expect(report.timeBreakdown.stairs).toBeCloseTo(6);
  expect(html).toContain(report.score!.toFixed(1));
  expect(html).toContain("导出报告 JSON");
  expect(JSON.parse(JSON.stringify(report)).totals.decisions).toBe(report.decisions.length);
});

test("a canceled run renders failure without awarding a score", () => {
  const runner = new GameRunner(new Engine(1), new HeuristicAgent(), offlineClassifier);
  runner.stop("玩家结束了本局");
  const report = runner.report();
  const html = renderToStaticMarkup(createElement(ReportSummary, { ...props, report }));
  expect(html).toContain("无成绩");
  expect(html).toContain("玩家结束了本局");
  expect(report.score).toBeNull();
});

test("the event list initially hides facts the character never observed", () => {
  const runner = new GameRunner(new Engine(1), new HeuristicAgent(), offlineClassifier);
  const report = runner.report();
  report.events.push({ t: 0, kind: "test", text: "HIDDEN-EVENT", playerVisible: false });
  const html = renderToStaticMarkup(createElement(EventTimeline, { report }));
  expect(html).not.toContain("HIDDEN-EVENT");
  expect(html).toContain("开局");
});
