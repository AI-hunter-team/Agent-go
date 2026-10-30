import { describe, expect, test } from "vitest";
import { NpcDirector } from "../src/sim/npc";
import { buildScenario } from "../src/sim/scenario";
import { World } from "../src/sim/world";

function simulate(seconds: number, seed = 1) {
  const world = new World(seed);
  // Isolate the original NPC/scripted-event fixture from default crowd balancing.
  const director = new NpcDirector(world, buildScenario(seed, { extraQueuePeople: 0 }));
  for (let i = 0; i < seconds * 10; i++) {
    world.t = Math.round((world.t + 0.1) * 10) / 10;
    director.step();
    world.stepPeopleAndFacilities();
  }
  return world;
}

describe("NPC director", () => {
  test("starting crowd is queued and G3 starts broken", () => {
    const w = simulate(0);
    expect(w.facility("TVM-2")!.queue).toHaveLength(4);
    expect(w.facility("S2")!.queue).toHaveLength(5);
    expect(w.facility("G3")!.status).toBe("broken");
  });

  test("NPCs flow through to the platform", () => {
    const w = simulate(60);
    expect(w.gatePassed).toBeGreaterThanOrEqual(10);
  });

  test("scripted closures happen on time and nobody queues at them", () => {
    const w = simulate(45);
    expect(w.facility("TVM-1")!.status).toBe("broken");
    expect(w.facility("S1")!.status).toBe("closed");
    expect(w.facility("S1")!.queue).toHaveLength(0);
    for (const p of w.persons.values()) {
      if (p.activity.kind === "queued" || p.activity.kind === "to_queue") {
        expect(["S1", "TVM-1", "G3"]).not.toContain(p.activity.facility);
      }
    }
  });

  test("a recheck lengthens one service at S2", () => {
    const w = simulate(90);
    expect(w.events.some((e) => e.kind === "recheck")).toBe(true);
  });

  test("the same seed reproduces the same world", () => {
    const a = simulate(70, 3);
    const b = simulate(70, 3);
    const snap = (w: World) => [...w.persons.values()].map((p) => `${p.id}:${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)}`).join("|");
    expect(snap(a)).toBe(snap(b));
  });
});
