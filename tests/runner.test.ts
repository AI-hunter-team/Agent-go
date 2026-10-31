import { describe, expect, test } from "vitest";
import type { Agent, Classifier } from "../src/agent/agent";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { Engine } from "../src/sim/engine";
import { classifyByKeywords } from "../src/sim/intent";
import type { AgentAction, AgentTurn, DecisionResult } from "../src/shared/types";

const keywords: Classifier = async (intent) => classifyByKeywords(intent);

const ok = (action: AgentAction | null): DecisionResult => ({
  action,
  thinking: null,
  usage: null,
  model: "test",
  latencyMs: 0,
  error: action ? null : "no tool call",
});

class ScriptedAgent implements Agent {
  readonly kind = "llm" as const;
  turns: AgentTurn[] = [];
  disposed = false;
  constructor(private script: (turn: AgentTurn, n: number) => DecisionResult | Promise<DecisionResult>) {}
  async decide(turn: AgentTurn) {
    this.turns.push(turn);
    return this.script(turn, this.turns.length);
  }
  async dispose() {
    this.disposed = true;
  }
}

describe("GameRunner", () => {
  test.each<AgentAction>([
    { type: "move_to", target: "TVM-3", reason: "直接前往南侧售票机观察" },
    { type: "join_queue", facility: "TVM-1", reason: "从入口直接前往队尾" },
    { type: "wait", seconds: 2, reason: "先在入口等待" },
  ])("executes the model's opening choice without an automatic hall waypoint: $type", async (action) => {
    let release!: (result: DecisionResult) => void;
    const agent = new ScriptedAgent(() => new Promise((resolve) => { release = resolve; }));
    const engine = new Engine(1);
    const entrance = { ...engine.player.pos };
    const runner = new GameRunner(engine, agent, keywords);

    runner.start();
    expect(agent.turns).toHaveLength(1);
    expect(agent.turns[0]).toMatchObject({
      triggers: [{ kind: "start" }], lastResult: null,
      observation: { t: 0, self: { position: entrance, activity: "空闲，等待指令" }, facilities: [] },
    });
    runner.advance(100);
    expect(engine.t).toBe(0);
    expect(engine.player.pos).toEqual(entrance);
    expect(engine.player.activity.kind).toBe("idle");

    release(ok(action));
    await runner.pending;
    expect(runner.decisions).toHaveLength(1);
    expect(runner.decisions[0]).toMatchObject({ t: 0, action, result: { ok: true }, fallback: false });
    expect(engine.player.pos).toEqual(entrance);
    expect(engine.t).toBe(0);
    if (action.type === "join_queue") expect(engine.player.activity).toMatchObject({ kind: "to_queue", facility: action.facility });
    else if (action.type === "move_to") expect(engine.player.activity).toMatchObject({ kind: "walking", label: "3号售票机附近" });
    else expect(engine.player.activity).toMatchObject({ kind: "waiting", remaining: 2 });
    runner.stop();
  });

  test("offline agent finishes a run and produces a report", async () => {
    // Use the verified success seed after correcting crowd detours around fixtures.
    const runner = new GameRunner(new Engine(27), new HeuristicAgent(), keywords, { guidance: "" });
    await runner.runToEnd();
    const report = runner.report();
    expect(report.status).toBe("success");
    expect(report.score).toBeGreaterThan(0);
    expect(report.decisions.length).toBe(report.totals.decisions);
    expect(report.trail.length).toBeGreaterThan(10);
    expect(report.agentKind).toBe("offline");
  });

  test("the world is frozen while the agent is thinking", async () => {
    let release!: (r: DecisionResult) => void;
    const agent = new ScriptedAgent(() => new Promise((r) => (release = r)));
    const engine = new Engine(1);
    const runner = new GameRunner(engine, agent, keywords);
    runner.start();
    expect(runner.phase).toBe("thinking");
    const npcPositions = JSON.stringify([...engine.world.persons.values()].map((p) => p.pos));
    runner.advance(100);
    expect(engine.t).toBe(0);
    expect(JSON.stringify([...engine.world.persons.values()].map((p) => p.pos))).toBe(npcPositions);
    release(ok({ type: "move_to", target: "HALL_C", reason: "看看售票机" }));
    await runner.pending;
    expect(runner.phase).toBe("running");
    runner.advance(10);
    expect(engine.t).toBeCloseTo(1, 5);
  });

  test("a failed decision is retried once, then falls back to waiting", async () => {
    const agent = new ScriptedAgent(() => ok(null));
    const runner = new GameRunner(new Engine(1), agent, keywords);
    runner.start();
    await runner.pending;
    expect(agent.turns).toHaveLength(2);
    expect(agent.turns[1].retry).toBe(true);
    const d = runner.decisions[0];
    expect(d.fallback).toBe(true);
    expect(d.action).toMatchObject({ type: "wait", seconds: 2 });
  });

  test("three failed decisions in a row end the run", async () => {
    const runner = new GameRunner(new Engine(1), new ScriptedAgent(() => ok(null)), keywords);
    await runner.runToEnd();
    expect(runner.engine.status).toBe("failed");
    expect(runner.engine.failReason).toMatch(/模型不可用/);
    expect(runner.decisions).toHaveLength(3);
  });

  test("an agent that throws counts as a failed decision", async () => {
    const agent = new ScriptedAgent(() => {
      throw new Error("network down");
    });
    const runner = new GameRunner(new Engine(1), agent, keywords);
    runner.start();
    await runner.pending;
    expect(runner.decisions[0].error).toContain("network down");
    expect(runner.decisions[0].fallback).toBe(true);
  });

  test("decision budget stops model calls but the world keeps running", async () => {
    const agent = new ScriptedAgent(() => ok({ type: "wait", seconds: 1, reason: "" }));
    const runner = new GameRunner(new Engine(1), agent, keywords, { maxDecisions: 5 });
    await runner.runToEnd();
    expect(agent.turns).toHaveLength(5);
    expect(runner.budgetExhausted).toBe(true);
    expect(runner.engine.failReason).toMatch(/超时/);
    expect(agent.disposed).toBe(true);
  });

  test("creative intents are classified before the engine settles them", async () => {
    const agent = new ScriptedAgent((_, n) =>
      n === 1 ? ok({ type: "attempt_creative", intent: "直接飞到站台", reason: "试试" }) : ok({ type: "wait", seconds: 20, reason: "" }),
    );
    const runner = new GameRunner(new Engine(1), agent, keywords, { maxDecisions: 2 });
    runner.start();
    await runner.pending;
    const d = runner.decisions[0];
    expect(d.classification?.mechanic).toBe("unsupported");
    expect(d.result?.ok).toBe(false);
    expect(agent.turns.length).toBe(1);
  });

  test("a rejected action asks again immediately and passes the reason along", async () => {
    const agent = new ScriptedAgent((_, n) =>
      ok(n === 1 ? { type: "move_to", target: "MOON", reason: "" } : { type: "move_to", target: "HALL_C", reason: "" }),
    );
    const runner = new GameRunner(new Engine(1), agent, keywords, { maxDecisions: 3 });
    runner.start();
    await runner.pending;
    runner.advance(1);
    expect(runner.phase).toBe("thinking");
    await runner.pending;
    expect(agent.turns[1].lastResult?.ok).toBe(false);
    expect(agent.turns[1].triggers.map((t) => t.kind)).toEqual(["action_failed"]);
    expect(runner.engine.t).toBe(0);
  });

  test("an agent that keeps getting rejected does not freeze the world", async () => {
    const agent = new ScriptedAgent(() => ok({ type: "leave_queue", reason: "" }));
    const runner = new GameRunner(new Engine(1), agent, keywords, { maxDecisions: 6 });
    await runner.runToEnd();
    expect(runner.engine.t).toBeGreaterThan(5);
    expect(runner.decisions.filter((d) => d.result?.text.includes("连续被拒")).length).toBeGreaterThan(0);
  });
});

