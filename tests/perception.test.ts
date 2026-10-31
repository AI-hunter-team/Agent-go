import { describe, expect, test } from "vitest";
import { EventBus } from "../src/sim/events";
import { PerceptionSystem, type Observer } from "../src/sim/perception";

function setup(pos = { x: 30, y: 15 }, facing = 0) {
  const bus = new EventBus();
  const actor = { pos: { x: 33, y: 15 } };
  const system = new PerceptionSystem(bus, (id) => id === "actor" ? actor : undefined);
  const observer: Observer = { id: "npc", role: "npc", pos, facing };
  const event = bus.emit({ t: 0, kind: "push", severity: "affecting", actorId: "actor", targetId: "victim", pos: actor.pos, loudness: 0 });
  bus.beginAct({ actorId: "actor", kind: event.kind, severity: event.severity, eventId: event.id });
  return { bus, system, actor, observer, event };
}

describe("event bus and perception", () => {
  test("monotonic ids, causal links and frame drain retain history", () => {
    const { bus, event } = setup();
    const next = bus.emit({ ...event, causeId: event.id });
    expect(next.id).not.toBe(event.id);
    expect(next.causeId).toBe(event.id);
    expect(bus.drainFrame()).toHaveLength(2);
    expect(bus.drainFrame()).toHaveLength(0);
    expect(bus.get(event.id)).toEqual(event);
    expect(bus.events).toHaveLength(2);
    expect(() => bus.beginAct({ actorId: "other", kind: event.kind, severity: event.severity, eventId: event.id })).toThrow();
  });
  test("seeing an ongoing act identifies the actor even after its first frame", () => {
    const { system, observer, bus, event } = setup();
    expect(system.step([observer])[0]).toMatchObject({ eventId: event.id, attributedTo: "actor", channel: "sight", role: "witness" });
    expect(system.step([observer])).toHaveLength(1);
    bus.endAct("actor");
    expect(system.step([observer])).toHaveLength(0);
  });
  test("pillars and the sight cone block attribution", () => {
    const a = setup({ x: 33, y: 12 }); a.actor.pos = { x: 38, y: 12 };
    expect(a.system.step([a.observer])).toHaveLength(0);
    const b = setup(); b.observer.facing = Math.PI;
    expect(b.system.step([b.observer])).toHaveLength(0);
  });
  test("hearing alone locates the event without identifying the actor", () => {
    const { system, observer, bus, event } = setup();
    bus.endAct("actor"); observer.facing = Math.PI;
    bus.emit({ ...event, loudness: 8 });
    expect(system.step([observer])[0]).toMatchObject({ channel: "hearing", attributedTo: null, role: "bystander" });
  });
  test("a wall halves hearing range and seeing only the result does not identify its actor", () => {
    const { bus, system, observer, event } = setup({ x: 33, y: 12 });
    bus.endAct("actor");
    bus.drainFrame();
    bus.emit({ ...event, pos: { x: 39, y: 12 }, loudness: 10 });
    expect(system.step([observer])).toHaveLength(0);
    bus.emit({ ...event, pos: { x: 37, y: 12 }, loudness: 10 });
    expect(system.step([observer])[0]).toMatchObject({ channel: "hearing", attributedTo: null });
    const b = setup(); b.bus.endAct("actor");
    expect(b.system.step([b.observer])[0]).toMatchObject({ channel: "sight", attributedTo: null });
  });
  test("incapacitated observers perceive nothing; victim role is explicit", () => {
    const { system, observer } = setup();
    expect(system.step([{ ...observer, incapacitated: 20 }])).toHaveLength(0);
    expect(system.step([{ ...observer, id: "victim" }])[0].role).toBe("victim");
  });
  test("reports identify a described subject only when actually delivered to a guard", () => {
    const { system, observer, bus, event } = setup();
    bus.endAct("actor"); bus.drainFrame();
    bus.emit({ ...event, kind: "report", aboutId: "subject", pos: { x: 32, y: 15 }, targetId: "guard", loudness: 8 });
    const guard: Observer = { ...observer, id: "guard", role: "guard", facing: Math.PI };
    expect(system.step([guard])[0]).toMatchObject({ channel: "report", attributedTo: "subject" });
    bus.emit({ ...event, kind: "report", aboutId: "subject", pos: { x: 33, y: 12 }, loudness: 20 });
    const throughWall: Observer = { ...guard, pos: { x: 39, y: 12 } };
    expect(system.step([throughWall])[0]).toMatchObject({ channel: "hearing", attributedTo: null });
  });
});
