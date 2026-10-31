import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import * as layout from "../src/sim/layout";
import { findPath } from "../src/sim/nav";

describe("commercial hall before gates", () => {
  test("commercial approach points are reachable after security and require crossing no gate", () => {
    expect(layout.ATTRACTIONS.length).toBe(5);
    for (const item of layout.ATTRACTIONS) {
      expect(item.approach.x).toBeGreaterThan(26);
      expect(item.approach.x).toBeLessThan(44);
      expect(findPath({ x: 31, y: 15 }, item.approach)).not.toBeNull();
      expect(findPath({ x: 45.4, y: 15 }, item.approach)).toBeNull();
    }
  });
  test("solid stalls block walking while both descent entrances remain reachable from the landing", () => {
    expect(findPath({ x: 28, y: 2 }, { x: 31, y: 2 })).toBeNull();
    for (const entrance of [layout.STAIRS_TOP, layout.ESCALATOR_TOP]) {
      expect(findPath({ x: 54, y: 15 }, entrance)).not.toBeNull();
      expect(findPath(entrance, { x: 80, y: entrance.y })).toBeNull();
    }
  });
  test("attractions and route crowds are only exposed when visible", () => {
    const e = new Engine(1);
    expect(e.observe().attractions).toEqual([]);
    expect(e.observe().routes).toEqual([]);
    Object.assign(e.player, { screened: true, pos: { x: 31, y: 6 } });
    expect(e.observe().attractions?.map(a => a.id)).toContain("TOYS");
    Object.assign(e.player, { passedGate: true, pos: { x: 54, y: 15 } });
    expect(e.observe().routes?.map(r => r.id).sort()).toEqual(["escalator", "stairs"]);
  });
});
