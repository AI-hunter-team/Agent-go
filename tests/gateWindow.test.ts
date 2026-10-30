import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { angleDiff, angleTo, dist, lineOfSight } from "../src/sim/geometry";
import { SIGHT_OCCLUDERS } from "../src/sim/layout";
import { DT, RULES } from "../src/sim/scenario";

function atGate(y = 15) {
  const engine = new Engine(1);
  // Start the player beside the gate; guards keep their real default routes and clock.
  engine.player.pos = { x: 43, y };
  engine.player.screened = true;
  return engine;
}

function bothHaveTheirBacksTurned(engine: Engine) {
  return engine.guards.guards.every((g) =>
    angleDiff(g.facing, angleTo(g.pos, engine.player.pos)) > Math.PI / 2,
  );
}

const jump = (engine: Engine) => engine.applyAction({
  type: "attempt_creative", intent: "翻越闸机", reason: "观察巡逻后翻越闸机",
}, "jump_gate");

describe("natural gate patrol windows", () => {
  test("a guard seeing the start still catches a jump just before the patrol turns away", () => {
    const engine = atGate();
    for (let tick = 0; tick < 132; tick++) engine.step();
    expect(engine.guards.seenBy(engine.player.pos)).toBeTruthy();
    expect(jump(engine).ok).toBe(true);
    for (let tick = 0; tick < 25; tick++) engine.step();
    expect(engine.status).toBe("failed");
    expect(engine.player.passedGate).toBe(false);
    expect(engine.creative.violations[0].detected).toBe(true);
  });
  test("both nearby guards naturally turn their backs long enough for the full 2.5-second jump", () => {
    const engine = atGate();
    while (!bothHaveTheirBacksTurned(engine) && engine.t < 30) engine.step();
    expect(bothHaveTheirBacksTurned(engine)).toBe(true);
    expect(engine.t).toBeGreaterThan(0);
    expect(engine.observe().guards).toHaveLength(2);
    const startedAt = engine.t;
    expect(jump(engine).ok).toBe(true);

    for (let tick = 0; tick < RULES.jumpGateSeconds / DT; tick++) {
      engine.step();
      expect(bothHaveTheirBacksTurned(engine)).toBe(true);
      for (const g of engine.guards.guards) {
        // Visibility fails because of facing, never range or a hidden wall/pillar.
        expect(dist(g.pos, engine.player.pos)).toBeLessThan(RULES.guardRange);
        expect(lineOfSight(g.pos, engine.player.pos, SIGHT_OCCLUDERS)).toBe(true);
        expect(engine.guards.canSee(g, engine.player.pos)).toBe(false);
      }
      if (tick < 24) {
        expect(engine.status).toBe("running");
        expect(engine.player.onPlatform).toBe(false);
      }
    }
    expect(engine.t - startedAt).toBeCloseTo(2.5);
    expect(engine.timeBreakdown.creative).toBeCloseTo(2.5);
    expect(engine.status).toBe("running");
    expect(engine.player.passedGate).toBe(true);
    expect(engine.player.onPlatform).toBe(false);
    expect(engine.creative.violations).toEqual([{ t: startedAt, mechanic: "jump_gate", detected: false }]);
  });

  test("jumping while the natural patrol faces the player is still caught", () => {
    const engine = atGate();
    for (let tick = 0; tick < 5 / DT; tick++) engine.step();
    expect(engine.guards.guards.every((g) => engine.guards.canSee(g, engine.player.pos))).toBe(true);
    expect(jump(engine).ok).toBe(true);
    engine.step();
    expect(engine.status).toBe("failed");
    expect(engine.failReason).toContain("翻越闸机");
    expect(engine.player.onPlatform).toBe(false);
    expect(engine.creative.violations[0].detected).toBe(true);
  });

  test("one guard's back does not protect the player from the other nearby guard", () => {
    const engine = atGate(11);
    for (let tick = 0; tick < 10 / DT; tick++) engine.step();
    const [a, b] = engine.guards.guards;
    for (const g of [a, b]) {
      expect(dist(g.pos, engine.player.pos)).toBeLessThan(RULES.guardRange);
      expect(lineOfSight(g.pos, engine.player.pos, SIGHT_OCCLUDERS)).toBe(true);
    }
    expect(angleDiff(a.facing, angleTo(a.pos, engine.player.pos))).toBeGreaterThan(Math.PI / 2);
    expect(engine.guards.canSee(a, engine.player.pos)).toBe(false);
    expect(engine.guards.canSee(b, engine.player.pos)).toBe(true);
    expect(jump(engine).ok).toBe(true);
    engine.step();
    expect(engine.status).toBe("failed");
    expect(engine.creative.caught?.guard).toBe(b.def.label);
  });
});
