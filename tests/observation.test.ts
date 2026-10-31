import { describe, expect, test } from "vitest";
import { GuardSystem } from "../src/sim/guards";
import { NpcDirector } from "../src/sim/npc";
import { buildObservation, playerCanSee, summarizeObservation } from "../src/sim/observation";
import { buildScenario } from "../src/sim/scenario";
import { World } from "../src/sim/world";

function worldWithPlayerAt(x: number, y: number) {
  const world = new World(1);
  // Keep the visibility fixture's original passengers, independent of gameplay balancing.
  new NpcDirector(world, buildScenario(1, { extraQueuePeople: 0 }));
  const guards = new GuardSystem();
  const p = world.addPerson("player", { x, y }, { isPlayer: true });
  return { world, guards, p };
}

describe("observation", () => {
  test("only nearby facilities are visible", () => {
    const { world, guards } = worldWithPlayerAt(17, 12);
    const ids = buildObservation(world, guards).facilities.map((f) => f.id);
    expect(ids).toContain("TVM-2");
    expect(ids).toContain("S2");
    expect(ids.some((id) => id.startsWith("G"))).toBe(false);
  });

  test("railings permit nearby observations but distant gates remain outside range", () => {
    const { world, guards } = worldWithPlayerAt(24, 10);
    const ids = buildObservation(world, guards).facilities.map((f) => f.id);
    expect(ids.some((id) => id.startsWith("G"))).toBe(false);
    expect(playerCanSee({ x: 22, y: 10 }, { x: 30, y: 10 })).toBe(true);
    expect(playerCanSee({ x: 22, y: 10 }, { x: 44, y: 10 })).toBe(false);
  });

  test("a broken gate is only known once it is in view", () => {
    const far = worldWithPlayerAt(31, 7);
    far.world.setStatus("G3", "broken", "故障");
    expect(buildObservation(far.world, far.guards).facilities.find((f) => f.id === "G3")).toBeUndefined();
    const near = worldWithPlayerAt(38, 15);
    near.world.setStatus("G3", "broken", "故障");
    expect(buildObservation(near.world, near.guards).facilities.find((f) => f.id === "G3")?.status).toBe("broken");
  });

  test("queues report visible traits, not hidden service times", () => {
    const { world, guards } = worldWithPlayerAt(19, 15);
    const s2 = buildObservation(world, guards).facilities.find((f) => f.id === "S2")!;
    expect(s2.queueLength).toBe(5);
    expect(s2.queue).toContain("携带大件行李");
    expect(s2.serviceRange).toEqual([5, 8]);
    expect(JSON.stringify(s2)).not.toMatch(/serviceTime/);
  });

  test("lane efficiency scales the advertised range", () => {
    const { world, guards } = worldWithPlayerAt(19, 22);
    const s3 = buildObservation(world, guards).facilities.find((f) => f.id === "S3")!;
    expect(s3.serviceRange).toEqual([7, 11.2]);
    expect(s3.efficiency).toMatch(/较慢/);
  });

  test("guards are reported only when visible", () => {
    const hall = worldWithPlayerAt(10, 15);
    expect(buildObservation(hall.world, hall.guards).guards).toHaveLength(0);
    const conc = worldWithPlayerAt(42, 10);
    expect(buildObservation(conc.world, conc.guards).guards.map((g) => g.id)).toContain("guard-A");
  });

  test("summary is a single line", () => {
    const { world, guards } = worldWithPlayerAt(19, 15);
    expect(summarizeObservation(buildObservation(world, guards))).not.toContain("\n");
  });
});

test("seeing a machine does not reveal passengers outside sight", () => {
  const { world, guards } = worldWithPlayerAt(10, 10);
  const hidden = world.addPerson("luggage", { x: 1, y: 29 });
  world.facility("TVM-2")!.queue.push(hidden.id);
  const view = buildObservation(world, guards).facilities.find((f) => f.id === "TVM-2")!;
  expect(view.queue).not.toContain("携带大件行李");
  expect(view.queueLength).toBe(4);
  expect(view.people?.some((p) => p.id === hidden.id)).toBe(false);
});

test("visible queue members are individually addressable without revealing private temperament", () => {
  const { world, guards } = worldWithPlayerAt(19, 15);
  const view = buildObservation(world, guards).facilities.find((f) => f.id === "S2")!;
  expect(view.people?.length).toBe(5);
  expect(view.people?.[0].id).toBe(world.facility("S2")!.queue[0]);
  expect(JSON.stringify(view)).not.toMatch(/irritable|temperament/);
});
