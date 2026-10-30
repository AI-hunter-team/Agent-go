import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import type { AgentAction } from "../src/shared/types";

type Loose<T> = T extends unknown ? Omit<T, "reason"> & { reason?: string } : never;
const act = (e: Engine, a: Loose<AgentAction>) => e.applyAction({ reason: "", ...a } as AgentAction);

function runUntilTrigger(e: Engine, maxSeconds = 200) {
  for (let i = 0; i < maxSeconds * 10 && e.status === "running"; i++) {
    e.step();
    if (e.hasTriggers()) return e.takeTriggers();
  }
  return [];
}

describe("engine", () => {
  test("starts with a start trigger and nothing visible from the entrance", () => {
    const e = new Engine(1);
    expect(e.takeTriggers().map((t) => t.kind)).toEqual(["start"]);
    expect(e.observe().facilities).toHaveLength(0);
    expect(e.observe().self.timeLeft).toBe(120);
  });

  test("world time does not advance without step (bullet time)", () => {
    const e = new Engine(1);
    act(e, { type: "move_to", target: "HALL_C" });
    const pos = { ...e.player.pos };
    expect(e.t).toBe(0);
    expect(e.player.pos).toEqual(pos);
  });

  test("unknown targets and facilities are rejected with the valid options", () => {
    const e = new Engine(1);
    expect(act(e, { type: "move_to", target: "MOON" }).text).toContain("HALL_C");
    expect(act(e, { type: "join_queue", facility: "X9" }).text).toContain("TVM-1");
  });

  test("a scripted orderly run descends after the gate and is scored on platform arrival", () => {
    const e = new Engine(1, { timeLimitSeconds: 180, extraQueuePeople: 0 });
    e.takeTriggers();
    const plan: AgentAction[] = [
      { type: "join_queue", facility: "TVM-3", reason: "" },
      { type: "join_queue", facility: "S3", reason: "" },
      { type: "join_queue", facility: "G5", reason: "" },
      { type: "move_to", target: "STAIRS_TOP", reason: "" },
      { type: "descend_stairs", reason: "" },
    ];
    let stage = 0;
    act(e, plan[0]);
    while (e.status === "running") {
      const triggers = runUntilTrigger(e);
      if ((triggers.some((t) => t.kind === "service_done") && stage < 3) || (stage === 3 && triggers.some((t) => t.kind === "arrived"))) act(e, plan[++stage]);
      if (triggers.length === 0) break;
    }
    expect(e.status).toBe("success");
    expect(e.score).toBe(e.t);
    expect(e.score).toBeGreaterThan(20);
    expect(e.score).toBeLessThan(180);
    const tb = e.timeBreakdown;
    const total = tb.walking + tb.queueing + tb.service + tb.waiting + tb.creative + tb.idle + (tb.stairs ?? 0);
    expect(total).toBeCloseTo(e.t, 5);
    expect(tb.stairs).toBeCloseTo(6);
  });

  test("standing still runs out the clock", () => {
    const e = new Engine(1);
    for (let i = 0; i < 1900 && e.status === "running"; i++) e.step();
    expect(e.status).toBe("failed");
    expect(e.failReason).toMatch(/超时/);
    expect(e.score).toBeNull();
  });

  test("waiting while queued keeps the place and wakes up later", () => {
    const e = new Engine(1);
    e.takeTriggers();
    act(e, { type: "join_queue", facility: "TVM-2" });
    const joined = runUntilTrigger(e);
    expect(joined.map((t) => t.kind)).toContain("joined_queue");
    expect(act(e, { type: "wait", seconds: 3 }).text).toMatch(/保持/);
    const t0 = e.t;
    const woke = runUntilTrigger(e);
    expect(woke.map((t) => t.kind)).toContain("wait_done");
    expect(e.t - t0).toBeCloseTo(3, 5);
    expect(e.player.activity.kind).toBe("queued");
  });

  test("moving away from a queue gives up the place", () => {
    const e = new Engine(1);
    e.takeTriggers();
    act(e, { type: "join_queue", facility: "TVM-2" });
    runUntilTrigger(e);
    const r = act(e, { type: "move_to", target: "HALL_S" });
    expect(r.text).toMatch(/失去位次/);
    expect(e.world.facility("TVM-2")!.queue).not.toContain("player");
  });

  test("seeing a broken facility for the first time triggers a decision", () => {
    const e = new Engine(1);
    e.takeTriggers();
    act(e, { type: "move_to", target: "HALL_N" });
    // TVM-1 breaks at t=25 while it is in view of HALL_N.
    const seen: string[] = [];
    for (let i = 0; i < 6 && e.t < 40; i++) {
      const triggers = runUntilTrigger(e, 40);
      seen.push(...triggers.map((t) => t.text));
      if (e.player.activity.kind === "idle") act(e, { type: "wait", seconds: 20 });
    }
    expect(seen.some((s) => s.includes("TVM-1") && s.includes("故障"))).toBe(true);
  });

  test("same seed and same actions give identical runs", () => {
    const run = () => {
      const e = new Engine(5);
      act(e, { type: "join_queue", facility: "TVM-3" });
      for (let i = 0; i < 600; i++) e.step();
      return JSON.stringify([e.player.pos, e.world.events]);
    };
    expect(run()).toBe(run());
  });

  test("waiting is allowed during a service; other actions are not", () => {
    const e = new Engine(1);
    e.player.activity = { kind: "service", facility: "TVM-3" };
    expect(act(e, { type: "move_to", target: "HALL_C" }).ok).toBe(false);
    expect(act(e, { type: "wait", seconds: 4 }).ok).toBe(true);
    expect(e.player.activity.kind).toBe("service");
  });
});

test("leaving a queue triggers the next decision rather than idling until timeout", () => {
  const e = new Engine(1);
  const f = e.world.facility("TVM-2")!;
  f.queue.push("player");
  e.player.activity = { kind: "queued", facility: "TVM-2" };
  e.takeTriggers();
  expect(e.applyAction({ type: "leave_queue", reason: "" }).ok).toBe(true);
  expect(e.takeTriggers().some((t) => t.kind === "arrived")).toBe(true);
});

test("an unreachable target does not silently discard a queue position", () => {
  const e = new Engine(1);
  const f = e.world.facility("TVM-2")!;
  f.queue.push("player");
  e.player.activity = { kind: "queued", facility: "TVM-2" };
  expect(e.applyAction({ type: "join_queue", facility: "G1", reason: "" }).ok).toBe(false);
  expect(f.queue).toContain("player");
});
