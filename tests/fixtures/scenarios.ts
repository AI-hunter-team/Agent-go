import { Engine } from "../../src/sim/engine";
import { GuardSystem } from "../../src/sim/guards";
import { FACILITIES } from "../../src/sim/layout";
import type { GuardDef, NpcSpawn, Scenario } from "../../src/sim/scenario";

/** Fresh objects on every call: fixtures never share queues, events or spawns. */
export function emptyScenario(seed = 1): Scenario {
  return { seed, initialStatus: {}, spawns: [], events: [] };
}

export function singleQueueScenario(seed = 1, facility = "TVM-2", kinds: readonly NpcSpawn["kind"][] = ["normal"]): Scenario {
  const def = FACILITIES.find((entry) => entry.id === facility);
  if (!def) throw new Error(`Unknown fixture facility: ${facility}`);
  return {
    ...emptyScenario(seed),
    spawns: kinds.map((kind) => ({ t: 0, kind, hasCard: def.kind !== "tvm", irritable: false, startQueue: facility })),
  };
}

/** Guard selection is test setup through the existing mutable guard list. */
export function createFixtureEngine(scenario = emptyScenario(), guards: readonly GuardDef[] = []): Engine {
  const engine = new Engine(scenario.seed, {}, scenario);
  const selected = new GuardSystem(structuredClone(guards));
  engine.guards.guards.splice(0, engine.guards.guards.length, ...selected.guards);
  return engine;
}

export function singleQueueWithGuard(seed = 1): Engine {
  return createFixtureEngine(singleQueueScenario(seed), [{
    id: "fixture-guard", label: "测试保安", route: [{ x: 20, y: 15 }],
    facing: Math.PI, speed: 0, pauseSeconds: 0,
  }]);
}
