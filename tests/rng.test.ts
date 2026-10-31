import { describe, expect, test } from "vitest";
import { Rng } from "../src/sim/rng";

const draw = (rng: Rng, count = 8) => Array.from({ length: count }, () => rng.next());

describe("Rng fork", () => {
  test("uses the standard FNV-1a hash for label derivation", () => {
    expect(draw(new Rng(7).fork("hello"))).toEqual(draw(new Rng(7 ^ 0x4f9f2cab)));
  });
  test("preserves the established mulberry32 sequence", () => {
    expect(draw(new Rng(1), 3)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  test("fork creation and child draws do not consume the parent stream", () => {
    const parent = new Rng(21);
    const control = new Rng(21);
    expect(parent.next()).toBe(control.next());
    draw(parent.fork("persona"), 100);
    draw(parent.fork("contest"), 100);
    expect(draw(parent)).toEqual(draw(control));
  });

  test("same seed and label reproduce a child independently of parent progress", () => {
    const parent = new Rng(21);
    const expected = draw(parent.fork("contest"));
    draw(parent, 100);
    expect(draw(parent.fork("contest"))).toEqual(expected);
    expect(draw(new Rng(21).fork("contest"))).toEqual(expected);
  });

  test("different subsystem and entity labels produce distinct deterministic streams", () => {
    const parent = new Rng(21);
    const streams = ["persona:p1", "persona:p2", "contest", "reaction", "items", "人物"].map((label) => draw(parent.fork(label)));
    expect(new Set(streams.map((stream) => JSON.stringify(stream))).size).toBe(streams.length);
    expect(draw(new Rng(22).fork("contest"))).not.toEqual(streams[2]);
  });

  test("a retained child advances, while re-forking restarts it", () => {
    const parent = new Rng(1);
    const child = parent.fork("contest");
    const [first, second] = draw(child, 2);
    expect(first).not.toBe(second);
    expect(parent.fork("contest").next()).toBe(first);
  });

  test("seed normalization and nested forks remain deterministic", () => {
    expect(draw(new Rng(-1).fork("items"))).toEqual(draw(new Rng(0xffffffff).fork("items")));
    expect(draw(new Rng(1).fork("npc").fork("reaction"))).toEqual(draw(new Rng(1).fork("npc").fork("reaction")));
  });
});
