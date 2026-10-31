import { describe, expect, test } from "vitest";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { Engine } from "../src/sim/engine";
import type { DecisionRecord } from "../src/shared/types";
import { getReplayFrame } from "../src/replay/trajectory";

const decision = (index: number, t: number): DecisionRecord => ({
  index, t, triggers: [], observationSummary: "", action: { type: "wait", seconds: 1, reason: "观察" },
  result: { ok: true, text: "等待" }, classification: null, thinking: null, usage: null,
  model: null, latencyMs: 0, error: null, fallback: false,
});

const recording = () => ({
  elapsed: 1.2,
  trail: [{ t: 0, x: 0, y: 0 }, { t: 0.5, x: 2, y: 0 }, { t: 1, x: 2, y: 0 }, { t: 1.2, x: 3, y: 0 }],
  decisions: [decision(1, 0.25), decision(2, 0.5), decision(3, 0.5), decision(4, 1)],
});

describe("trajectory recording", () => {
  test("captures the exact ending position when canceled between regular samples", () => {
    const engine = new Engine(1);
    engine.applyAction({ type: "move_to", target: "HALL_C", reason: "" });
    for (let i = 0; i < 3; i++) engine.step();
    engine.abort("结束");
    expect(engine.trail[0]).toMatchObject({ t: 0, x: 2, y: 15 });
    expect(engine.trail.at(-1)).toEqual({ t: 0.3, ...engine.player.pos });
    expect(engine.trail[0].x).toBe(2);
  });

  test("completed runs retain the final platform position and world time", async () => {
    // Use the verified success seed after correcting crowd detours around fixtures.
    const runner = new GameRunner(new Engine(27), new HeuristicAgent(), offlineClassifier);
    await runner.runToEnd();
    const report = runner.report();
    expect(report.status).toBe("success");
    expect(report.trail.at(-1)).toEqual({ t: report.elapsed, ...runner.engine.player.pos });
    expect(getReplayFrame(report, report.elapsed).position).toEqual(runner.engine.player.pos);
  });
});

describe("trajectory replay", () => {
  test("interpolates a moving position without showing future trail points", () => {
    const frame = getReplayFrame(recording(), 0.25);
    expect(frame.t).toBe(0.25);
    expect(frame.position).toEqual({ x: 1, y: 0 });
    expect(frame.trail).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  });

  test("preserves a stationary interval instead of walking at a constant overall speed", () => {
    expect(getReplayFrame(recording(), 0.75).position).toEqual({ x: 2, y: 0 });
  });

  test("selects the last decision at the cursor time, excluding future decisions", () => {
    expect(getReplayFrame(recording(), 0).decision).toBeNull();
    expect(getReplayFrame(recording(), 0.5).decision?.index).toBe(3);
    expect(getReplayFrame(recording(), 0.99).decision?.index).toBe(3);
    expect(getReplayFrame(recording(), 1).decision?.index).toBe(4);
  });

  test("clamps seeking to the beginning and exact end without mutating the recording", () => {
    const report = recording();
    const before = JSON.stringify(report);
    expect(getReplayFrame(report, -20).t).toBe(0);
    expect(getReplayFrame(report, Number.NaN).t).toBe(0);
    const end = getReplayFrame(report, 999);
    expect(end.t).toBe(1.2);
    expect(end.position).toEqual({ x: 3, y: 0 });
    expect(JSON.stringify(report)).toBe(before);
  });

  test("uses the original half-second interval for legacy reports without timestamps", () => {
    const report = { elapsed: 0.5, trail: [{ x: 0, y: 0 }, { x: 2, y: 0 }], decisions: [] };
    expect(getReplayFrame(report, 0.25).position).toEqual({ x: 1, y: 0 });
  });

  test("supports empty and zero-duration reports", () => {
    expect(getReplayFrame({ elapsed: 0, trail: [], decisions: [] }, 5)).toMatchObject({ t: 0, position: null, trail: [], decision: null });
    expect(getReplayFrame({ elapsed: 0, trail: [{ t: 0, x: 2, y: 15 }], decisions: [] }, 5).position).toEqual({ x: 2, y: 15 });
  });
});
