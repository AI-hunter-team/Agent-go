import { expect, test } from "vitest";
import { World } from "../src/sim/world";
import { clearOfScenery, personRadius, steer, sweptDistance } from "../src/sim/movement";
import { DT } from "../src/sim/scenario";

function walkThrough(world: World, ticks = 300) {
  let lateral = 0;
  for (let i = 0; i < ticks; i++) {
    const starts = new Map([...world.persons.values()].map((p) => [p.id, { ...p.pos }]));
    world.t += DT; world.stepPeopleAndFacilities();
    const people = [...world.persons.values()];
    for (let a = 0; a < people.length; a++) {
      lateral = Math.max(lateral, Math.abs(people[a].pos.y - 15));
      for (let b = a + 1; b < people.length; b++) {
        const p = people[a], q = people[b];
        expect(sweptDistance(starts.get(p.id)!, p.pos, starts.get(q.id)!, q.pos), `${p.id}/${q.id}, tick ${i}`).toBeGreaterThanOrEqual(personRadius(p.kind) + personRadius(q.kind) + 0.02 - 1e-6);
      }
    }
  }
  return lateral;
}

test("a walker goes around a stationary NPC without crossing its model between ticks", () => {
  const w = new World(1);
  w.addPerson("luggage", { x: 10, y: 15 });
  const p = w.addPerson("normal", { x: 7, y: 15 });
  expect(w.walkTo(p, { x: 13, y: 15 }, "test")).toBeNull();
  expect(walkThrough(w)).toBeGreaterThan(0.8);
  expect(p.pos).toEqual({ x: 13, y: 15 });
  expect(p.activity.kind).toBe("idle");
});

test("oncoming NPCs yield on consistent sides and both reach their destination", () => {
  const w = new World(2);
  const a = w.addPerson("normal", { x: 8, y: 15 });
  const b = w.addPerson("luggage", { x: 13, y: 15 });
  w.walkTo(a, { x: 13, y: 15 }, "east"); w.walkTo(b, { x: 8, y: 15 }, "west");
  walkThrough(w);
  expect(a.pos).toEqual({ x: 13, y: 15 }); expect(b.pos).toEqual({ x: 8, y: 15 });
});

test("walking around a ticket machine never sweeps through its solid geometry", () => {
  const w = new World(1);
  const p = w.addPerson("normal", { x: 11, y: 6 });
  w.walkTo(p, { x: 17, y: 6 }, "past TVM-1");
  for (let i = 0; i < 200; i++) {
    const start = { ...p.pos };
    w.stepPeopleAndFacilities();
    expect(clearOfScenery(start, p.pos, personRadius(p.kind))).toBe(true);
  }
  expect(p.pos).toEqual({ x: 17, y: 6 });
});

test("a waiting passenger cannot advance onto the passenger being served", () => {
  const w = new World(1), f = w.facility("TVM-2")!;
  const a = w.addPerson("luggage", { ...f.def.head });
  const b = w.addPerson("luggage", { x: f.def.head.x - 1.05, y: f.def.head.y });
  a.activity = { kind: "service", facility: f.def.id }; f.serving = { personId: a.id, remaining: 100, recheck: false };
  b.activity = { kind: "queued", facility: f.def.id }; f.queue = [b.id];
  for (let i = 0; i < 100; i++) w.stepPeopleAndFacilities();
  expect(b.pos.x).toBeCloseTo(w.queueStandPoint(f, 0).x);
  expect(a.pos).toEqual(f.def.head);
  expect(f.queue).toEqual([b.id]);
});

test("a walker routes around a long queue rather than oscillating between its passengers", () => {
  const w = new World(1), f = w.facility("S3")!;
  f.serving = { personId: "busy", remaining: 1000, recheck: false };
  for (let i = 0; i < 8; i++) {
    const q = w.addPerson("normal", { x: 0, y: 24 });
    f.queue.push(q.id); q.pos = w.queueStandPoint(f, i); q.activity = { kind: "queued", facility: f.def.id };
  }
  const p = w.addPerson("normal", { x: 21, y: 25.2 });
  w.walkTo(p, { x: 21, y: 22.5 }, "across the queue");
  walkThrough(w, 300);
  expect(p.pos).toEqual({ x: 21, y: 22.5 });
});

test("patrolling guards stop before a stationary passenger", async () => {
  const { GuardSystem } = await import("../src/sim/guards");
  const guards = new GuardSystem([{ id: "guard", label: "guard", route: [{ x: 10, y: 14 }, { x: 10, y: 16 }], facing: Math.PI / 2, speed: 1, pauseSeconds: 0 }]);
  for (let i = 0; i < 40; i++) guards.step([{ id: "npc", pos: { x: 10, y: 15 }, radius: 0.32 }]);
  expect(guards.guards[0].pos.y).toBeLessThanOrEqual(14.36);
  guards.step();
  expect(guards.guards[0].pos.y).toBeGreaterThan(14.3);
});

test("live NPCs, spawns, service exits and guards stay separated throughout interpolated ticks", async () => {
  const { Engine } = await import("../src/sim/engine");
  const e = new Engine(9);
  const actors = () => [
    ...[...e.world.persons.values()].map((p) => ({ id: p.id, pos: { ...p.pos }, radius: personRadius(p.kind) })),
    ...e.guards.guards.map((g) => ({ id: g.def.id, pos: { ...g.pos }, radius: personRadius("guard") })),
  ];
  let minGap = Infinity;
  for (let tick = 0; tick < 200; tick++) {
    const old = new Map(actors().map((p) => [p.id, p]));
    e.step(); const people = actors();
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
      const p = people[i], q = people[j], a = old.get(p.id), b = old.get(q.id);
      if (!a || !b) continue;
      minGap = Math.min(minGap, sweptDistance(a.pos, p.pos, b.pos, q.pos) - p.radius - q.radius);
    }
  }
  expect(minGap).toBeGreaterThanOrEqual(0);
});

// A long look-ahead and a short stride meet a moving neighbor at different times.
test("a clear look-ahead cannot bypass the sweep of the actual short stride", () => {
  const from = { x: 2, y: 2 };
  const other = { id: "crossing", from: { x: 2.05, y: 2.04 }, pos: { x: 2.05, y: 1.96 }, radius: 0.005 };
  const next = steer(from, { x: 3, y: 2 }, 0.1, 0.005, [other]);
  expect(sweptDistance(from, next, other.from, other.pos)).toBeGreaterThanOrEqual(0.03 - 1e-6);
});
