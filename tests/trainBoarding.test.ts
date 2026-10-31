import { describe, expect, test } from "vitest";
import { NpcDirector } from "../src/sim/npc";
import { buildScenario } from "../src/sim/scenario";
import { World } from "../src/sim/world";

function tick(world: World, director: NpcDirector, count: number) {
  for (let i = 0; i < count; i++) {
    world.t = Math.round((world.t + 0.1) * 10) / 10;
    director.step();
    world.stepPeopleAndFacilities();
  }
}

describe("NPC train boarding", () => {
  test("a walking NPC boards on entering its assigned door threshold before the exact waypoint", () => {
    const world = new World(1);
    const director = new NpcDirector(world, buildScenario(1, { extraQueuePeople: 0 }), false);
    const passenger = world.addPerson("normal", { x: 74, y: 7.4 }, { hasTicket: true });
    passenger.screened = passenger.passedGate = passenger.onPlatform = true;
    passenger.boardingDoor = 0;
    passenger.activity = { kind: "walking", path: [{ x: 74.5, y: 7 }], label: "列车车门" };

    director.step();

    expect(world.persons.has(passenger.id)).toBe(false);
  });

  test("NPCs leave the platform after reaching a train door", () => {
    const world = new World(1);
    const director = new NpcDirector(world, buildScenario(1, { extraQueuePeople: 0 }), false);
    const passenger = world.addPerson("normal", { x: 73, y: 9 }, { hasTicket: true });
    passenger.screened = true;
    passenger.passedGate = true;
    passenger.onPlatform = true;

    tick(world, director, 160);

    expect(world.persons.has(passenger.id)).toBe(false);
  });

  test("multiple NPCs use separate doors instead of stacking at one point", () => {
    const world = new World(2);
    const director = new NpcDirector(world, buildScenario(2, { extraQueuePeople: 0 }), false);
    const passengers = Array.from({ length: 5 }, (_, i) => {
      const passenger = world.addPerson("normal", { x: 73, y: 9 + i * 0.1 }, { hasTicket: true });
      passenger.screened = true;
      passenger.passedGate = true;
      passenger.onPlatform = true;
      return passenger;
    });

    tick(world, director, 260);

    expect(new Set(passengers.map((passenger) => passenger.boardingDoor)).size).toBeGreaterThan(1);
    expect(passengers.filter((passenger) => world.persons.has(passenger.id))).toHaveLength(0);
  });
});
