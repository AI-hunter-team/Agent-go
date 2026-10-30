import { expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { buildScenario } from "../src/sim/scenario";
import { resolveGameSettings, gameSettingsError } from "../src/shared/gameSettings";

test("custom deadline ends exactly at that time and is reflected in observations", () => {
  const e = new Engine(1, { timeLimitSeconds: 60, extraQueuePeople: 0 });
  expect(e.observe().self.timeLeft).toBe(60);
  for (let i = 0; i < 599; i++) e.step();
  expect(e.status).toBe("running"); expect(e.observe().self.timeLeft).toBeCloseTo(0.1);
  e.step();
  expect(e.status).toBe("failed"); expect(e.t).toBe(60);
  expect(e.failReason).toContain("60 秒"); expect(e.observe().self.timeLeft).toBe(0);
});

test("adds exactly N people to each initially open lane including empty ones", () => {
  const base = new Engine(1, { extraQueuePeople: 0 });
  const crowded = new Engine(1, { timeLimitSeconds: 90, extraQueuePeople: 2 });
  for (const [id, f] of base.world.facilities) {
    const expected = f.status === "open" ? f.queue.length + 2 : f.queue.length;
    expect(crowded.world.facility(id)!.queue).toHaveLength(expected);
  }
  expect(crowded.world.facility("TVM-3")!.queue).toHaveLength(2);
  expect(crowded.world.facility("G3")!.queue).toHaveLength(0);
});

test("zero extra people preserves the old scenario and extra crowd does not alter background arrivals", () => {
  const plain = buildScenario(7, { extraQueuePeople: 0 });
  expect(buildScenario(7, { timeLimitSeconds: 180, extraQueuePeople: 0 })).toEqual(plain);
  const crowded = buildScenario(7, { timeLimitSeconds: 90, extraQueuePeople: 4 });
  expect(crowded.spawns.filter((p) => !p.startQueue)).toEqual(plain.spawns.filter((p) => !p.startQueue));
  expect(crowded.events).toEqual(plain.events);
});

test("settings are validated and copied so later UI changes cannot alter a running game", () => {
  const input = { timeLimitSeconds: 90, extraQueuePeople: 2 };
  const e = new Engine(1, input); input.timeLimitSeconds = 180; input.extraQueuePeople = 0;
  expect(e.settings).toEqual({ timeLimitSeconds: 90, extraQueuePeople: 2 });
  expect(Object.isFrozen(e.settings)).toBe(true);
  expect(resolveGameSettings()).toEqual({ timeLimitSeconds: 120, extraQueuePeople: 3 });
});

test.each([
  { timeLimitSeconds: 0, extraQueuePeople: 0 }, { timeLimitSeconds: 90.5, extraQueuePeople: 0 },
  { timeLimitSeconds: NaN, extraQueuePeople: 0 }, { timeLimitSeconds: 301, extraQueuePeople: 0 },
  { timeLimitSeconds: 90, extraQueuePeople: 9 }, { timeLimitSeconds: 90, extraQueuePeople: -1 },
  { timeLimitSeconds: 90, extraQueuePeople: 1.5 }, { timeLimitSeconds: "90", extraQueuePeople: 0 },
  { timeLimitSeconds: 90, extraQueuePeople: 0, injected: true }, null,
])("rejects invalid settings %#", (value) => {
  expect(gameSettingsError(value)).toBeTruthy();
  expect(() => resolveGameSettings(value as never)).toThrow();
});
