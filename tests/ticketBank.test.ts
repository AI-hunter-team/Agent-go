import { expect, test } from "vitest";
import { ENTRANCE, FACILITIES, HEIGHT, SECURITY_X, queueSlot } from "../src/sim/layout";
import { findPath } from "../src/sim/nav";
import { Engine } from "../src/sim/engine";
import { HeuristicAgent } from "../src/agent/heuristicAgent";

test("three side-by-side ticket machines face the hall and their queues extend inward", () => {
  const machines = FACILITIES.filter(f => f.kind === "tvm");
  expect(new Set(machines.map(f => f.pos.x)).size).toBe(3);
  expect(new Set(machines.map(f => f.pos.y)).size).toBe(1);
  for (const f of machines) {
    const tail = queueSlot(f, 10);
    expect(f.pos.x).toBeLessThan(SECURITY_X);
    expect(f.pos.y).toBeLessThan(ENTRANCE.y);
    expect(f.head.y).toBeGreaterThan(f.pos.y);
    expect(tail.y).toBeGreaterThan(f.head.y);
    expect(tail.y).toBeLessThan(HEIGHT);
    expect(tail.x).toBe(f.head.x);
    expect(findPath(ENTRANCE, tail)).not.toBeNull();
    expect(findPath(ENTRANCE, f.head)).not.toBeNull();
  }
});

test("the agent compares the ticket bank before committing to the single machine seen at the entrance", async () => {
  const e = new Engine(1);
  expect(e.observe().facilities.filter(f => f.kind === "tvm")).toHaveLength(1);
  const result = await new HeuristicAgent().decide({ triggers: e.takeTriggers(), lastResult: null, observation: e.observe() });
  expect(result.action).toMatchObject({ type: "move_to", target: "TICKETS_C" });
});
