import { describe, expect, test } from "vitest";
import { GameRunner } from "../src/agent/runner";
import { classifyByKeywords } from "../src/sim/intent";
import type { AgentAction, AgentTurn, TriggerKind } from "../src/shared/types";
import { createFixtureEngine } from "./fixtures/scenarios";
import { ScriptedAgent } from "./helpers/scriptedAgent";

const action: AgentAction = { type: "move_to", target: "HALL_C", reason: "剧本移动" };
const turn = (t: number, ...kinds: TriggerKind[]): AgentTurn => ({
  observation: { ...createFixtureEngine().observe(), t },
  triggers: kinds.map((kind) => ({ kind, text: kind })), lastResult: null,
});

describe("ScriptedAgent", () => {
  test("waits until the world-time threshold, then consumes a step once", async () => {
    const agent = new ScriptedAgent([{ at: 2, action }]);
    expect((await agent.decide(turn(0))).action).toMatchObject({ type: "wait", seconds: 2 });
    expect(agent.consumed).toBe(0);
    expect((await agent.decide(turn(2.1))).action).toEqual(action);
    expect(agent.consumed).toBe(1);
    expect((await agent.decide(turn(3))).action).toMatchObject({ type: "wait" });
  });

  test("matches merged triggers and preserves script order", async () => {
    const agent = new ScriptedAgent([{ at: "service_done", action }, { at: "arrived", action: { type: "wait", seconds: 3, reason: "到达" } }]);
    expect((await agent.decide(turn(1, "arrived"))).action).toMatchObject({ type: "wait", seconds: 20 });
    expect(agent.consumed).toBe(0);
    expect((await agent.decide(turn(2, "broadcast", "service_done"))).action).toEqual(action);
    expect((await agent.decide(turn(3, "arrived"))).action).toMatchObject({ type: "wait", seconds: 3 });
    expect(agent.consumed).toBe(2);
  });

  test("runs time and trigger steps through the real runner without advancing time during decisions", async () => {
    const engine = createFixtureEngine();
    const agent = new ScriptedAgent([{ at: 1, action }, { at: "arrived", action: { type: "wait", seconds: 2, reason: "到达后等待" } }]);
    const runner = new GameRunner(engine, agent, async (intent) => classifyByKeywords(intent));
    runner.start();
    expect(engine.t).toBe(0);
    await runner.pending;
    for (let tick = 0; tick < 800 && agent.consumed < 2; tick++) {
      if (runner.pending) await runner.pending;
      else runner.advance(1);
    }
    if (runner.pending) await runner.pending;
    expect(agent.consumed).toBe(2);
    expect(runner.decisions.find((record) => record.action?.type === "move_to")).toMatchObject({ t: 1, result: { ok: true } });
    expect(runner.decisions.at(-1)).toMatchObject({ action: { reason: "到达后等待" }, triggers: expect.arrayContaining([expect.objectContaining({ kind: "arrived" })]) });
    expect(runner.budgetExhausted).toBe(false);
    runner.stop();
  });

  test("owns its script and resets run memory on dispose", async () => {
    const script = [{ at: 0, action: { ...action } }];
    const agent = new ScriptedAgent(script);
    script[0].action.reason = "外部改动";
    const result = await agent.decide(turn(0));
    expect(result.action).toEqual(action);
    await agent.dispose();
    expect(agent.turns).toHaveLength(0);
    expect(agent.consumed).toBe(0);
    expect((await agent.decide(turn(0))).action).toEqual(action);
  });

  test.each([-1, NaN, Infinity])("rejects invalid scripted time %s", (at) => {
    expect(() => new ScriptedAgent([{ at, action }])).toThrow("finite and non-negative");
  });
});
