import { describe, expect, test } from "vitest";
import { ENTRANCE, queueSlot } from "../src/sim/layout";
import { World, type Person } from "../src/sim/world";

function run(world: World, seconds: number, until?: () => boolean) {
  for (let i = 0; i < seconds * 10; i++) {
    world.t += 0.1;
    world.stepPeopleAndFacilities();
    if (until?.()) return;
  }
}

function playerAt(world: World, x: number, y: number, opts: Partial<Person> = {}) {
  const p = world.addPerson("player", { x, y }, { isPlayer: true });
  Object.assign(p, opts);
  return p;
}

describe("queues and services", () => {
  test("walking into a ticket queue ends with a ticket", () => {
    const w = new World(1);
    const p = playerAt(w, ENTRANCE.x, ENTRANCE.y);
    expect(w.joinQueue(p, "TVM-3")).toBeNull();
    run(w, 60, () => p.hasTicket);
    expect(p.hasTicket).toBe(true);
    const kinds = w.playerTriggers.map((t) => t.kind);
    expect(kinds).toEqual(["joined_queue", "service_done"]);
  });

  test("queue keeps arrival order and serves the head first", () => {
    const w = new World(1);
    const f = w.facility("S2")!;
    const a = w.addPerson("normal", queueSlot(f.def, 0), { hasTicket: true });
    const b = w.addPerson("normal", queueSlot(f.def, 1), { hasTicket: true });
    f.queue.push(a.id, b.id);
    a.activity = { kind: "queued", facility: "S2" };
    b.activity = { kind: "queued", facility: "S2" };
    run(w, 0.2);
    expect(f.serving?.personId).toBe(a.id);
    expect(f.queue).toEqual([b.id]);
    run(w, 30, () => b.screened);
    expect(a.screened).toBe(true);
    expect(b.screened).toBe(true);
    expect(a.pos.x).toBeGreaterThan(26);
  });

  test("leaving a queue loses the place", () => {
    const w = new World(1);
    const f = w.facility("S3")!;
    const other = w.addPerson("normal", queueSlot(f.def, 0));
    f.queue.push(other.id);
    other.activity = { kind: "queued", facility: "S3" };
    f.serving = { personId: "nobody", remaining: 100, recheck: false };
    const p = playerAt(w, 20, 24);
    w.joinQueue(p, "S3");
    run(w, 10, () => p.activity.kind === "queued");
    expect(f.queue).toEqual([other.id, "player"]);
    expect(w.leaveQueue(p)).toBeNull();
    expect(f.queue).toEqual([other.id]);
    expect(w.leaveQueue(p)).toMatch(/不在/);
  });

  test("gate rejects a passenger without a ticket", () => {
    const w = new World(1);
    const p = playerAt(w, 40, 20, { screened: true });
    w.joinQueue(p, "G4");
    run(w, 20, () => w.playerTriggers.some((t) => t.kind === "service_rejected"));
    expect(w.playerTriggers.at(-1)?.kind).toBe("service_rejected");
    expect(p.onPlatform).toBe(false);
  });

  test("gate lets a ticket holder onto the platform", () => {
    const w = new World(1);
    const p = playerAt(w, 40, 20, { screened: true, hasTicket: true });
    w.joinQueue(p, "G4");
    run(w, 20, () => p.onPlatform);
    expect(p.onPlatform).toBe(true);
    expect(p.pos.x).toBeGreaterThan(44);
  });

  test("closing a facility dismisses its queue and tells the player", () => {
    const w = new World(1);
    const f = w.facility("S1")!;
    f.serving = { personId: "nobody", remaining: 100, recheck: false };
    const p = playerAt(w, 22, 6);
    w.joinQueue(p, "S1");
    run(w, 10, () => p.activity.kind === "queued");
    w.setStatus("S1", "closed", "临时停用");
    expect(f.queue).toEqual([]);
    expect(p.activity.kind).toBe("idle");
    expect(w.playerTriggers.at(-1)?.kind).toBe("queue_closed");
  });

  test("arriving at a broken facility fails", () => {
    const w = new World(1);
    w.setStatus("G3", "broken", "故障");
    const p = playerAt(w, 40, 15, { screened: true, hasTicket: true });
    w.joinQueue(p, "G3");
    run(w, 10, () => p.activity.kind === "idle");
    expect(w.playerTriggers.at(-1)?.kind).toBe("action_failed");
  });

  test("cannot walk across the security line", () => {
    const w = new World(1);
    const p = playerAt(w, 10, 15);
    expect(w.joinQueue(p, "G1")).toMatch(/无法步行/);
  });
});
