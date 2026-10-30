import { expect, test } from "vitest";
import { World } from "../src/sim/world";
import { GuardSystem } from "../src/sim/guards";
import { CreativeSystem } from "../src/sim/creative";
import { queueSlot } from "../src/sim/layout";
import { prepareCutIn } from "../src/sim/negotiation";

function setup() {
  const w = new World(1);
  const f = w.facility("S2")!;
  f.serving = { personId: "busy", remaining: 1000, recheck: false };
  const people = Array.from({ length: 4 }, (_, i) => {
    const p = w.addPerson("normal", queueSlot(f.def, i), { irritable: true });
    p.activity = { kind: "queued", facility: "S2" };
    f.queue.push(p.id);
    return p;
  });
  const p = w.addPerson("player", queueSlot(f.def, 4), { isPlayer: true });
  p.activity = { kind: "queued", facility: "S2" }; f.queue.push(p.id);
  const c = new CreativeSystem(w, new GuardSystem());
  const step = () => { for (let i = 0; i < 16; i++) { w.stepPeopleAndFacilities(); c.step(p); } };
  return { w, f, p, people, c, step };
}

test("negotiation identifies a nearby NPC and retains utterance and private personality", () => {
  const { w, people } = setup();
  const r = prepareCutIn(w, people[2].id, "我赶火车，可以让我先过吗？", []);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.request.npc).toMatchObject({ id: people[2].id, queuePosition: 3, queueLength: 5 });
  expect(r.request.npc.temperament).toBeTruthy();
  expect(r.request.message).toBe("我赶火车，可以让我先过吗？");
});

test("out-of-reach, behind, empty utterance and fourth round are rejected without moving", () => {
  const { w, f, p, people } = setup();
  const before = structuredClone({ pos: p.pos, activity: p.activity, queue: f.queue });
  expect(prepareCutIn(w, people[0].id, "可以吗", []).ok).toBe(false);
  expect(prepareCutIn(w, people[2].id, " ", []).ok).toBe(false);
  expect(prepareCutIn(w, people[2].id, "x".repeat(201), []).ok).toBe(false);
  expect(prepareCutIn(w, people[2].id, "可以吗", Array(3).fill({ message: "a", reply: "b", accepted: false })).ok).toBe(false);
  expect({ pos: p.pos, activity: p.activity, queue: f.queue }).toEqual(before);
  f.queue = [p.id, ...people.map((n) => n.id)];
  expect(prepareCutIn(w, people[3].id, "可以吗", []).ok).toBe(false);
});

test("consent inserts immediately before that NPC, without violation or complaint", () => {
  const { w, f, p, people, c, step } = setup();
  expect(c.startConsentedCutIn(p, people[2].id).ok).toBe(true);
  step();
  expect(f.queue).toEqual([people[0].id, people[1].id, p.id, people[2].id, people[3].id]);
  expect(c.violations).toHaveLength(0);
  expect(w.playerTriggers.some((t) => t.kind === "complaint")).toBe(false);
});

test("consent expires if its NPC leaves during movement", () => {
  const { f, p, people, c, step } = setup();
  c.startConsentedCutIn(p, people[2].id);
  f.queue = f.queue.filter((id) => id !== people[2].id);
  step();
  expect(f.queue).not.toContain(p.id);
  expect(p.activity.kind).toBe("idle");
});

test("legacy creative cut cannot bypass communication", () => {
  const { p, c, f } = setup(); const before = [...f.queue];
  expect(c.start(p, "cut_in_line", "挤进去")).toMatchObject({ ok: false });
  expect(f.queue).toEqual(before);
  expect(c.violations).toHaveLength(0);
});
