import { expect, test } from "vitest";
import { World } from "../src/sim/world";
import { Engine } from "../src/sim/engine";
import { buildScenario } from "../src/sim/scenario";

test.each(["TVM-1", "S1", "G2"])("%s stops unfinished service for both passengers and player on failure/closure", (id) => {
  for (const status of ["broken", "closed"] as const) for (const isPlayer of [true, false]) {
    const w = new World(1); const f = w.facility(id)!;
    const p = w.addPerson(isPlayer ? "player" : "normal", f.def.head, { isPlayer, hasTicket: f.def.kind !== "tvm" });
    p.screened = f.def.kind === "gate";
    const before = { hasTicket: p.hasTicket, screened: p.screened, passedGate: p.passedGate, pos: { ...p.pos } };
    f.queue.push(p.id); p.activity = { kind: "queued", facility: id }; w.stepPeopleAndFacilities();
    expect(p.activity.kind).toBe("service"); f.serving!.remaining = 0.05;
    w.setStatus(id, status, "设备不可用");
    expect(p.activity.kind).toBe("idle"); expect(f.serving).toBeNull();
    for (let i = 0; i < 100; i++) w.stepPeopleAndFacilities();
    expect({ hasTicket: p.hasTicket, screened: p.screened, passedGate: p.passedGate, pos: p.pos }).toEqual(before);
    expect(w.gatePassed).toBe(0);
    if (isPlayer) {
      expect(w.playerTriggers.some((t) => t.kind === "service_rejected" && t.text.includes("中断"))).toBe(true);
      expect(w.playerTriggers.some((t) => t.kind === "service_done")).toBe(false);
    }
  }
});

test.each(buildScenario(1).events.filter((e) => e.type === "status"))("scripted $facility shutdown takes priority over service completing on the same tick", ({ facility: id, t }) => {
  const e = new Engine(1); const f = e.world.facility(id)!; const p = e.player;
  e.world.t = t - 0.1; e.takeTriggers();
  p.pos = { ...f.def.head }; if (id === "S1") e.world.items.spawn("ticket", { type: "held", personId: p.id, slot: "pocket" }, p.id); p.screened = false;
  p.activity = { kind: "service", facility: id }; f.serving = { personId: p.id, remaining: 0.1, recheck: false };
  e.step();
  expect(f.status).not.toBe("open"); expect(f.serving).toBeNull();
  expect(p.hasTicket).toBe(id === "S1"); expect(p.screened).toBe(false);
  expect(e.takeTriggers().some((trigger) => trigger.kind === "service_rejected")).toBe(true);
});

test("reopening requires fresh service and does not revoke a ticket earned before a later breakdown", () => {
  const w = new World(1); const f = w.facility("TVM-1")!;
  const p = w.addPerson("player", f.def.head, { isPlayer: true });
  f.queue.push(p.id); p.activity = { kind: "queued", facility: f.def.id }; w.stepPeopleAndFacilities();
  f.serving!.remaining = 0.05; w.setStatus(f.def.id, "broken", "故障");
  w.setStatus(f.def.id, "open", null); expect(w.joinQueue(p, f.def.id)).toBeNull();
  for (let i = 0; i < 20 && f.serving?.personId !== p.id; i++) w.stepPeopleAndFacilities();
  expect(f.serving?.remaining).toBe(p.serviceTime.tvm);
  expect(p.hasTicket).toBe(false);
  for (let i = 0; i < 200 && !p.hasTicket; i++) w.stepPeopleAndFacilities();
  expect(p.hasTicket).toBe(true);
  w.setStatus(f.def.id, "broken", "再次故障"); expect(p.hasTicket).toBe(true);
});
