import { describe, expect, test } from "vitest";
import { generatePersona } from "../src/sim/persona";
import { Rng } from "../src/sim/rng";
import { World } from "../src/sim/world";

describe("seeded NPC personas", () => {
  test("default generation produces substantial low and high trait populations", () => {
    const people = Array.from({ length: 350 }, (_, i) => generatePersona(new Rng(i + 1), "normal"));
    for (const key of ["courage", "vanity", "temper", "fairness", "meddling"] as const) {
      expect(people.filter(p => p.traits[key] < .25).length, `${key} low`).toBeGreaterThan(25);
      expect(people.filter(p => p.traits[key] > .75).length, `${key} high`).toBeGreaterThan(25);
    }
  });
  test("same seed reproduces a sequence of distinct people without consuming the parent", () => {
    const a = new Rng(9), b = new Rng(9);
    const child = a.fork("persona"), copy = b.fork("persona");
    const people = Array.from({ length: 50 }, () => generatePersona(child, "normal"));
    expect(people).toEqual(Array.from({ length: 50 }, () => generatePersona(copy, "normal")));
    expect(new Set(people.map((p) => JSON.stringify(p))).size).toBe(50);
    expect(a.next()).toBe(b.next());
  });
  test("traits stay within bounds, and kind changes the relevant situations", () => {
    let normal = 0, hurried = 0;
    for (let i = 0; i < 200; i++) {
      const a = generatePersona(new Rng(i), "normal"), b = generatePersona(new Rng(i), "hurried");
      normal += a.situation.hurry; hurried += b.situation.hurry;
      for (const n of Object.values(a.traits)) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1); }
      expect(b.look.manner).toContain("很快");
      expect(generatePersona(new Rng(i), "luggage").situation.luggage).toBe(true);
    }
    expect(hurried / 200).toBeGreaterThan(normal / 200 + 0.2);
    expect(generatePersona(new Rng(1), "elderly").look.manner).toContain("缓慢");
  });
  test("World derives irritability from traits, with legacy fixtures preserving their explicit choice", () => {
    const world = new World(9);
    for (const irritable of [true, false]) {
      const p = world.addPerson("normal", { x: 3, y: 3 }, { irritable });
      expect(p.irritable).toBe(irritable);
      expect(p.irritable).toBe(p.persona!.traits.temper > 0.6);
    }
    expect(world.addPerson("player", { x: 2, y: 15 }, { isPlayer: true }).persona).toBeUndefined();
  });
});
