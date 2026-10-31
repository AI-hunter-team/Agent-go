import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { buildScenario, DT } from "../src/sim/scenario";
import { createFixtureEngine, emptyScenario, singleQueueScenario, singleQueueWithGuard } from "./fixtures/scenarios";

describe("injectable scenarios", () => {
  test("an empty scenario suppresses default crowds and scripted failures", () => {
    const engine = createFixtureEngine();
    for (let i = 0; i < 60 / DT; i++) engine.step();
    expect([...engine.world.persons.values()].map((p) => p.id)).toEqual([engine.player.id]);
    expect([...engine.world.facilities.values()].every((f) => f.status === "open")).toBe(true);
    expect(engine.guards.guards).toHaveLength(0);
    expect(engine.t).toBe(60);
  });

  test("injects initial statuses, queues, timed spawns and events", () => {
    const scenario = singleQueueScenario(9, "TVM-2", ["elderly", "normal"]);
    scenario.initialStatus.G3 = "broken";
    scenario.spawns.push({ t: 1, kind: "hurried", hasCard: true, irritable: false, startQueue: null });
    scenario.events.push({ t: 2, type: "status", facility: "TVM-1", status: "broken", note: "剧本故障", broadcast: null });
    const original = structuredClone(scenario);
    const engine = createFixtureEngine(scenario);
    expect(engine.world.facility("TVM-2")!.queue).toHaveLength(2);
    expect(engine.world.facility("G3")!.status).toBe("broken");
    for (let i = 0; i < 2 / DT; i++) engine.step();
    expect([...engine.world.persons.values()].some((p) => p.kind === "hurried")).toBe(true);
    expect(engine.world.facility("TVM-1")!.status).toBe("broken");
    expect(scenario).toEqual(original);
  });

  test("single queue and single guard fixtures are isolated and reproducible", () => {
    const a = singleQueueWithGuard(9);
    const b = singleQueueWithGuard(9);
    expect(a.world.facility("TVM-2")!.queue).toHaveLength(1);
    expect(a.guards.guards).toHaveLength(1);
    expect(a.guards.guards[0].def.id).toBe("fixture-guard");
    for (let i = 0; i < 50; i++) { a.step(); b.step(); }
    expect(a.observe()).toEqual(b.observe());
    a.guards.guards[0].pos.x = 0;
    expect(b.guards.guards[0].pos.x).toBe(20);
    expect(emptyScenario().spawns).not.toBe(emptyScenario().spawns);
  });

  test("omitting the override keeps production scenarios and guard defaults", () => {
    const engine = new Engine(1);
    expect(engine.world.persons.size).toBeGreaterThan(1);
    expect(engine.guards.guards).toHaveLength(2);
    for (const [id, status] of Object.entries(buildScenario(1).initialStatus)) {
      expect(engine.world.facility(id)!.status).toBe(status);
    }
  });

  test("rejects a typo in a fixture facility before constructing an engine", () => {
    expect(() => singleQueueScenario(1, "missing")).toThrow("Unknown fixture facility");
  });
});
