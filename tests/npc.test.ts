import { describe, expect, test } from "vitest";
import { NpcDirector } from "../src/sim/npc";
import { buildScenario } from "../src/sim/scenario";
import { World } from "../src/sim/world";

function simulate(seconds: number, seed = 1) {
  const world = new World(seed);
  // Isolate NPC/scripted events from default crowd balancing.
  const director = new NpcDirector(world, buildScenario(seed, { extraQueuePeople: 0 }));
  for (let i = 0; i < seconds * 10; i++) {
    world.t = Math.round((world.t + 0.1) * 10) / 10;
    director.step();
    world.stepPeopleAndFacilities();
  }
  return world;
}

describe("NPC director", () => {
  test("starting crowd is queued and the selected gate starts broken without a queue", () => {
    const w = simulate(0);
    expect(w.facility("TVM-2")!.queue).toHaveLength(4);
    expect(w.facility("S2")!.queue).toHaveLength(5);
    const [brokenGate] = Object.keys(buildScenario(1).initialStatus);
    expect(w.facility(brokenGate)!.status).toBe("broken");
    expect(w.facility(brokenGate)!.queue).toHaveLength(0);
  });

  test("NPCs flow through to the platform", () => {
    const w = simulate(60);
    expect(w.gatePassed).toBeGreaterThanOrEqual(10);
  });

  test.each([1, 2, 3, 4, 5, 6])("seed %i scripted closures happen on time and nobody queues at them", (seed) => {
    const w = simulate(45, seed);
    const scenario = buildScenario(seed);
    const failedTvm = scenario.events.find((e): e is Extract<typeof e, { type: "status" }> => e.type === "status" && e.status === "broken")!.facility;
    const closedSecurity = scenario.events.find((e): e is Extract<typeof e, { type: "status" }> => e.type === "status" && e.status === "closed")!.facility;
    expect(w.facility(failedTvm)!.status).toBe("broken");
    expect(w.facility(closedSecurity)!.status).toBe("closed");
    expect(w.facility(closedSecurity)!.queue).toHaveLength(0);
    expect([...w.facilities.values()].filter((f) => f.def.kind === "security" && f.status === "open")).toHaveLength(2);
    for (const p of w.persons.values()) {
      if (p.activity.kind === "queued" || p.activity.kind === "to_queue") {
        expect([closedSecurity, failedTvm, ...Object.keys(scenario.initialStatus)]).not.toContain(p.activity.facility);
      }
    }
  });

  test.each([1, 6])("seed %i rechecks a passenger at an open security lane", (seed) => {
    const w = simulate(90, seed);
    const recheck = buildScenario(seed).events.find(e => e.type === "recheck")!;
    const lane = w.facility(recheck.facility)!;
    expect(lane.status).toBe("open");
    expect(w.events.some((e) => e.kind === "recheck" && e.text.includes(lane.def.label))).toBe(true);
  });

  test("the same seed reproduces the same world", () => {
    const a = simulate(70, 3);
    const b = simulate(70, 3);
    const snap = (w: World) => [...w.persons.values()].map((p) => `${p.id}:${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)}`).join("|");
    expect(snap(a)).toBe(snap(b));
  });
});
