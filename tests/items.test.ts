import { describe, expect, test } from "vitest";
import { World } from "../src/sim/world";
import { createFixtureEngine } from "./fixtures/scenarios";

const setup = () => {
  const w = new World(1);
  const p = w.addPerson("player", { x: 7, y: 3 }, { isPlayer: true });
  const other = w.addPerson("normal", { x: 8, y: 3 });
  return { w, p, other, items: w.items };
};

describe("item possession", () => {
  test("initial loadout has coins and backpack; hands, pocket and capacity are validated", () => {
    const { p, items, other } = setup();
    expect(items.holdings(p.id).map((i) => i.kind)).toEqual(["backpack", "coins"]);
    const a = items.spawn("umbrella", { type: "held", personId: p.id, slot: "hand" }, p.id);
    items.spawn("snack", { type: "held", personId: p.id, slot: "hand" }, p.id);
    expect(() => items.spawn("newspaper", { type: "held", personId: p.id, slot: "hand" }, null)).toThrow("双手");
    expect(items.move(a.id, { type: "held", personId: p.id, slot: "pocket" }).ok).toBe(false);
    expect(items.move(a.id, { type: "held", personId: other.id, slot: "bag" }).ok).toBe(false);
    for (let i = 0; i < 4; i++) items.spawn("water_bottle", { type: "held", personId: p.id, slot: "bag" }, p.id);
    expect(items.move(a.id, { type: "held", personId: p.id, slot: "bag" }).ok).toBe(false);
    expect(items.bagUsed(p.id)).toBe(4);
  });

  test("dropping and picking up a bag keeps its contents, ownership and capacity", () => {
    const { p, other, items } = setup();
    const ticket = items.spawn("ticket", { type: "held", personId: p.id, slot: "bag" }, p.id);
    const bag = items.bag(p.id)!;
    expect(items.move(bag.id, { type: "ground", pos: p.pos }, "drop").ok).toBe(true);
    expect(ticket.location).toEqual({ type: "container", containerId: bag.id });
    expect(items.hasValidTicket(p.id)).toBe(false);
    expect(items.move(bag.id, { type: "held", personId: other.id, slot: "bag" }, "take").ok).toBe(true);
    expect(items.hasValidTicket(other.id)).toBe(true);
    expect(ticket.ownerId).toBe(p.id);
    expect(items.move(bag.id, { type: "container", containerId: bag.id }).ok).toBe(false);
  });

  test("tickets transfer possession without duplicating legal ownership and are single-use", () => {
    const { w, p, other, items } = setup();
    const ticket = items.spawn("ticket", { type: "held", personId: other.id, slot: "pocket" }, other.id);
    expect(other.hasTicket).toBe(true);
    w.t = 2;
    expect(items.move(ticket.id, { type: "held", personId: p.id, slot: "pocket" }, "snatch").ok).toBe(true);
    expect(other.hasTicket).toBe(false);
    expect(p.hasTicket).toBe(true);
    expect(ticket.ownerId).toBe(other.id);
    expect(items.transfers.at(-1)).toMatchObject({ t: 2, how: "snatch", itemId: ticket.id });
    expect(items.useTicket(p.id)).toBe(true);
    expect(items.useTicket(p.id)).toBe(false);
    expect(p.hasTicket).toBe(false);
  });

  test("visible items respect range, walls and containers", () => {
    const { items, p } = setup();
    const near = items.spawn("snack", { type: "ground", pos: { x: 23, y: 10 } }, null);
    const behind = items.spawn("snack", { type: "ground", pos: { x: 29, y: 10 } }, null);
    const hidden = items.spawn("ticket", { type: "container", containerId: items.bag(p.id)!.id }, p.id);
    const visible = items.visibleItems({ x: 23, y: 10 }).map((i) => i.id);
    expect(visible).toContain(near.id);
    expect(visible).not.toContain(behind.id);
    expect(visible).not.toContain(hidden.id);
    expect(items.visibleItems({ x: 68, y: 28 })).toHaveLength(0);
  });

  test("a ticket removed during gate service is revalidated before crossing", () => {
    const engine = createFixtureEngine();
    const { world: w, player: p } = engine;
    p.pos = { ...w.facility("G3")!.def.head };
    const ticket = w.items.spawn("ticket", { type: "held", personId: p.id, slot: "pocket" }, p.id);
    p.screened = true;
    p.activity = { kind: "queued", facility: "G3" };
    w.facility("G3")!.queue.push(p.id);
    engine.step();
    expect(p.activity.kind).toBe("service");
    w.items.move(ticket.id, { type: "ground", pos: { ...p.pos } });
    for (let i = 0; i < 40; i++) engine.step();
    expect(p.passedGate).toBe(false);
    expect(p.pos.x).toBeLessThan(44);
    expect(w.playerTriggers.length + engine.takeTriggers().filter((t) => t.kind === "service_rejected").length).toBeGreaterThan(0);
  });
});
