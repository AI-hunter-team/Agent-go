import { describe, expect, test } from "vitest";
import { NpcDirector } from "../src/sim/npc";
import { buildScenario } from "../src/sim/scenario";
import { World } from "../src/sim/world";

function simulate(seconds: number, seed = 1, scenario=buildScenario(seed, { extraQueuePeople: 0 })) {
  const world = new World(seed);
  // Isolate NPC/scripted events from default crowd balancing.
  const director = new NpcDirector(world, scenario);
  for (let i = 0; i < seconds * 10; i++) {
    world.t = Math.round((world.t + 0.1) * 10) / 10;
    director.step();
    world.stepPeopleAndFacilities();
  }
  return world;
}

describe("NPC director", () => {
  test("starting crowd is queued and any selected broken gate has no queue", () => {
    const w = simulate(0);
    expect(w.facility("TVM-2")!.queue).toHaveLength(4);
    expect(w.facility("S2")!.queue).toHaveLength(5);
    for(const brokenGate of Object.keys(buildScenario(1).initialStatus)){
      expect(w.facility(brokenGate)!.status).toBe("broken");expect(w.facility(brokenGate)!.queue).toHaveLength(0);
    }
  });

  test("NPCs flow through to the platform", () => {
    const w = simulate(60);
    expect(w.gatePassed).toBeGreaterThanOrEqual(10);
  });

  test.each([1,2,3,4,5,6])("seed %i optional closures happen on time and nobody queues at them", (seed) => {
    const w = simulate(90,seed);
    const scenario = buildScenario(seed);
    const closed=scenario.events.flatMap(e=>e.type==="status"?[e.facility]:[]);
    for(const id of closed){expect(w.facility(id)!.status).not.toBe("open");expect(w.facility(id)!.queue).toHaveLength(0);}
    for (const p of w.persons.values()) {
      if (p.activity.kind === "queued" || p.activity.kind === "to_queue") {
        expect([...closed,...Object.keys(scenario.initialStatus)]).not.toContain(p.activity.facility);
      }
    }
  });

  test.each([1,6])("seed %i recheck lengthens service at S2 in an explicit fixture", (seed) => {
    const scenario=buildScenario(seed,{extraQueuePeople:0});scenario.events=[{t:.1,type:"recheck",facility:"S2",extra:[10,15]}];
    const w = simulate(20,seed,scenario);
    expect(w.events.some((e) => e.kind === "recheck")).toBe(true);
  });

  test("the same seed reproduces the same world", () => {
    const a = simulate(70, 3);
    const b = simulate(70, 3);
    const snap = (w: World) => [...w.persons.values()].map((p) => `${p.id}:${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)}`).join("|");
    expect(snap(a)).toBe(snap(b));
  });
});
