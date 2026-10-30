import { describe, expect, test } from "vitest";
import { GuardSystem } from "../src/sim/guards";

const stepSeconds = (g: GuardSystem, s: number) => {
  for (let i = 0; i < s * 10; i++) g.step();
};

describe("guards", () => {
  test("stationary guard sees ahead but not behind", () => {
    const gs = new GuardSystem();
    const a = gs.guards[0];
    expect(gs.canSee(a, { x: 35, y: 15 })).toBe(true);
    expect(gs.canSee(a, { x: 28, y: 15 })).toBe(false);
  });

  test("pillars block a guard's view", () => {
    const gs = new GuardSystem();
    const a = gs.guards[0];
    expect(gs.canSee(a, { x: 39, y: 12 })).toBe(false);
  });

  test("guards cannot see through the security wall", () => {
    const gs = new GuardSystem();
    const a = gs.guards[0];
    a.facing = Math.PI; // turn west
    expect(gs.canSee(a, { x: 24, y: 10 })).toBe(false);
    expect(gs.canSee(a, { x: 24, y: 15 })).toBe(true); // through the S2 opening
  });

  test("patrol guard walks the route and turns around", () => {
    const gs = new GuardSystem();
    const b = gs.guards[1];
    const startY = b.pos.y;
    stepSeconds(gs, 5);
    expect(b.pos.y).toBeGreaterThan(startY);
    expect(b.facing).toBeCloseTo(Math.PI / 2);
    stepSeconds(gs, 30); // reach the far end (22 m), pause, head back
    expect(b.facing).toBeCloseTo(-Math.PI / 2);
  });

  test("a complaint turns nearby guards toward it", () => {
    const gs = new GuardSystem();
    const a = gs.guards[0];
    const reacted = gs.attract({ x: 25, y: 15 });
    expect(reacted).toContain(a);
    gs.step();
    expect(gs.canSee(a, { x: 25, y: 15 })).toBe(true);
    stepSeconds(gs, 4);
    expect(a.lookAt).toBeNull();
    expect(a.facing).toBe(0);
  });
});
