import { describe, expect, test } from "vitest";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { Engine } from "../src/sim/engine";
import { classifyByKeywords } from "../src/sim/intent";
import { LEGACY_GAME_SETTINGS, type GameSettings } from "../src/shared/gameSettings";
import { STAIRS_TOP } from "../src/sim/layout";

async function play(seed: number, settings?: Readonly<GameSettings>) {
  const engine = new Engine(seed, settings);
  const agent = new HeuristicAgent();
  let decisions = 0;
  let lastResult = null;
  while (engine.status === "running") {
    if (engine.hasTriggers()) {
      const turn = { triggers: engine.takeTriggers(), lastResult, observation: engine.observe() };
      const { action } = await agent.decide(turn);
      lastResult = engine.applyAction(action!);
      decisions++;
    } else {
      engine.step();
    }
  }
  return { engine, decisions };
}

describe("offline heuristic agent", () => {
  test("original 180-second orderly fixture still completes on seed 1", async () => {
    const { engine, decisions } = await play(1, LEGACY_GAME_SETTINGS);
    expect(engine.status).toBe("success");
    expect(engine.score).toBeLessThan(180);
    expect(engine.creative.violations).toHaveLength(0);
    expect(decisions).toBeLessThanOrEqual(60);
  });

  test.each([2, 3, 4, 5, 6])("original orderly fixture also passes on seed %i", async (seed) => {
    const { engine } = await play(seed, LEGACY_GAME_SETTINGS);
    expect(engine.status).toBe("success");
  });

  test("the dense default can time out while a supported longer deadline allows orderly play", async () => {
    const difficult = await play(1);
    expect(difficult.engine.status).toBe("failed");
    expect(difficult.engine.t).toBe(120);
    expect(difficult.engine.failReason).toContain("超时");
    expect(difficult.engine.creative.violations).toHaveLength(0);
    // The integrated map includes physical crowd avoidance; this checks the supported 3-minute deadline.
    const possible = await play(1, { timeLimitSeconds: 180, extraQueuePeople: 3 });
    expect(possible.engine.status).toBe("success");
    expect(possible.engine.t).toBeLessThan(180);
    expect(possible.engine.creative.violations).toHaveLength(0);
  });

  test("after a gate the next destination is the stairs, even without a ticket", async () => {
    const engine = new Engine(1);
    const observation = engine.observe();
    Object.assign(observation.self, { passedGate: true, position: { x: 45.4, y: 25 } });
    const { action } = await new HeuristicAgent().decide({ triggers: [], lastResult: null, observation });
    expect(action).toMatchObject({ type: "move_to", target: "LANDING_C" });
    observation.self.position = { ...STAIRS_TOP };
    const atEntrance = await new HeuristicAgent().decide({ triggers: [], lastResult: null, observation });
    expect(atEntrance.action).toMatchObject({ type: "descend_stairs" });
    observation.self.activity = "正在下楼梯（剩余 3 秒）";
    observation.self.position = { x: 52.5, y: 15 };
    const descending = await new HeuristicAgent().decide({ triggers: [], lastResult: null, observation });
    expect(descending.action).toMatchObject({ type: "wait" });
  });
});

describe("keyword intent classifier", () => {
  test.each([
    ["趁保安不注意翻越闸机", "jump_gate"],
    ["直接跳过闸机进站", "jump_gate"],
    ["插队到最前面", "cut_in_line"],
    ["挤到前面去", "cut_in_line"],
    ["飞过去", "unsupported"],
  ])("%s → %s", (intent, mechanic) => {
    expect(classifyByKeywords(intent).mechanic).toBe(mechanic);
  });
});
