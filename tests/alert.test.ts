import { describe, expect, test } from "vitest";
import { AlertSystem } from "../src/sim/alert";
import { EventBus } from "../src/sim/events";
import type { Percept, Severity } from "../src/shared/types";

function setup() {
  const bus = new EventBus(); let t = 0;
  const alerts = new AlertSystem(bus, (id) => id.startsWith("guard") ? "guard" : "npc", () => t);
  const fact = (severity: Severity, observerId = "npc", role: Percept["role"] = "witness", channel: Percept["channel"] = "sight") => {
    const event = bus.emit({ t, kind: "odd_behaviour", severity, actorId: "player", pos: { x: 3, y: 3 }, loudness: 0 });
    return { observerId, eventId: event.id, attributedTo: "player", channel, role, pos: event.pos, t } satisfies Percept;
  };
  const step = (seconds: number, visible: boolean, percepts: Percept[] = [], frozen = false) => { t += seconds; return alerts.step(percepts, () => visible, seconds, () => frozen); };
  return { alerts, fact, step };
}

describe("directed alerts", () => {
  test("white grows to yellow then red with resets; red never expires", () => {
    const { alerts, fact, step } = setup();
    step(0, true, [fact("odd")]);
    expect(alerts.get("npc", "player")).toMatchObject({ level: "white", ring: 0 });
    step(5.9, true); expect(alerts.get("npc", "player")!.ring).toBeCloseTo(5.9 / 6);
    step(0.1, true); expect(alerts.get("npc", "player")).toMatchObject({ level: "yellow", ring: 0 });
    step(8, true); expect(alerts.get("npc", "player")!.level).toBe("red");
    step(100, false); expect(alerts.get("npc", "player")!.level).toBe("red");
  });
  test("occlusion pauses the ring, short hiding preserves it, continuous hiding clears it", () => {
    const { alerts, fact, step } = setup();
    step(0, true, [fact("odd")]); step(2, true); step(2, false);
    expect(alerts.get("npc", "player")!.ring).toBeCloseTo(1 / 3);
    step(1, true); expect(alerts.get("npc", "player")!.hiddenFor).toBe(0);
    step(3, false); expect(alerts.get("npc", "player")).toBeUndefined();
  });
  test("severe events only raise state; victims and witnesses differ", () => {
    const { alerts, fact, step } = setup();
    step(0, true, [fact("danger", "victim", "victim"), fact("danger")]);
    expect(alerts.get("victim", "player")!.level).toBe("red");
    expect(alerts.get("npc", "player")!.level).toBe("yellow");
    step(0, true, [fact("odd")]); expect(alerts.get("npc", "player")!.level).toBe("yellow");
    step(12, false); expect(alerts.get("npc", "player")).toBeUndefined();
  });
  test("guards see violations as red; threats and force cutting only become yellow", () => {
    const { alerts, fact, step } = setup();
    step(0, true, [fact("affecting", "guard1"), fact("danger", "guard2")]);
    expect(alerts.get("guard1", "player")!.level).toBe("yellow");
    expect(alerts.get("guard2", "player")!.level).toBe("yellow");
    expect(step(5, true).guardRed).toMatchObject({ subjectId: "player" });
    expect(step(0, true, [fact("violation", "guard3")]).guardRed).not.toBeNull();
  });
  test("reports reach yellow only and fresh facts delay guard clearance", () => {
    const { alerts, fact, step } = setup();
    step(0, false, [fact("violation", "guard1", "bystander", "report")]);
    expect(alerts.get("guard1", "player")!.level).toBe("yellow");
    step(10, false); step(0, false, [fact("danger", "guard1", "bystander", "report")]);
    step(5, false); expect(alerts.get("guard1", "player")).toBeDefined();
    step(10, false); expect(alerts.get("guard1", "player")).toBeUndefined();
  });
  test("ongoing repeated percepts are not fresh facts; incapacitation freezes timers", () => {
    const { alerts, fact, step } = setup();
    const percept = fact("suspicious", "guard1");
    step(0, true, [percept]); step(2, true);
    step(20, false, [], true); expect(alerts.get("guard1", "player")!.ring).toBeCloseTo(0.4);
    step(15, false, [percept]); expect(alerts.get("guard1", "player")).toBeUndefined();
  });
  test("hearing alone and unassigned actors never create alerts", () => {
    const { alerts, fact, step } = setup();
    step(0, true, [fact("violation", "guard1", "bystander", "hearing"), { ...fact("violation"), attributedTo: null }]);
    expect(alerts.records.size).toBe(0);
  });
});
