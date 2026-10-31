import { describe, expect, test } from "vitest";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { Engine } from "../src/sim/engine";
import { buildReviewInput, validateReview, validateDraft } from "../src/shared/review";

import { analysis, failedReport } from "./reviewFixture";

describe("post-game evidence", () => {
  test("keeps invisible events and global history without leaking raw prompts or reasoning", () => {
    const report = failedReport();
    const input = buildReviewInput(report);
    expect(input.events.some(e => e.text === "远处设施发生变化" && !e.playerVisible)).toBe(true);
    expect(input.worldSnapshots.length).toBeGreaterThan(0);
    expect(input.worldSnapshots[0].facilities.length).toBeGreaterThan(0);
    const raw = JSON.stringify(input);
    for (const key of ["parameters", "thinking", "chatMessages", "pendingRecheck", "serviceTime"]) expect(raw).not.toContain(`"${key}"`);
  });
  test("global snapshots stay out of live reports and agent observations, and are immutable", async () => {
    const engine = new Engine(1);
    const runner = new GameRunner(engine, new HeuristicAgent(), async () => ({ mechanic: "unsupported", reason: "", source: "keywords" }));
    runner.start(); await runner.pending;
    expect(runner.report().worldSnapshots).toBeUndefined();
    expect(JSON.stringify(runner.attempts[0].input)).not.toContain("worldSnapshots");
    runner.stop();
    const before = JSON.stringify(runner.report().worldSnapshots);
    engine.world.facilities.values().next().value!.status = "broken";
    expect(JSON.stringify(runner.report().worldSnapshots)).toBe(before);
  });
  test("legacy reports remain readable and disclose missing snapshots", () => {
    const report = failedReport(); delete report.worldSnapshots;
    expect(buildReviewInput(report).worldSnapshots).toEqual([]);
  });
  test("validates times, real references, strategy counts and unique ids", () => {
    const input = buildReviewInput(failedReport());
    expect(() => validateReview(analysis, input)).not.toThrow();
    for (const value of [
      { ...analysis, strategies: [analysis.strategies[0]] },
      { ...analysis, strategies: [analysis.strategies[0], analysis.strategies[0]] },
      { ...analysis, turningPoints: [{ ...analysis.turningPoints[0], t: 9999 }] },
      { ...analysis, turningPoints: [{ ...analysis.turningPoints[0], decisionIndexes: [999] }] },
      { ...analysis, turningPoints: [{ ...analysis.turningPoints[0], eventIndexes: [999] }] },
      null,
    ]) expect(() => validateReview(value, input)).toThrow();
  });
  test("draft validates Unicode characters and rejects empty or overlong guidance", () => {
    expect(validateDraft({ guidance: "🚇".repeat(300) })).toEqual({ guidance: "🚇".repeat(300) });
    expect(() => validateDraft({ guidance: "快".repeat(301) })).toThrow();
    expect(() => validateDraft({ guidance: " " })).toThrow();
  });
  test("review requires a real recorded time, one recommendation, and stated uncertainty", () => {
    const input = { ...buildReviewInput(failedReport()), elapsed: 10 };
    for (const value of [
      { ...analysis, turningPoints: [{ ...analysis.turningPoints[0], t: 5 }] },
      { ...analysis, uncertainties: [] },
      { ...analysis, strategies: analysis.strategies.map(s => ({ ...s, recommended: true })) },
      { ...analysis, strategies: analysis.strategies.map(s => ({ ...s, recommended: false })) },
    ]) expect(() => validateReview(value, input)).toThrow();
  });
});
