import { describe, expect, test } from "vitest";
import { lineOfSight, segmentIntersectsRect } from "../src/sim/geometry";
import { ENTRANCE, MOVE_BLOCKERS, PILLARS, SIGHT_OCCLUDERS, zoneOf } from "../src/sim/layout";
import { findPath, nearestNode, nodeById } from "../src/sim/nav";

describe("navigation", () => {
  test("open hall allows a straight walk", () => {
    expect(findPath(ENTRANCE, { x: 13, y: 6 })).toEqual([{ x: 13, y: 6 }]);
  });

  test("cannot walk through the security line", () => {
    expect(findPath(ENTRANCE, nodeById("CONC_C")!.pos)).toBeNull();
  });

  test("cannot walk from the concourse onto the platform", () => {
    expect(findPath(nodeById("CONC_C")!.pos, { x: 50, y: 15 })).toBeNull();
  });

  test("routes around pillars without touching them", () => {
    const from = { x: 33, y: 12 };
    const to = { x: 39, y: 12 };
    const path = findPath(from, to)!;
    expect(path).not.toBeNull();
    let cur = from;
    for (const p of path) {
      for (const r of MOVE_BLOCKERS) expect(segmentIntersectsRect(cur, p, r)).toBe(false);
      cur = p;
    }
  });

  test("nearest node stays in the same zone", () => {
    expect(nearestNode({ x: 27.4, y: 15 })!.id).toBe("CONC_C");
    expect(zoneOf({ x: 27.4, y: 15 })).toBe("concourse");
  });

  test("the upper landing and stairs are distinct from the lower platform", () => {
    expect(zoneOf({ x: 45.4, y: 15 })).toBe("landing");
    expect(zoneOf({ x: 52, y: 15 })).toBe("stairs");
    expect(zoneOf({ x: 57, y: 15 })).toBe("platform");
    expect(nearestNode({ x: 45.4, y: 25 })?.id).toBe("STAIRS_TOP");
    expect(findPath({ x: 45.4, y: 25 }, nodeById("STAIRS_TOP")!.pos)).not.toBeNull();
    expect(findPath(nodeById("STAIRS_TOP")!.pos, nodeById("PLATFORM")!.pos)).toBeNull();
  });
});

describe("sight", () => {
  test("security lane openings let sight through", () => {
    expect(lineOfSight({ x: 22, y: 15 }, { x: 30, y: 15 }, SIGHT_OCCLUDERS)).toBe(true);
  });

  test("security wall blocks sight elsewhere", () => {
    expect(lineOfSight({ x: 22, y: 10 }, { x: 30, y: 10 }, SIGHT_OCCLUDERS)).toBe(false);
  });

  test("pillars block sight", () => {
    const p = PILLARS[0];
    expect(lineOfSight({ x: p.x - 3, y: p.y + 1 }, { x: p.x + p.w + 3, y: p.y + 1 }, SIGHT_OCCLUDERS)).toBe(false);
  });
});
