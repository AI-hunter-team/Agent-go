import { describe, expect, test } from "vitest";
import { CreativeSystem } from "../src/sim/creative";
import { GuardSystem } from "../src/sim/guards";
import { queueSlot } from "../src/sim/layout";
import { World } from "../src/sim/world";

function setup() {
  const world = new World(1);
  const guards = new GuardSystem();
  const creative = new CreativeSystem(world, guards);
  // Freeze the patrol guard so tests control where it looks.
  guards.guards[1].pauseLeft = 1e9;
  const step = (seconds: number) => {
    for (let i = 0; i < seconds * 10; i++) {
      world.t += 0.1;
      world.stepPeopleAndFacilities();
      guards.step();
      creative.step(world.player!);
      if (creative.caught) return;
    }
  };
  return { world, guards, creative, step };
}

function fillQueue(world: World, id: string, n: number, irritable = false) {
  const f = world.facility(id)!;
  f.serving = { personId: "nobody", remaining: 1e9, recheck: false };
  for (let i = 0; i < n; i++) {
    const p = world.addPerson("normal", queueSlot(f.def, i), { hasTicket: true, irritable });
    f.queue.push(p.id);
    p.activity = { kind: "queued", facility: id };
  }
}

describe("jump_gate", () => {
  test("succeeds when no guard is looking", () => {
    const { world, guards, creative, step } = setup();
    guards.guards[1].pos = { x: 41, y: 4 };
    guards.guards[1].facing = -Math.PI / 2;
    const p = world.addPerson("player", { x: 43, y: 25 }, { isPlayer: true });
    p.screened = true;
    expect(creative.start(p, "jump_gate", "").ok).toBe(true);
    step(3);
    expect(creative.caught).toBeNull();
    expect(p.onPlatform).toBe(true);
    expect(creative.violations).toEqual([{ t: 0, mechanic: "jump_gate", detected: false }]);
  });

  test("is caught when a guard sees it", () => {
    const { world, guards, creative, step } = setup();
    guards.guards[1].pos = { x: 41, y: 20 };
    guards.guards[1].facing = Math.PI / 2;
    const p = world.addPerson("player", { x: 43, y: 23 }, { isPlayer: true });
    creative.start(p, "jump_gate", "");
    step(3);
    expect(creative.caught?.mechanic).toBe("jump_gate");
    expect(p.onPlatform).toBe(false);
    expect(creative.violations[0].detected).toBe(true);
  });

  test("needs to be next to the gate line", () => {
    const { world, creative } = setup();
    const p = world.addPerson("player", { x: 10, y: 15 }, { isPlayer: true });
    expect(creative.start(p, "jump_gate", "").ok).toBe(false);
    expect(creative.violations).toHaveLength(0);
  });
});

describe("cut_in_line", () => {
  test("moves the player to second place in a nearby queue", () => {
    const { world, creative, step } = setup();
    fillQueue(world, "S3", 4);
    const p = world.addPerson("player", { x: 21, y: 25 }, { isPlayer: true });
    expect(creative.start(p, "cut_in_line", "").ok).toBe(true);
    step(2);
    expect(world.facility("S3")!.queue.indexOf("player")).toBe(1);
    expect(creative.caught).toBeNull(); // hidden from guards by the security wall
  });

  test("a complaining passenger draws a guard who then sees the cut-in", () => {
    const { world, creative, step } = setup();
    fillQueue(world, "S2", 3, true);
    const p = world.addPerson("player", { x: 23, y: 16 }, { isPlayer: true });
    creative.start(p, "cut_in_line", "");
    step(5);
    expect(world.playerTriggers.some((t) => t.kind === "complaint")).toBe(true);
    expect(creative.caught?.mechanic).toBe("cut_in_line");
  });

  test("fails when no queue is close enough", () => {
    const { world, creative } = setup();
    fillQueue(world, "S3", 2);
    const p = world.addPerson("player", { x: 5, y: 5 }, { isPlayer: true });
    expect(creative.start(p, "cut_in_line", "").ok).toBe(false);
  });
});

test("unsupported mechanics explain the limitation", () => {
  const { world, creative } = setup();
  const p = world.addPerson("player", { x: 5, y: 5 }, { isPlayer: true });
  const r = creative.start(p, "unsupported", "不能飞行");
  expect(r.ok).toBe(false);
  expect(r.text).toContain("不能飞行");
});
