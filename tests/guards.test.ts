import { describe, expect, test } from "vitest";
import { GuardSystem } from "../src/sim/guards";
import { DT, GUARDS } from "../src/sim/scenario";
import { angleDiff, angleTo, dist, segmentIntersectsRect } from "../src/sim/geometry";
import { MOVE_BLOCKERS } from "../src/sim/layout";

const stationary = () => new GuardSystem([{
  id: "fixed", label: "固定测试保安", route: [{ x: 30, y: 15 }], facing: 0, speed: 0, pauseSeconds: 0,
}]);

const stepSeconds = (g: GuardSystem, s: number) => {
  for (let i = 0; i < s * 10; i++) g.step();
};

describe("guards", () => {
  test("stationary guard sees ahead but not behind", () => {
    const gs = stationary();
    const a = gs.guards[0];
    expect(gs.canSee(a, { x: 35, y: 15 })).toBe(true);
    expect(gs.canSee(a, { x: 28, y: 15 })).toBe(false);
  });

  test("pillars block a guard's view", () => {
    const gs = stationary();
    const a = gs.guards[0];
    expect(gs.canSee(a, { x: 39, y: 12 })).toBe(false);
  });

  test("guards see through security railings, subject to the same view cone", () => {
    const gs = stationary();
    const a = gs.guards[0];
    a.facing = Math.PI; // turn west
    expect(gs.canSee(a, { x: 24, y: 10 })).toBe(true);
    expect(gs.canSee(a, { x: 24, y: 15 })).toBe(true); // through the S2 opening
  });

  test("patrol guard walks the route and turns around", () => {
    const gs = new GuardSystem([{
      id: "patrol", label: "巡逻测试保安", route: [{ x: 41, y: 4 }, { x: 41, y: 26 }],
      facing: Math.PI / 2, speed: 1, pauseSeconds: 2,
    }]);
    const b = gs.guards[0];
    const startY = b.pos.y;
    stepSeconds(gs, 5);
    expect(b.pos.y).toBeGreaterThan(startY);
    expect(b.facing).toBeCloseTo(Math.PI / 2);
    stepSeconds(gs, 30); // reach the far end (22 m), pause, head back (the larger guard collider stops at the fixture clearance)
    expect(b.pos.y).toBeLessThanOrEqual(25.6 + 1e-6);
    expect(b.facing).toBeCloseTo(Math.PI / 2);
  });

  test("a complaint turns nearby guards toward it", () => {
    const gs = stationary();
    const a = gs.guards[0];
    const reacted = gs.attract({ x: 25, y: 15 });
    expect(reacted).toContain(a);
    gs.step();
    expect(gs.canSee(a, { x: 25, y: 15 })).toBe(true);
    stepSeconds(gs, 4);
    expect(a.lookAt).toBeNull();
    expect(a.facing).toBe(0);
  });

  test("both default guards patrol straight along the gate line, facing their walking direction", () => {
    const gs = new GuardSystem();
    const starts = gs.guards.map((g) => ({ ...g.pos }));
    stepSeconds(gs, 1);
    expect(gs.guards[0].pos.y).toBeGreaterThan(starts[0].y);
    expect(gs.guards[1].pos.y).toBeLessThan(starts[1].y);
    expect(gs.guards[0].facing).toBeCloseTo(Math.PI / 2);
    expect(gs.guards[1].facing).toBeCloseTo(-Math.PI / 2);

    for (let tick = 0; tick < 60 / DT; tick++) {
      const previous = gs.guards.map((g) => ({ ...g.pos }));
      gs.step();
      gs.guards.forEach((g, i) => {
        expect(g.pos.x).toBe(41);
        expect(g.pos.y).toBeGreaterThanOrEqual(i === 0 ? 3 : 17);
        expect(g.pos.y).toBeLessThanOrEqual(i === 0 ? 13 : 27);
        expect(MOVE_BLOCKERS.some((wall) => segmentIntersectsRect(previous[i], g.pos, wall))).toBe(false);
        if (dist(previous[i], g.pos) > 0) {
          expect(angleDiff(g.facing, angleTo(previous[i], g.pos))).toBeCloseTo(0);
        }
      });
    }
  });

  test("a guard holds its arrival heading for the endpoint pause, then turns only when walking back", () => {
    const gs = new GuardSystem([{
      ...GUARDS[0], route: [{ x: 41, y: 3 }, { x: 41, y: 4 }],
      facing: Math.PI / 2, speed: 1, pauseSeconds: 2,
    }]);
    const a = gs.guards[0];
    stepSeconds(gs, 1);
    expect(a.pos).toEqual({ x: 41, y: 4 });
    for (let tick = 0; tick < 2 / DT; tick++) {
      gs.step();
      expect(a.pos).toEqual({ x: 41, y: 4 });
      expect(a.facing).toBeCloseTo(Math.PI / 2);
    }
    gs.step();
    expect(a.pos.y).toBeCloseTo(3.9);
    expect(a.facing).toBeCloseTo(-Math.PI / 2);
  });

  test("a complaint overrides walking, then the guard resumes its route heading", () => {
    const gs = new GuardSystem();
    stepSeconds(gs, 1);
    const a = gs.guards[0];
    const stoppedAt = { ...a.pos };
    expect(gs.attract({ x: a.pos.x - 5, y: a.pos.y })).toContain(a);
    gs.step();
    expect(a.facing).toBeCloseTo(Math.PI);
    expect(a.pos).toEqual(stoppedAt);
    stepSeconds(gs, 3);
    expect(a.lookAt).toBeNull();
    expect(a.pos.y).toBeGreaterThan(stoppedAt.y);
    expect(a.facing).toBeCloseTo(Math.PI / 2);
  });

  test("a complaint at an endpoint restores the arrival heading during the remaining pause", () => {
    const gs = new GuardSystem([{
      id: "paused", label: "停顿测试保安", route: [{ x: 41, y: 3 }, { x: 41, y: 4 }],
      facing: Math.PI / 2, speed: 1, pauseSeconds: 2,
    }]);
    stepSeconds(gs, 1);
    const a = gs.guards[0];
    gs.attract({ x: 36, y: 4 });
    gs.step();
    expect(a.facing).toBeCloseTo(Math.PI);
    stepSeconds(gs, 3);
    expect(a.lookAt).toBeNull();
    expect(a.pos).toEqual({ x: 41, y: 4 });
    expect(a.facing).toBeCloseTo(Math.PI / 2);
    stepSeconds(gs, 2);
    expect(a.pos.y).toBeLessThan(4);
    expect(a.facing).toBeCloseTo(-Math.PI / 2);
  });

  test("straight patrols remain deterministic", () => {
    const a = new GuardSystem();
    const b = new GuardSystem();
    stepSeconds(a, 60);
    stepSeconds(b, 60);
    expect(a.guards.map((g) => [g.pos, g.facing])).toEqual(b.guards.map((g) => [g.pos, g.facing]));
  });
});
