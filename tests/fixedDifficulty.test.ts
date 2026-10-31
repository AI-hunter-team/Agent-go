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

// 开局展示所选截止时间，整理期间锁定选择，客流仍不可编辑。
test("setup offers deadlines, reflects the selected limit and locks it while preparing", () => {
  const html = renderToStaticMarkup(createElement(SetupPanel, {
    llmAvailable: false, model: null, agentKind: "offline", onAgentKind: () => {},
    seed: 1, onSeed: () => {}, settings: { ...DEFAULT_GAME_SETTINGS, timeLimitSeconds: 300 }, onTimeLimit: () => {},
    guidance: "", onGuidance: () => {}, busy: "正在整理指导…",
    onPrepare: () => {}, onConfigureModel: () => {},
  }));
  expect(html).toContain("限时 300 秒");
  expect(html).toContain('<select id="game-deadline" disabled="">');
  expect(html).toContain('<option value="300" selected="">5 分钟</option>');
  expect(html).toContain("额外 3 人");
  expect(html).not.toContain("难度预设");
  expect(html).toContain("截止时间");
  expect(html).not.toContain("每条队列额外人数");
});
