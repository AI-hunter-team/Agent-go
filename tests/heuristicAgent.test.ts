import { describe, expect, test } from "vitest";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { Engine } from "../src/sim/engine";
import { classifyByKeywords } from "../src/sim/intent";

async function play(seed: number) {
  const engine = new Engine(seed);
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
  test("default orderly play passes the gate in time on the default seed", async () => {
    const { engine, decisions } = await play(1);
    expect(engine.status).toBe("success");
    expect(engine.score).toBeLessThan(180);
    expect(engine.creative.violations).toHaveLength(0);
    expect(decisions).toBeLessThanOrEqual(60);
  });

  test.each([2, 3, 4, 5, 6])("also passes on seed %i", async (seed) => {
    const { engine } = await play(seed);
    expect(engine.status).toBe("success");
  });

  test("after a gate the next destination is the stairs, even without a ticket", async () => {
    const engine = new Engine(1);
    const observation = engine.observe();
    Object.assign(observation.self, { passedGate: true, position: { x: 45.4, y: 25 } });
    const { action } = await new HeuristicAgent().decide({ triggers: [], lastResult: null, observation });
    expect(action).toMatchObject({ type: "move_to", target: "STAIRS_TOP" });
    observation.self.position = { x: 48, y: 15 };
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