test("stop ends a pending run immediately and ignores its late response", async () => {
  let release!: (r: DecisionResult) => void;
  const agent = new ScriptedAgent(() => new Promise((resolve) => { release = resolve; }));
  const runner = new GameRunner(new Engine(1), agent, keywords);
  runner.start();
  expect(runner.attempts).toHaveLength(1);
  expect(runner.attempts[0].status).toBe("pending");
  runner.stop();
  expect(runner.phase).toBe("ended");
  expect(agent.disposed).toBe(true);
  release(ok({ type: "move_to", target: "HALL_C", reason: "late" }));
  await runner.pending;
  expect(runner.decisions).toHaveLength(0);
  expect(runner.engine.player.activity.kind).toBe("idle");
  const report = runner.report();
  expect(report.attempts?.[0].response?.action).toMatchObject({ target: "HALL_C" });
  expect(report.attempts?.[0].execution).toBeNull();
  expect(report.attempts?.[0].finishedAt).toBeTruthy();
});

test("keeps the failed attempt and successful retry with their individual inputs and outputs", async () => {
  const agent = new ScriptedAgent((_, n) => ({
    ...ok(n === 1 ? null : { type: "wait", seconds: 2, reason: "下一步" }),
    thinking: n === 1 ? "首次返回的思考" : "重试返回的思考",
    usage: { inputTokens: 100, outputTokens: 50, thinkingTokens: 20, cacheReadTokens: 0 },
  }));
  const runner = new GameRunner(new Engine(1), agent, keywords);
  runner.start();
  await runner.pending;
  const attempts = runner.decisions[0].attempts!;
  expect(attempts).toHaveLength(2);
  expect(attempts.map((a) => a.response?.thinking)).toEqual(["首次返回的思考", "重试返回的思考"]);
  expect(attempts[0].input.retry).toBeUndefined();
  expect(attempts[1].input.retry).toBe(true);
  expect(attempts[0].execution).toBeNull();
  expect(attempts[1].execution?.ok).toBe(true);
  expect(runner.report().totals.outputTokens).toBe(100);
  expect(JSON.parse(JSON.stringify(runner.report())).attempts).toHaveLength(2);
});

