import { describe, expect, test } from "vitest";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { Engine } from "../src/sim/engine";
import { classifyByKeywords } from "../src/sim/intent";
import { buildReviewInput } from "../src/shared/review";
import { describeAction } from "../src/ui/format";
import { AGENT_TOOLS, parseToolUse } from "../server/tools";

describe("map tools and agent choices", () => {
  test("new tools are available without social permissions and enforce their exact parameters", () => {
    const names = AGENT_TOOLS.map(t => t.name);
    expect(names).toContain("take_escalator");
    expect(names).toContain("inspect_attraction");
    expect(parseToolUse("take_escalator", { reason: "快些" })).toEqual({ action: { type: "take_escalator", reason: "快些" } });
    expect(parseToolUse("take_escalator", { queueLength: 0 })).toHaveProperty("error");
    expect(parseToolUse("inspect_attraction", { attraction: "TOYS", mode: "glance", reason: "看看" })).toHaveProperty("action");
    for (const input of [{ attraction: "MISSING", mode: "glance" }, { attraction: "TOYS", mode: "buy" }, { attraction: "TOYS", mode: "linger", seconds: 0 }])
      expect(parseToolUse("inspect_attraction", input)).toHaveProperty("error");
  });
  test("chooses the faster visible route, while crowded escalator can lose to stairs", async () => {
    const engine = new Engine(1);
    Object.assign(engine.player, { passedGate: true, screened: true, pos: { x: 54, y: 15 } });
    const observation = engine.observe();
    for (const r of observation.routes!) { r.distance = 7; r.queueLength = 0; }
    const agent = new HeuristicAgent();
    const turn = { triggers: [], lastResult: null, observation };
    expect((await agent.decide(turn)).action).toMatchObject({ type: "move_to", target: "ESCALATOR_TOP" });
    observation.routes!.find(r => r.id === "escalator")!.queueLength = 8;
    expect((await agent.decide(turn)).action).toMatchObject({ type: "move_to", target: "STAIRS_TOP" });
  });
  test("a visible attraction does not force the offline agent to stop", async () => {
    const engine = new Engine(1);
    Object.assign(engine.player, { hasTicket: true, screened: true, pos: { x: 31, y: 6 } });
    const action = (await new HeuristicAgent().decide({ triggers: [], lastResult: null, observation: engine.observe() })).action;
    expect(action?.type).not.toBe("inspect_attraction");
  });
  test("report and review input retain attention activity time, actual events and separate escalator time", () => {
    const e = new Engine(2);
    Object.assign(e.player, { screened: true, hasTicket: true, pos: { x: 31, y: 6 } });
    const runner = new GameRunner(e, new HeuristicAgent(), async intent => classifyByKeywords(intent));
    expect(e.applyAction({ type: "inspect_attraction", attraction: "TOYS", mode: "glance", reason: "好奇" }).ok).toBe(true);
    for (let i = 0; i < 12; i++) e.step();
    e.abort("测试结束");
    const report = runner.report();
    const input = buildReviewInput(report);
    expect(input.timeBreakdown.distraction).toBe(1.2);
    expect(input.timeBreakdown.escalator).toBe(0);
    expect(input.events.some(ev => ev.kind === "attention_end" && ev.text.includes("1.2 秒"))).toBe(true);
    expect(Object.values(input.timeBreakdown).reduce((a, b) => a + b, 0)).toBeCloseTo(1.2);
    expect(describeAction({ type: "take_escalator", reason: "" })).toContain("扶梯");
    expect(describeAction({ type: "inspect_attraction", attraction: "TOYS", mode: "glance", reason: "" })).toContain("TOYS");
  });
});
