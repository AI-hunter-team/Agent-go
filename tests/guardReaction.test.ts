import { describe, expect, test } from "vitest";
import { GuardSystem } from "../src/sim/guards";
import { createFixtureEngine } from "./fixtures/scenarios";

const def = { id: "guard", label: "测试保安", route: [{ x: 30, y: 15 }], facing: 0, speed: 1, pauseSeconds: 0 };
const tick = (system: GuardSystem, seconds: number) => { for (let i = 0; i < seconds * 10; i++) system.step(); };

describe("guard reactions and alert integration", () => {
  test("investigates a reachable point, searches, and returns to the patrol route", () => {
    const guards = new GuardSystem([def]); const g = guards.guards[0];
    guards.investigate(g, { x: 33, y: 15 }, 1);
    tick(guards, 3); expect(g.pos.x).toBeGreaterThan(32.5);
    tick(guards, 9); expect(g.mode).toBe("patrol"); expect(Math.abs(g.pos.x - 30)).toBeLessThan(0.2);
  });
  test("a report overrides a noise, while a later noise cannot replace the report", () => {
    const guards = new GuardSystem([def]); const g = guards.guards[0];
    guards.investigate(g, { x: 31, y: 15 }, 1);
    guards.investigate(g, { x: 33, y: 15 }, 3);
    guards.investigate(g, { x: 32, y: 15 }, 1);
    expect(g.investigation).toMatchObject({ priority: 3, point: { x: 33, y: 15 } });
  });
  test("knockout blocks perception and action for twenty seconds, then triggers investigation", () => {
    const guards = new GuardSystem([def]); const g = guards.guards[0];
    guards.knockOut(g.def.id, 20);
    expect(guards.canSee(g, { x: 32, y: 15 })).toBe(false);
    expect(guards.attract({ x: 31, y: 15 })).toHaveLength(0);
    tick(guards, 19.9); expect(g.incapacitated).toBeGreaterThan(0);
    tick(guards, 0.1); expect(g.incapacitated).toBe(0); expect(g.mode).toBe("investigate");
  });
  test("an attack seen at its start becomes guard red before a later knockout can erase it", () => {
    const engine = createFixtureEngine(undefined, [def]);
    engine.player.pos = { x: 33, y: 15 };
    const event = engine.events.emit({ t: 0, kind: "strike", severity: "violation", actorId: "player", targetId: "guard", pos: engine.player.pos, loudness: 0 });
    engine.events.beginAct({ actorId: "player", kind: event.kind, severity: event.severity, eventId: event.id });
    engine.resolveInteractions(0);
    expect(engine.alerts.get("guard", "player")!.level).toBe("red");
    engine.guards.knockOut("guard", 20);
    engine.step(); expect(engine.status).toBe("failed");
  });
  test("reports supply a known location, not the subject's hidden live position", () => {
    const engine = createFixtureEngine(undefined, [def]);
    engine.player.pos = { x: 50, y: 25 };
    engine.events.emit({ t: 0, kind: "report", severity: "violation", actorId: "reporter", aboutId: "player", aboutPos: { x: 33, y: 15 }, targetId: "guard", pos: { x: 31, y: 15 }, loudness: 8 });
    engine.step();
    expect(engine.status).toBe("running");
    expect(engine.alerts.get("guard", "player")!.level).toBe("yellow");
    expect(engine.guards.guards[0].investigation!.point).toEqual({ x: 33, y: 15 });
    engine.player.pos = { x: 65, y: 27 };
    engine.step(); expect(engine.guards.guards[0].investigation!.point).toEqual({ x: 33, y: 15 });
  });
});
