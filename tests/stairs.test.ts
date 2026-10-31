import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { findPath } from "../src/sim/nav";
import { World } from "../src/sim/world";
import { STAIRS_BOTTOM, STAIRS_TOP } from "../src/sim/layout";

function atStairs() {
  const engine = new Engine(1);
  engine.world.items.spawn("ticket", {type:"held",personId:"player",slot:"pocket"},"player");
  Object.assign(engine.player, { screened: true, passedGate: true, pos: { ...STAIRS_TOP } });
  engine.takeTriggers();
  return engine;
}

describe("stairs after the gate", () => {
  test("gate service stops on the upper landing without ending the run", () => {
    const e = new Engine(1);
    e.world.items.spawn("ticket", { type: "held", personId: e.player.id, slot: "pocket" }, e.player.id);
    Object.assign(e.player, { screened: true, pos: { x: 43.4, y: 15 } });
    const gate = e.world.facility("G3")!;
    e.world.setStatus("G3", "open", null);
    gate.serving = { personId: "player", remaining: 0.1, recheck: false };
    e.player.activity = { kind: "service", facility: "G3" };
    e.step();
    expect(e.player.passedGate).toBe(true);
    expect(e.player.onPlatform).toBe(false);
    expect(e.player.activity.kind).toBe("idle");
    expect(e.status).toBe("running");
    expect(e.score).toBeNull();
    expect(e.player.pos).toEqual({ x: 45.4, y: 15 });
  });

  test("stairs require both a passed gate and arrival at the stairs entrance", () => {
    const e = atStairs();
    e.player.passedGate = false;
    expect(e.applyAction({ type: "descend_stairs", reason: "" })).toMatchObject({ ok: false });
    e.player.passedGate = true;
    e.player.pos = { x: 45.4, y: 25 };
    expect(e.applyAction({ type: "descend_stairs", reason: "" })).toMatchObject({ ok: false });
    expect(e.applyAction({ type: "move_to", target: "STAIRS_TOP", reason: "" }).ok).toBe(true);
    for (let i = 0; i < 200 && e.player.activity.kind !== "idle"; i++) e.step();
    expect(e.player.pos).toEqual(STAIRS_TOP);
    expect(e.applyAction({ type: "descend_stairs", reason: "" })).toMatchObject({ ok: true });
  });

  test("descent moves gradually, lasts six seconds and accounts for its time", () => {
    const e = atStairs();
    expect(e.applyAction({ type: "descend_stairs", reason: "" })).toMatchObject({ ok: true });
    for (let i = 0; i < 30; i++) e.step();
    expect(e.player.pos.x).toBeGreaterThan(STAIRS_TOP.x);
    expect(e.player.pos.x).toBeLessThan(STAIRS_BOTTOM.x);
    expect(e.player.onPlatform).toBe(false);
    expect(e.status).toBe("running");
    for (let i = 0; i < 30; i++) e.step();
    expect(e.player.pos).toEqual(STAIRS_BOTTOM);
    expect(e.player.onPlatform).toBe(true);
    expect(e.status).toBe("success");
    expect(e.score).toBe(6);
    expect(e.timeBreakdown.stairs).toBeCloseTo(6);
  });

  test("descent cannot be interrupted by movement, another descent or a creative action", () => {
    const e = atStairs();
    expect(e.applyAction({ type: "descend_stairs", reason: "" })).toMatchObject({ ok: true });
    expect(e.applyAction({ type: "move_to", target: "STAIRS_TOP", reason: "" }).ok).toBe(false);
    expect(e.applyAction({ type: "descend_stairs", reason: "" })).toMatchObject({ ok: false });
    expect(e.applyAction({ type: "attempt_creative", intent: "翻闸", reason: "" }, "jump_gate").ok).toBe(false);
    expect(e.applyAction({ type: "wait", seconds: 2, reason: "" }).ok).toBe(true);
    expect(e.player.activity.kind).toBe("stairs");
  });

  test("walking cannot bypass the stairs at any side of the landing", () => {
    const e = atStairs();
    expect(e.applyAction({ type: "move_to", target: "PLATFORM", reason: "" }).ok).toBe(false);
    for (const y of [1, 15, 29]) expect(findPath({ x: STAIRS_TOP.x, y }, { x: STAIRS_BOTTOM.x, y })).toBeNull();
    expect(e.player.onPlatform).toBe(false);
  });

  test("NPC passengers continue from the upper landing down to the platform", () => {
    const w = new World(1);
    const p = w.addPerson("normal", { x: 43.4, y: 15 }, { hasTicket: true });
    p.screened = true;
    const f = w.facility("G3")!;
    f.serving = { personId: p.id, remaining: 0.1, recheck: false };
    p.activity = { kind: "service", facility: "G3" };
    w.stepPeopleAndFacilities();
    expect(p.onPlatform).toBe(false);
    for (let i = 0; i < 200 && !p.onPlatform; i++) w.stepPeopleAndFacilities();
    expect(p.onPlatform).toBe(true);
    expect(p.pos.x).toBeGreaterThanOrEqual(56);
  });
});
