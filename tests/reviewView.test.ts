import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ReportSummary } from "../src/ui/ReportView";
import { FailureReview } from "../src/ui/FailureReview";
import { ReviewSession } from "../src/ui/reviewSession";
import { analysis, failedReport } from "./reviewFixture";
test("failed report checks the review service without offering user model binding", () => {
  const html = renderToStaticMarkup(createElement(ReportSummary, { report: failedReport(), onAdopt: () => {},
  }));
  expect(html).toContain("正在连接复盘服务"); expect(html).not.toContain("连接或更换复盘模型"); expect(html).toContain("导出报告 JSON");
  expect(html).not.toContain("调整指导再出发"); expect(html).not.toContain("原样再试一次");
});

test("strategy choices come before analysis and enable one setup action only while selected", async () => {
  const report = failedReport();
  const session = new ReviewSession(report, {
    reviewStatus: async () => ({ available: true }),
    review: async () => ({ analysis, model: "test", usage: null, latencyMs: 1 }),
    draftGuidance: async () => ({ guidance: "比较队列总耗时。", model: "test", usage: null, latencyMs: 1 }),
  });
  await session.ensureReview();
  const render = () => renderToStaticMarkup(createElement(FailureReview, { session, report, onAdopt: () => {} }));
  const action = (html: string) => html.match(/<button[^>]*>使用选中策略再来一局<\/button>/)?.[0];
  const initial = render();
  expect(action(initial)).toContain("disabled");
  expect(initial.indexOf(analysis.strategies[0].change)).toBeLessThan(initial.indexOf(analysis.summary));
  session.toggle("observe");
  expect(action(render())).not.toContain("disabled");
  session.toggle("observe");
  expect(action(render())).toContain("disabled");
});

test("the full report reuses its run's generated review and selected strategies", async () => {
  const report = failedReport();
  const session = new ReviewSession(report, {
    reviewStatus: async () => ({ available: true }),
    review: async () => ({ analysis, model: "test", usage: null, latencyMs: 1 }),
    draftGuidance: async () => ({ guidance: "比较队列总耗时。", model: "test", usage: null, latencyMs: 1 }),
  });
  await session.ensureReview();
  session.toggle("steady");
  const html = renderToStaticMarkup(createElement(ReportSummary, { report, reviewSession: session, onAdopt: () => {} }));
  expect(html).toContain(analysis.strategies[1].change);
  expect(html).toContain("已选 1 条策略");
  expect(html.indexOf("时间花在哪里")).toBeLessThan(html.indexOf("下一局怎么走"));
  expect(html.indexOf("下一局怎么走")).toBeLessThan(html.indexOf("完整行程记录"));
});

test("a historical report displays saved strategies without offering to adopt them", async () => {
  const report = failedReport();
  const session = new ReviewSession(report, {
    reviewStatus: async () => ({ available: true }),
    review: async () => ({ analysis, model: "test", usage: null, latencyMs: 1 }),
    draftGuidance: async () => ({ guidance: "不应采用旧报告策略", model: "test", usage: null, latencyMs: 1 }),
  });
  await session.ensureReview();
  const html = renderToStaticMarkup(createElement(ReportSummary, { report, reviewSession: session, readOnly: true }));
  expect(html).toContain(analysis.strategies[0].change);
  expect(html).toMatch(/<fieldset[^>]*disabled/);
  expect(html).not.toContain("使用选中策略再来一局");
  expect(html).not.toContain("生成行程分析");
});

test("review opens next-run guidance first and keeps replay and full records in alternate panes", () => {
  const html = renderToStaticMarkup(createElement(ReportSummary, { report: failedReport(), onAdopt: () => {} }));
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)];
  expect(tabs.map(tab => tab[1])).toEqual(["下一局怎么走", "轨迹回放", "完整行程记录"]);
  const panels = [...html.matchAll(/<[^>]+role="tabpanel"[^>]*>/g)].map(panel => panel[0]);
  expect(panels).toHaveLength(3);
  expect(panels[0]).not.toContain("hidden");
  expect(panels[1]).toContain("hidden");
  expect(panels[2]).toContain("hidden");
});
