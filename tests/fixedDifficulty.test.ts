import { expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_GAME_SETTINGS } from "../src/shared/gameSettings";
import { Engine } from "../src/sim/engine";
import { GameSession } from "../src/ui/gameSession";
import { SessionStore } from "../server/sessions";
import { buildSystemPrompt } from "../server/prompts";
import { SetupPanel } from "../src/ui/ControlPanel";

test("ordinary games, model sessions and retries default to 120 seconds and three extra people per open queue", () => {
  const fixed = { timeLimitSeconds: 120, extraQueuePeople: 3 };
  expect(DEFAULT_GAME_SETTINGS).toEqual(fixed);
  const game = new GameSession(1);
  expect(game.engine.settings).toEqual(fixed);
  expect(game.engine.observe().self.timeLeft).toBe(120);
  const original = new Engine(1, { timeLimitSeconds: 180, extraQueuePeople: 0 });
  for (const [id, lane] of original.world.facilities) {
    expect(game.engine.world.facility(id)!.queue).toHaveLength(lane.queue.length + (lane.status === "open" ? 3 : 0));
  }
  game.preview(2);
  expect(game.engine.settings).toEqual(fixed);
  const model = new SessionStore().create("", null);
  expect(model.settings).toEqual(fixed);
  expect(buildSystemPrompt("", null, model.settings).rules).toContain("120 秒（世界时间）");
});

test("setup describes fixed rules with no difficulty presets or editable difficulty fields", () => {
  const html = renderToStaticMarkup(createElement(SetupPanel, {
    llmAvailable: false, model: null, agentKind: "offline", onAgentKind: () => {},
    seed: 1, onSeed: () => {}, guidance: "", onGuidance: () => {}, busy: null,
    onPrepare: () => {}, onConfigureModel: () => {},
  }));
  expect(html).toContain("120 秒");
  expect(html).toContain("额外 3 人");
  expect(html).not.toContain("难度预设");
  expect(html).not.toContain("本局时限（秒）");
  expect(html).not.toContain("每条队列额外人数");
});
