import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { PLAYER_TRAIN_DOORS, STAIRS_BOTTOM, TRAIN_CENTRE_X, TRAIN_AISLE_X, WIDTH } from "../src/sim/layout";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { createFixtureEngine } from "./fixtures/scenarios";

function platform() {
  const e = createFixtureEngine();
  Object.assign(e.player, { passedGate: true, screened: true, onPlatform: true, pos: { ...STAIRS_BOTTOM } });
  e.takeTriggers();
  return e;
}
function steps(e: Engine, count: number) { for (let i = 0; i < count; i++) e.step(); }

describe("player boards the actual parked train", () => {
  test("platform arrival is unfinished and standing there can still time out", () => {
    const e = platform();
    steps(e, 10);
    expect(e.status).toBe("running");
    expect(e.score).toBeNull();
    e.world.t = e.settings.timeLimitSeconds - 0.1;
    e.step();
    expect(e.status).toBe("failed");
    expect(e.failReason).toContain("未登上地铁");
  });

  test.each(PLAYER_TRAIN_DOORS)("$id moves through its doorway, then scores inside the aisle", door => {
    const e = platform();
    e.player.pos = { x: door.pos.x - 0.2, y: door.pos.y };
    expect(e.applyAction({ type: "move_to", target: door.id, reason: "登车" }).ok).toBe(true);
    steps(e, 3);
    expect(e.player.activity.kind).toBe("boarding");
    expect(e.player.onTrain).toBe(false);
    expect(e.status).toBe("running");
    expect(e.applyAction({ type: "move_to", target: "PLATFORM", reason: "中断" }).ok).toBe(false);
    expect(e.applyAction({ type: "wait", seconds: 20, reason: "等登车" }).ok).toBe(true);
    const before = { ...e.player.pos };
    steps(e, 5);
    expect(e.player.pos.x).toBeGreaterThan(before.x);
    expect(e.status).toBe("running");
    for (let i = 0; i < 80 && e.status === "running"; i++) e.step();
    expect(e.status).toBe("success");
    expect(e.player.onTrain).toBe(true);
    expect(e.player.pos.x).toBeGreaterThan(WIDTH);
    expect(e.player.pos).toEqual({ x: TRAIN_AISLE_X, y: door.pos.y + 1.25 });
    expect(e.score).toBe(e.t);
    expect(e.score).toBeGreaterThan(2.5);
    expect(e.timeBreakdown.walking).toBeCloseTo(e.t);
    const end = e.t; steps(e, 10); expect(e.t).toBe(end);
  });

  test("a mid-boarding timeout does not grant victory", () => {
    const e = platform(), door = PLAYER_TRAIN_DOORS[0];
    e.player.pos = { ...door.pos };
    e.applyAction({ type: "move_to", target: door.id, reason: "登车" });
    e.step();
    e.world.t = e.settings.timeLimitSeconds - 0.1;
    e.step();
    expect(e.player.onTrain).toBe(false);
    expect(e.status).toBe("failed");
    expect(e.score).toBeNull();
  });

  test("train doors cannot bypass gates or the descent, nor board from an arbitrary platform point", () => {
    const e = createFixtureEngine();
    expect(e.applyAction({ type: "move_to", target: "TRAIN_1", reason: "直达" }).ok).toBe(false);
    expect(e.observe().trainDoors).toEqual([]);
    const p = platform();
    p.player.pos = { x: WIDTH - 0.9, y: 5 };
    p.applyAction({ type: "move_to", target: "PLATFORM_C", reason: "查看" });
    steps(p, 10);
    expect(p.player.onTrain).toBe(false);
    expect(p.player.activity.kind).toBe("walking");
  });

  test("offline strategy looks for doors after descent and waits during boarding", async () => {
    const e = platform(), agent = new HeuristicAgent();
    const decide = () => agent.decide({ observation: e.observe(), triggers: [], lastResult: null });
    expect((await decide()).action).toMatchObject({ type: "move_to", target: "PLATFORM_N" });
    e.player.pos = { x: 84, y: 9 };
    expect((await decide()).action).toMatchObject({ type: "move_to", target: "TRAIN_1" });
    e.player.activity = { kind: "boarding", path: [{ x: TRAIN_CENTRE_X, y: 10.05 }] };
    expect((await decide()).action).toMatchObject({ type: "wait" });
  });
});
