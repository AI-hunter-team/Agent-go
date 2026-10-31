import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { ESCALATOR_TOP } from "../src/sim/layout";

const advance = (e: Engine, seconds: number) => { for (let i = 0; i < seconds * 10; i++) e.step(); };
function atEntrance() {
  const e = new Engine(1);
  // A plain World has no scenario background passengers: isolate admission physics.
  e.world.transit.queue.splice(0);
  for (const [id, p] of e.world.persons) if (!p.isPlayer) e.world.persons.delete(id);
  e.world.transit.nextCrowdAt = Infinity;
  Object.assign(e.player, { screened: true, hasTicket: true, passedGate: true, pos: { ...ESCALATOR_TOP } });
  e.takeTriggers();
  return e;
}

describe("escalator admission", () => {
  test("arrival inside boarding reach does not wait forever for an occupied exact entrance point", () => {
    const e = atEntrance();
    e.world.addPerson("normal", { ...ESCALATOR_TOP });
    e.player.pos = { x: ESCALATOR_TOP.x - 2, y: ESCALATOR_TOP.y - 2 };
    expect(e.applyAction({ type: "move_to", target: "ESCALATOR_TOP", reason: "到达候梯入口" }).ok).toBe(true);
    advance(e, 5);
    expect(e.player.activity.kind).toBe("idle");
    expect(Math.hypot(e.player.pos.x - ESCALATOR_TOP.x, e.player.pos.y - ESCALATOR_TOP.y)).toBeLessThanOrEqual(.8);
    expect(e.applyAction({ type: "take_escalator", reason: "候梯" }).ok).toBe(true);
  });
  test("requires passing the gate and reaching the entrance", () => {
    const e = atEntrance();
    e.player.passedGate = false;
    expect(e.applyAction({ type: "take_escalator", reason: "" }).ok).toBe(false);
    e.player.passedGate = true;
    e.player.pos = { x: 45.4, y: 22 };
    expect(e.applyAction({ type: "take_escalator", reason: "" }).ok).toBe(false);
  });
  test("empty admission takes four seconds of travel; riding cannot be interrupted", () => {
    const e = atEntrance();
    expect(e.applyAction({ type: "take_escalator", reason: "" }).ok).toBe(true);
    e.step();
    expect(e.player.activity.kind).toBe("escalator");
    expect(e.applyAction({ type: "move_to", target: "STAIRS_TOP", reason: "" }).ok).toBe(false);
    expect(e.applyAction({ type: "descend_stairs", reason: "" }).ok).toBe(false);
    advance(e, 3.9);
    expect(e.player.onPlatform).toBe(false);
    advance(e, .1);
    expect(e.player.onPlatform).toBe(true);
    expect(e.status).toBe("success");
    expect(e.timeBreakdown.escalator).toBeCloseTo(4);
  });
  test("FIFO admits one person per second; queueing can be cancelled and loses the place", () => {
    const e = atEntrance();
    const first = e.world.addPerson("normal", { ...ESCALATOR_TOP }, { hasTicket: true });
    first.passedGate = true;
    expect(e.world.transit.join(first)).toBeNull();
    expect(e.applyAction({ type: "take_escalator", reason: "" }).ok).toBe(true);
    e.step();
    expect(first.activity.kind).toBe("escalator");
    advance(e, .5);
    expect(e.player.activity.kind).not.toBe("escalator");
    expect(e.world.transit.queue.filter(id => id === "player")).toHaveLength(1);
    expect(e.applyAction({ type: "leave_queue", reason: "换楼梯" }).ok).toBe(true);
    expect(e.world.transit.queue).not.toContain("player");
    expect(e.player.activity.kind).toBe("idle");
    expect(e.applyAction({ type: "move_to", target: "STAIRS_TOP", reason: "" }).ok).toBe(true);
  });
  test("same seed produces the same real initial crowd and evolving queue", () => {
    const a = new Engine(7), b = new Engine(7);
    expect(a.world.transit.queue.length).toBeGreaterThan(0);
    advance(a, 5); advance(b, 5);
    expect([...a.world.persons.values()]).toEqual([...b.world.persons.values()]);
    expect(a.world.transit.queue).toEqual(b.world.transit.queue);
    const signatures = new Set([1, 2, 3, 4, 5, 6].map(seed => new Engine(seed).world.transit.queue.length));
    expect(signatures.size).toBeGreaterThan(1);
  });
  test("full queues reject entry without losing activity and repeated entry never duplicates a place", () => {
    const e = atEntrance();
    for (let i = 0; i < 14; i++) {
      const p = e.world.addPerson("normal", e.world.transit.slot(i), { hasTicket: true });
      p.passedGate = true;
      p.activity = { kind: "escalator_queue", joinedAt: 0 };
      e.world.transit.queue.push(p.id);
    }
    expect(e.applyAction({ type: "take_escalator", reason: "" }).ok).toBe(false);
    expect(e.player.activity.kind).toBe("idle");
    expect(e.world.transit.queue).toHaveLength(14);
    e.world.transit.queue.splice(0);
    expect(e.applyAction({ type: "take_escalator", reason: "" }).ok).toBe(true);
    expect(e.applyAction({ type: "take_escalator", reason: "" }).ok).toBe(true);
    expect(e.world.transit.queue).toEqual(["player"]);
  });
  test("a visible entrance does not reveal waiting passengers outside vision range", () => {
    const e = new Engine(7);
    Object.assign(e.player, { passedGate: true, screened: true, pos: { ...ESCALATOR_TOP } });
    const before = e.observe().routes!.find(r => r.id === "escalator")!.queueLength;
    const id = e.world.transit.queue[0];
    e.world.persons.get(id)!.pos = { x: 45.4, y: 22 };
    expect(e.observe().routes!.find(r => r.id === "escalator")!.queueLength).toBe(before - 1);
    expect(e.world.transit.queue.length).toBe(before);
  });
});
