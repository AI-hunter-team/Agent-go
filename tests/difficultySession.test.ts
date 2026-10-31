import { expect, test } from "vitest";
import { SessionStore } from "../server/sessions";
import { buildSystemPrompt } from "../server/prompts";
import { GameSession } from "../src/ui/gameSession";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { GameRunner } from "../src/agent/runner";
import { Engine } from "../src/sim/engine";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSummary } from "../src/ui/ReportView";

const settings = { timeLimitSeconds: 90, extraQueuePeople: 3 };
test("model session freezes its deadline and both prompts use that deadline", () => {
  const input = { ...settings };
  const session = new SessionStore().create("", null, "difficulty-run", input);
  input.timeLimitSeconds = 180;
  expect(session.settings).toEqual(settings);
  const prompt = buildSystemPrompt("", null, session.settings).rules;
  expect(prompt).toContain("90 秒（世界时间）");
  expect(prompt).not.toContain("180 秒（世界时间）");
});

test("preview, starting and same-settings retry all retain difficulty", async () => {
  const session = new GameSession(1);
  session.preview(4, settings);
  expect(session.engine.settings).toEqual(settings);
  session.start(new HeuristicAgent(), offlineClassifier);
  expect(session.engine.seed).toBe(4); expect(session.engine.settings).toEqual(settings);
  await session.runner!.runToEnd();
  expect(session.runner!.report().settings).toEqual(settings);
  session.start(new HeuristicAgent(), offlineClassifier);
  expect(session.engine.settings).toEqual(settings); session.stop();
});

test("export and debug record the actual difficulty, with the same values visible in the report", () => {
  const r = new GameRunner(new Engine(1, settings), new HeuristicAgent(), offlineClassifier);
  r.stop(); const report = r.report();
  expect(JSON.parse(JSON.stringify(report)).settings).toEqual(settings);
  expect(report.debug?.parameters.timeLimitSeconds).toBe(90);
  expect(JSON.parse(JSON.stringify(report.debug)).parameters.extraQueuePeople).toBe(3);
  expect(report.debug?.parameters.simulationRules.timeLimit).toBe(90);
  const html = renderToStaticMarkup(createElement(ReportSummary, { report }));
  expect(html).toContain("时限 90 秒"); expect(html).toContain("每条开放队列 +3 人");
});
