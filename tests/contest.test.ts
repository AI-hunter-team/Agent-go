import { describe, expect, test } from "vitest";
import { contest, contestProbability, type ContestInput } from "../src/sim/actions/contest";
import { Rng } from "../src/sim/rng";
const input: ContestInput = {
  op: "snatch",
  impact: 0,
  targetFacing: true,
  courage: .5,
  red: false,
  guard: false
};
describe("physical contests", () => {
  test("probability formula respects facing, tools, courage, red and guards and clamps", () => {
    expect(contestProbability(input)).toBeCloseTo(.425);
    expect(contestProbability({
      ...input,
      op: "push",
      impact: 1,
      targetFacing: false,
      courage: 0
    })).toBe(.95);
    expect(contestProbability({
      ...input,
      op: "knockout",
      courage: 1,
      red: true,
      guard: true
    })).toBe(.6);
    expect(contestProbability({
      ...input,
      guard: true
    })).toBeCloseTo(.275);
  });
  test.each(["hurt", "knockout"] as const)("%s keeps at least 60 percent hit probability for every role and defense combination", op => {
    for (const guard of [false,true]) for (const targetFacing of [false,true]) for (const courage of [0,.5,1]) for (const red of [false,true]) {
      const probability = contestProbability({...input,op,guard,targetFacing,courage,red});
      expect(probability).toBeGreaterThanOrEqual(.6);
      expect(probability).toBeLessThanOrEqual(.95);
    }
    expect(contestProbability({...input,op,surprised:true})).toBe(.95);
    expect(contestProbability({...input,op,helpless:true})).toBe(1);
  });
  test("retained child stream is deterministic, advances, and does not consume parent", () => {
    const parent = new Rng(32),
      a = parent.fork("contest"),
      b = new Rng(32).fork("contest");
    const results = Array.from({
      length: 40
    }, () => contest(a, input));
    expect(results).toEqual(Array.from({
      length: 40
    }, () => contest(b, input)));
    expect(new Set(results).size).toBe(2);
    expect(parent.next()).toBe(new Rng(32).next());
    const saved = new Rng(8),
      untouched = new Rng(8);
    expect(contest(saved, {
      ...input,
      interrupted: true
    })).toBe("interrupted");
    expect(saved.next()).toBe(untouched.next());
  });
});
