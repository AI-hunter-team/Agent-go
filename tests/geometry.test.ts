import { describe, expect, test } from "vitest";
import { Rng } from "../src/sim/rng";
import { compass, inViewCone, lineOfSight, moveToward, segmentIntersectsRect } from "../src/sim/geometry";

describe("Rng", () => {
  test("same seed gives the same sequence", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  test("range stays within bounds", () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(5);
    }
  });
});

describe("geometry", () => {
  const pillar = { x: 4, y: 4, w: 2, h: 2 };

  test("segment through a rect intersects", () => {
    expect(segmentIntersectsRect({ x: 0, y: 5 }, { x: 10, y: 5 }, pillar)).toBe(true);
  });

  test("segment beside a rect does not intersect", () => {
    expect(segmentIntersectsRect({ x: 0, y: 1 }, { x: 10, y: 1 }, pillar)).toBe(false);
  });

  test("segment ending before a rect does not intersect", () => {
    expect(segmentIntersectsRect({ x: 0, y: 5 }, { x: 3.9, y: 5 }, pillar)).toBe(false);
  });

  test.each([
    [{ x: 0, y: 0 }, { x: 4, y: 4 }, true],
    [{ x: 4, y: 2 }, { x: 4, y: 8 }, true],
    [{ x: 6, y: 6 }, { x: 9, y: 6 }, true],
    [{ x: 5, y: 5 }, { x: 5, y: 5 }, true],
    [{ x: 3, y: 5 }, { x: 3, y: 5 }, false],
    [{ x: 0, y: 4 }, { x: 4, y: 0 }, false],
  ] as const)("clipping retains boundary and stationary semantics in either direction: %j → %j", (a, b, expected) => {
    expect(segmentIntersectsRect(a, b, pillar)).toBe(expected);
    expect(segmentIntersectsRect(b, a, pillar)).toBe(expected);
  });

  test("line of sight is blocked by any occluder", () => {
    expect(lineOfSight({ x: 0, y: 5 }, { x: 10, y: 5 }, [pillar])).toBe(false);
    expect(lineOfSight({ x: 0, y: 0 }, { x: 10, y: 0 }, [pillar])).toBe(true);
  });

  test("view cone respects range and field of view", () => {
    const o = { x: 0, y: 0 };
    expect(inViewCone(o, 0, 110, 12, { x: 10, y: 0 })).toBe(true);
    expect(inViewCone(o, 0, 110, 12, { x: 13, y: 0 })).toBe(false);
    expect(inViewCone(o, 0, 110, 12, { x: -5, y: 0 })).toBe(false);
    expect(inViewCone(o, 0, 110, 12, { x: 5, y: 5 })).toBe(true);
    expect(inViewCone(o, 0, 110, 12, { x: 1, y: 5 })).toBe(false);
  });

  test("moveToward does not overshoot", () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 5)).toEqual({ x: 1, y: 0 });
    expect(moveToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toEqual({ x: 2, y: 0 });
  });

  test("compass labels screen directions", () => {
    expect(compass(0)).toBe("东");
    expect(compass(Math.PI / 2)).toBe("南");
    expect(compass(-Math.PI / 2)).toBe("北");
  });
});
