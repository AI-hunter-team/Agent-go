import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ReportSummary } from "../src/ui/ReportView";
import { failedReport } from "./reviewFixture";
test("failed report offers model configuration while retaining report controls", () => {
  const html = renderToStaticMarkup(createElement(ReportSummary, { report: failedReport(), modelAvailable: false,
    onAdopt: () => {}, onEdit: () => {}, onRetry: () => {}, onConfigureModel: () => {},
  }));
  expect(html).toContain("连接或更换复盘模型"); expect(html).toContain("导出报告 JSON");
});
