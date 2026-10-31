import { expect, test } from "vitest";
import { FACILITIES } from "../src/sim/layout";
import { NpcDirector } from "../src/sim/npc";
import { buildScenario } from "../src/sim/scenario";
import { World } from "../src/sim/world";

test("seeded failures vary across all gates, ticket machines and times while keeping routes open", () => {
  const gates = new Set<string>();
  const tvms = new Set<string>();
  const times = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) {
    const scenario = buildScenario(seed);
    expect(buildScenario(seed)).toEqual(scenario);
    const [gate] = Object.keys(scenario.initialStatus);
    expect(Object.entries(scenario.initialStatus)).toEqual([[gate, "broken"]]);
    expect(FACILITIES.find((f) => f.id === gate)?.kind).toBe("gate");
    gates.add(gate);
    const failures = scenario.events.filter((e): e is Extract<typeof e, { type: "status" }> => e.type === "status" && e.status === "broken");
    expect(failures).toHaveLength(1);
    const failure = failures[0];
    expect(FACILITIES.find((f) => f.id === failure.facility)?.kind).toBe("tvm");
    expect(Number.isInteger(failure.t)).toBe(true);
    expect(failure.t).toBeGreaterThanOrEqual(20);
    expect(failure.t).toBeLessThanOrEqual(40);
    tvms.add(failure.facility);
    times.add(failure.t);
    expect(scenario.events.filter((e) => e.type === "status" && e.status === "closed")).toEqual([
      expect.objectContaining({ t: 40, facility: "S1" }),
    ]);
    expect(scenario.events.filter((e) => e.type === "recheck")).toEqual([
      { t: 55, type: "recheck", facility: "S2", extra: [10, 15] },
    ]);
    expect(scenario.events.some((e) => e.type === "power")).toBe(false);
    expect(scenario.spawns.some((s) => s.startQueue === gate)).toBe(false);
    const world = new World(seed);
    new NpcDirector(world, scenario);
    expect(world.facility(gate)!.queue).toHaveLength(0);
    expect([...world.facilities.values()].filter((f) => f.def.kind === "gate" && f.status === "open")).toHaveLength(4);
  }
  expect([...gates].sort()).toEqual(["G1", "G2", "G3", "G4", "G5"]);
  expect([...tvms].sort()).toEqual(["TVM-1", "TVM-2", "TVM-3"]);
  expect(times.size).toBe(21);
});

test("crowd and deadline settings cannot change the seeded failure schedule", () => {
  for (const seed of [1, 2, 6, 17, 200]) {
    const plain = buildScenario(seed, { extraQueuePeople: 0 });
    const crowded = buildScenario(seed, { extraQueuePeople: 8, timeLimitSeconds: 60 });
    expect(crowded.initialStatus).toEqual(plain.initialStatus);
    expect(crowded.events).toEqual(plain.events);
    expect(crowded.spawns.filter((s) => !s.startQueue)).toEqual(plain.spawns.filter((s) => !s.startQueue));
  }
});
