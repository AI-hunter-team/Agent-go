import { expect, test } from "vitest";
import { World } from "../src/sim/world";
import { clearOfScenery, detourAroundQueues, personRadius, steer, sweptDistance } from "../src/sim/movement";
import { segmentIntersectsRect } from "../src/sim/geometry";
import { DT } from "../src/sim/scenario";

/** Advance a small crowd while checking separation throughout each interpolated step. */
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

test.each(["normal", "luggage"] as const)("%s passenger reaches S1 from behind its conveyor", (kind) => {
  const w = new World(1), f = w.facility("S1")!;
  const p = w.addPerson(kind, { x: 19, y: 22 });
  expect(w.joinQueue(p, "S1")).toBeNull();
  for (let tick = 0; tick < 600 && p.activity.kind !== "service"; tick++) {
    const start = { ...p.pos };
    w.stepPeopleAndFacilities();
    expect(clearOfScenery(start, p.pos, personRadius(kind))).toBe(true);
  }
  expect(p.activity.kind).toBe("service");
  expect(p.pos).toEqual(f.def.head);
});

test("a waiting passenger cannot advance onto the passenger being served", () => {
  const w = new World(1), f = w.facility("TVM-2")!;
  const a = w.addPerson("luggage", { ...f.def.head });
  const b = w.addPerson("luggage", { x: f.def.head.x, y: f.def.head.y + 1.05 });
  a.activity = { kind: "service", facility: f.def.id }; f.serving = { personId: a.id, remaining: 100, recheck: false };
  b.activity = { kind: "queued", facility: f.def.id }; f.queue = [b.id];
  for (let i = 0; i < 100; i++) w.stepPeopleAndFacilities();
  expect(b.pos.x).toBeCloseTo(w.queueStandPoint(f, 0).x);
  expect(b.pos.y).toBeCloseTo(w.queueStandPoint(f, 0).y);
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

test("a walker safely crosses behind the new vertical ticket queue", () => {
  const w = new World(1), f = w.facility("TVM-2")!;
  for (let i = 0; i < 8; i++) {
    const p = w.addPerson("luggage", { ...f.def.head });
    f.queue.push(p.id); p.pos = w.queueStandPoint(f, i); p.activity = { kind: "queued", facility: f.def.id };
  }
  const p = w.addPerson("normal", { x: 8, y: 9 });
  expect(w.walkTo(p, { x: 12, y: 9 }, "cross the ticket bank")).toBeNull();
  walkThrough(w, 350);
  expect(p.pos).toEqual({ x: 12, y: 9 });
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

// A queue's machine-side corner is inside TVM-3's body clearance: route around both obstacles.
test("a queue detour beside a ticket machine reaches its waypoint without oscillating", () => {
  let pos = { x: 14.4, y: 24.8 };
  const target = { x: 13.475, y: 23.225 };
  const queue = { x: 8, y: 23.33, w: 5.72, h: 1.34 };
  const radius = personRadius("normal");
  for (let tick = 0; tick < 200 && Math.hypot(pos.x - target.x, pos.y - target.y) > 1e-6; tick++) {
    const waypoint = detourAroundQueues(pos, target, [queue], radius);
    const next = steer(pos, waypoint, 0.13, radius, []);
    expect(clearOfScenery(pos, next, radius)).toBe(true);
    expect(segmentIntersectsRect(pos, next, queue)).toBe(false);
    pos = next;
  }
  expect(pos.x).toBeCloseTo(target.x);
  expect(pos.y).toBeCloseTo(target.y);
});

// A passenger almost at an occupied slot should stand still, then advance when it clears.
test("a blocked nearby waypoint waits without sideways jitter and resumes when clear", () => {
  const from = { x: 12.37, y: 24.015 };
  const target = { x: 12.4, y: 24 };
  const neighbor = { id: "queue-head", pos: { x: 13.05, y: 24 }, radius: 0.32 };
  let pos = from;
  for (let tick = 0; tick < 20; tick++) {
    pos = steer(pos, target, 0.08, 0.32, [neighbor]);
    expect(pos).toEqual(from);
  }
  expect(steer(pos, target, 0.08, 0.32, [])).toEqual(target);
});
