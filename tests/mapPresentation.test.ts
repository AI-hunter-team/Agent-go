import { expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Engine } from "../src/sim/engine";
import { captureScene } from "../src/ui/presentation";
import { JourneyProgress } from "../src/ui/JourneyProgress";
import { ReportSummary } from "../src/ui/ReportView";
import { cameraFraction } from "../src/ui/scene/cameraCollision";
import { failedReport } from "./reviewFixture";

test("standing passengers remain visually idle while carried by the escalator", () => {
  const e = new Engine(1);
  e.player.pos = { x: 65, y: 22 };
  e.player.activity = { kind: "escalator", remaining: 3 };
  const previous = captureScene(e);
  e.player.pos.x += .3;
  expect(captureScene(e, previous).actors.get("player")?.motion).toBe("idle");
});
test("journey and reports name escalator travel and voluntary attention", () => {
  const e = new Engine(1);
  e.player.passedGate = true;
  e.player.activity = { kind: "escalator", remaining: 2 };
  expect(renderToStaticMarkup(createElement(JourneyProgress, { player: e.player, status: "running" }))).toContain("正在乘扶梯");
  const report = failedReport();
  report.timeBreakdown.escalator = 4;
  report.timeBreakdown.distraction = 3;
  const html = renderToStaticMarkup(createElement(ReportSummary, { report, onRetry: () => {}, onEdit: () => {} }));
  expect(html).toContain("乘扶梯");
  expect(html).toContain("关注设施");
});
test("camera collision includes the commercial cabinet footprint", () => {
  expect(cameraFraction({ x: 30.5, y: 1.5, z: 5 }, { x: 30.5, y: 1.5, z: 2 })).toBeLessThan(1);
});
