import { expect, test } from "vitest";
import { ENTRANCE, FACILITIES, HEIGHT, SECURITY_X, queueSlot } from "../src/sim/layout";
import { findPath } from "../src/sim/nav";
import { Engine } from "../src/sim/engine";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { World } from "../src/sim/world";
import { facilitySolids } from "../src/sim/facilityGeometry";
import { clearOfScenery, personRadius } from "../src/sim/movement";

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

test("body-spaced live queues extend south and serving passengers keep their slot", () => {
  const w = new World(1), f = w.facility("TVM-1")!;
  const first = w.addPerson("luggage", f.def.head);
  first.activity = { kind: "service", facility: f.def.id };
  f.serving = { personId: first.id, remaining: 30, recheck: false };
  const next = w.queueStandPoint(f, 0, "luggage");
  expect(next.x).toBe(f.def.head.x);
  expect(next.y - f.def.head.y).toBeGreaterThanOrEqual(2 * personRadius("luggage"));
  expect(clearOfScenery(next, f.def.head, personRadius("luggage"))).toBe(true);
});

test("south-facing ticket bodies rotate with their queue and the expanded landing remains walkable", () => {
  const f = FACILITIES.find(f => f.id === "TVM-1")!;
  const body = facilitySolids(f.kind, f.pos, f.queueDirection)[0];
  expect(body.w).toBeCloseTo(.85);
  expect(body.h).toBeCloseTo(.789);
  expect(body.y + body.h).toBeLessThan(f.head.y - personRadius("luggage"));
  expect(findPath({ x: 45.4, y: 5 }, { x: 61, y: 9 })).not.toBeNull();
});

test("the agent compares the ticket bank before committing to the single machine seen at the entrance", async () => {
  const e = new Engine(1);
  expect(e.observe().facilities.filter(f => f.kind === "tvm")).toHaveLength(1);
  const result = await new HeuristicAgent().decide({ triggers: e.takeTriggers(), lastResult: null, observation: e.observe() });
  expect(result.action).toMatchObject({ type: "move_to", target: "TICKETS_C" });
});
