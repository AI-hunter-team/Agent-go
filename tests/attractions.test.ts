import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { DT } from "../src/sim/scenario";

function inHall() {
  const e = new Engine(2);
  Object.assign(e.player, { screened: true, hasTicket: true, pos: { x: 31, y: 6 } });
  e.takeTriggers();
  return e;
}
const inspect = (e: Engine, mode: "glance" | "linger", attraction = "TOYS") =>
  e.applyAction({ type: "inspect_attraction", attraction, mode, reason: "查看" });
const steps = (e: Engine, n: number) => { for (let i = 0; i < n; i++) e.step(); };

describe("optional attention", () => {
  test("seeing an attraction triggers once and never reduces ordinary walking speed", () => {
    const e = inHall();
    e.applyAction({ type: "move_to", target: "CONC_N", reason: "赶路" });
    const before = { ...e.player.pos };
    e.step();
    expect(Math.hypot(e.player.pos.x - before.x, e.player.pos.y - before.y)).toBeCloseTo(1.4 * DT);
    expect(e.takeTriggers().filter(t => t.kind === "attraction_seen").length).toBeGreaterThan(0);
    steps(e, 5);
    expect(e.takeTriggers().filter(t => t.kind === "attraction_seen")).toHaveLength(0);
    expect(e.timeBreakdown.distraction).toBe(0);
  });
  test("a chosen glance slows existing walking, then restores it without double-counting time", () => {
    const e = inHall();
    e.applyAction({ type: "move_to", target: "GATE_N", reason: "赶路" });
    const before = { ...e.player.pos };
    expect(inspect(e, "glance").ok).toBe(true);
    e.step();
    expect(Math.hypot(e.player.pos.x - before.x, e.player.pos.y - before.y)).toBeCloseTo(1.4 * .55 * DT);
    steps(e, 29);
    expect(e.player.activity.kind).toBe("walking");
    expect(e.timeBreakdown.distraction).toBeCloseTo(3);
    expect(e.timeBreakdown.walking).toBe(0);
    e.step();
    expect(e.timeBreakdown.walking).toBeCloseTo(.1);
  });
  test("lingering requires approach; a valid move interrupts it and records actual time", () => {
    const e = inHall();
    e.player.pos = { x: 40, y: 6 };
    expect(inspect(e, "linger").ok).toBe(false);
    e.player.pos = { x: 30.5, y: 4.5 };
    expect(inspect(e, "linger").ok).toBe(true);
    steps(e, 10);
    expect(e.applyAction({ type: "move_to", target: "PLATFORM", reason: "无效" }).ok).toBe(false);
    expect(e.player.activity.kind).toBe("distracted");
    expect(e.applyAction({ type: "move_to", target: "GATE_N", reason: "继续赶路" }).ok).toBe(true);
    expect(e.player.activity.kind).toBe("walking");
    expect(e.world.events.find(ev => ev.kind === "attention_end")?.text).toContain("1 秒");
    expect(inspect(e, "glance").ok).toBe(false);
    expect(e.player.activity.kind).toBe("walking");
  });
  test("unknown and unseen attractions cannot be inspected or discard a queue place", () => {
    const e = new Engine(1);
    expect(inspect(e, "glance", "MISSING").ok).toBe(false);
    expect(inspect(e, "glance").ok).toBe(false);
    Object.assign(e.player, { hasTicket: true, pos: { x: 25.4, y: 15 } });
    const f = e.world.facility("S2")!;
    f.queue.push(e.player.id);
    e.player.activity = { kind: "queued", facility: "S2" };
    expect(inspect(e, "glance").ok).toBe(false);
    expect(f.queue).toContain("player");
  });
  test.each(["jump_gate", "consented"] as const)("successful %s ends attention with actual time and cooldown", mechanic => {
    const e = inHall();
    e.player.pos = { x: 43, y: 5 };
    expect(inspect(e, "glance", "ADVERT").ok).toBe(true);
    steps(e, 10);
    if (mechanic === "jump_gate") expect(e.applyAction({ type: "attempt_creative", intent: "翻闸", reason: "" }, "jump_gate").ok).toBe(true);
    else {
      const f = e.world.facility("G1")!;
      f.queue.splice(0);
      const npc = e.world.addPerson("normal", f.def.head, { hasTicket: true });
      npc.screened = true; npc.activity = { kind: "queued", facility: "G1" }; f.queue.push(npc.id);
      expect(e.creative.startConsentedCutIn(e.player, npc.id).ok).toBe(true);
    }
    expect(e.world.events.find(ev => ev.kind === "attention_end")?.text).toContain("1 秒");
    expect(e.player.attentionCooldown.ADVERT).toBe(31);
    expect(e.player.activity.kind).toBe("creative");
  });
  test("rejected creative action keeps the attention activity and its unfinished evidence", () => {
    const e = inHall();
    expect(inspect(e, "glance").ok).toBe(true);
    e.step();
    expect(e.applyAction({ type: "attempt_creative", intent: "飞行", reason: "" }, "unsupported").ok).toBe(false);
    expect(e.player.activity.kind).toBe("distracted");
    expect(e.world.events.some(ev => ev.kind === "attention_end")).toBe(false);
  });
});
