import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { Engine } from "../src/sim/engine";
import { ReportSummary, EventTimeline } from "../src/ui/ReportView";

test("a completed run renders a score, breakdown and export action", async () => {
  const runner = new GameRunner(new Engine(1, { timeLimitSeconds: 180, extraQueuePeople: 0 }), new HeuristicAgent(), offlineClassifier);
  await runner.runToEnd();
  const report = runner.report();
  const html = renderToStaticMarkup(createElement(ReportSummary, { report }));
  expect(html).toContain("已登上地铁，进入车厢");
  expect(html).toContain((report.timeBreakdown.escalator ?? 0) > 0 ? "乘扶梯" : "下楼梯");
  expect([4, 6]).toContain((report.timeBreakdown.stairs ?? 0) + (report.timeBreakdown.escalator ?? 0));
  expect(html).toContain(report.score!.toFixed(1));
  expect(html).toContain("导出报告 JSON");
  expect(html).toContain("Debug 日志与 AI 耗时");
  expect(html).toContain("导出 Debug JSON");
  expect(html).toContain("任务阶段");
  expect(html).toContain("不能单独测出纯思考时间");
  expect(JSON.parse(JSON.stringify(report)).totals.decisions).toBe(report.decisions.length);
});

test("legacy reports without settings retain their original 180-second zero-extra labels", () => {
  const runner = new GameRunner(new Engine(1), new HeuristicAgent(), offlineClassifier);
  runner.stop();
  const report = runner.report();
  delete report.settings;
  const html = renderToStaticMarkup(createElement(ReportSummary, { report }));
  expect(html).toContain("时限 180 秒");
  expect(html).toContain("每条开放队列 +0 人");
});

test("a canceled run renders failure without awarding a score", () => {
  const runner = new GameRunner(new Engine(1), new HeuristicAgent(), offlineClassifier);
  runner.stop("玩家结束了本局");
  const report = runner.report();
  const html = renderToStaticMarkup(createElement(ReportSummary, { report }));
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
