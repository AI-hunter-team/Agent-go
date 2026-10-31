import { afterEach, expect, test, vi } from "vitest";
import { setImmediate as yieldEventLoop } from "node:timers/promises";
import type { Agent } from "../src/agent/agent";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { Engine } from "../src/sim/engine";
import type { DecisionResult } from "../src/shared/types";
import { GameSession } from "../src/ui/gameSession";
import { sampleActor } from "../src/ui/presentation";

afterEach(() => { vi.useRealTimers(); });

// Compare two complete runs per seed within a dedicated wall-clock budget.
test.each([1, 2, 3, 4, 5, 6])("presentation-driven seed %i has the same report as the runner", async (seed) => {
  // Debug identities and wall timestamps are independent of simulation output.
  // Fix them so the full report comparison still checks every diagnostic field.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T00:00:00Z"));
  const options = { now: () => 0, runId: `seed-${seed}` };
  const baseline = new GameRunner(new Engine(seed), new HeuristicAgent(), offlineClassifier, options);
  await baseline.runToEnd();
  // Keep Vitest's worker RPC responsive between the CPU-heavy simulations.
  await yieldEventLoop();
  const session = new GameSession(seed);
  session.start(new HeuristicAgent(), offlineClassifier, options);
  session.setSpeed(4);
  let loops = 0;
  while (session.runner!.phase !== "ended" && loops++ < 10000) {
    if (loops % 250 === 0) await yieldEventLoop();
    if (session.runner!.pending) await session.runner!.pending;
    else {
      session.tick(0.016);
      // Multiple mounted consumers / camera changes only read the same session.
      const pose = { x: 0, y: 0, z: 0, yaw: 0 };
      sampleActor(session.presentation, "player", session.alpha, pose);
      sampleActor(session.presentation, "player", session.alpha, pose);
    }
  }
  expect(session.runner!.phase).toBe("ended");
  expect(session.runner!.report()).toEqual(baseline.report());
  expect(session.alpha).toBe(1);
}, 30000);

test("3D session keeps preparation diagnostics and the session-bound creative classifier in its final report", async () => {
  let now = 0;
  let saved: ReturnType<GameRunner["report"]> | undefined;
  const classify = vi.fn(async () => {
    now += 20;
    return { mechanic: "unsupported" as const, reason: "fixture classification", source: "llm" as const };
  });
  const agent: Agent = {
    kind: "llm",
    async decide() {
      now += 10;
      return { action: { type: "attempt_creative", intent: "飞过去", reason: "fixture" }, thinking: null, usage: null, model: "fake", latencyMs: 10, error: null };
    },
    async dispose(report) { saved = report; },
  };
  const session = new GameSession();
  session.start(agent, classify, { runId: "integrated-run", now: () => now, preparation: { durationMs: 30, server: null } });
  await session.runner!.pending;
  expect(classify).toHaveBeenCalledOnce();
  session.stop();
  const report = session.runner!.report();
  expect(report.debug).toMatchObject({
    runId: "integrated-run", preparation: { durationMs: 30 },
    summary: { aiWaitMs: 30, includingPreparationMs: 60, byOperationMs: { decision: 10, classification: 20 } },
  });
  expect(report.debug!.attempts.map((attempt) => attempt.operation)).toEqual(["decision", "classification"]);
  expect(saved).toEqual(report);
});

test("thinking and manual pause freeze world and display; late decisions cannot resume a stopped game", async () => {
  let release!: (result: DecisionResult) => void;
  const agent: Agent = { kind: "llm", decide: () => new Promise((resolve) => { release = resolve; }), dispose: async () => undefined };
  const session = new GameSession();
  session.start(agent, offlineClassifier);
  const before = JSON.stringify([...session.engine.world.persons.values()]);
  session.tick(0.25);
  expect(session.engine.t).toBe(0);
  expect(session.visualTime).toBe(0);
  expect(JSON.stringify([...session.engine.world.persons.values()])).toBe(before);
  const pending = session.runner!.pending;
  session.stop();
  release({ action: { type: "move_to", target: "HALL_W", reason: "late" }, thinking: null, usage: null, model: "fake", latencyMs: 0, error: null });
  await pending;
  session.tick(0.25);
  expect(session.runner!.phase).toBe("ended");
  expect(session.engine.t).toBe(0);
  session.preview(1);
  session.start(new HeuristicAgent(), offlineClassifier);
  await session.runner!.pending;
  session.tick(0.15);
  session.setPaused(true);
  const paused = session.visualTime;
  const t = session.engine.t;
  session.tick(0.25);
  expect(session.engine.t).toBe(t);
  expect(session.visualTime).toBe(paused);
  session.setPaused(false);
  session.tick(0.1);
  expect(session.engine.t).toBeGreaterThan(t);
});