test("retry usage includes both paid attempts", async () => {
  const agent = new ScriptedAgent((_, n) => ({
    ...ok(n === 1 ? null : { type: "wait", seconds: 2, reason: "" }),
    usage: { inputTokens: 100, outputTokens: 50, thinkingTokens: 20, cacheReadTokens: 10 },
    latencyMs: 10,
  }));
  const runner = new GameRunner(new Engine(1), agent, keywords);
  runner.start();
  await runner.pending;
  expect(runner.report().totals.outputTokens).toBe(100);
  expect(runner.decisions[0].latencyMs).toBe(20);
});

test("classifier failure falls back without rejecting the runner promise", async () => {
  const agent = new ScriptedAgent(() => ok({ type: "attempt_creative", intent: "飞过去", reason: "" }));
  const runner = new GameRunner(new Engine(1), agent, async () => { throw new Error("offline"); });
  runner.start();
  await runner.pending;
  expect(runner.phase).toBe("running");
  expect(runner.decisions[0].classification?.source).toBe("keywords");
});

test("debug accounts for first attempts, retries and classification exactly once", async () => {
  let clock = 0;
  const agent = new ScriptedAgent((_, n) => {
    clock += n === 1 ? 20 : 30;
    return ok(n === 1 ? null : { type: "attempt_creative", intent: "飞过去", reason: "测试" });
  });
  const runner = new GameRunner(new Engine(1), agent, async () => { clock += 50; throw new Error("classifier offline"); }, {
    now: () => clock, preparation: { durationMs: 100, server: null },
  });
  runner.start(); await runner.pending; runner.stop();
  const debug = runner.report().debug!;
  expect(debug.summary.aiWaitMs).toBe(100);
  expect(debug.summary.includingPreparationMs).toBe(200);
  expect(debug.summary.byOperationMs).toEqual({ decision: 20, retry: 30, classification: 50, negotiation: 0 });
  expect(debug.summary.byStageMs).toEqual({ ticket: 100, security: 0, gate: 0, stairs: 0 });
  expect(debug.summary.slowestAttempt).toEqual({ index: 3, durationMs: 50 });
  expect(debug.attempts[0].error).toBe("no tool call");
  expect(debug.attempts[2].error).toContain("classifier offline");
  expect(runner.report().thinkingRealSeconds).toBe(0.1);
  expect(debug.summary.internalReasoningMs).toBeNull();
});

test("ending an in-flight call freezes debug timing and ignores late telemetry", async () => {
  let clock = 0;
  let release!: (r: DecisionResult) => void;
  const runner = new GameRunner(new Engine(1), new ScriptedAgent(() => new Promise((resolve) => { release = resolve; })), keywords, { now: () => clock });
  runner.start(); clock = 40; runner.stop();
  const stopped = JSON.stringify(runner.report().debug);
  expect(runner.report().debug!.attempts[0]).toMatchObject({ status: "cancelled", durationMs: 40 });
  clock = 900; release(ok({ type: "wait", seconds: 1, reason: "late" })); await runner.pending;
  expect(JSON.stringify(runner.report().debug)).toBe(stopped);
});
