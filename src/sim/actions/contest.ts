import type { Rng } from "../rng";
export interface ContestInput {
  op: "push" | "snatch" | "knockout" | "hurt";
  impact: number;
  targetFacing: boolean;
  courage: number;
  red: boolean;
  guard: boolean;
  interrupted?: boolean;
}
export function contestProbability(input: ContestInput): number {
  const base = {
    push: .7,
    snatch: .55,
    knockout: .35,
    hurt: .6
  }[input.op];
  return Math.max(.05, Math.min(.95, base + .3 * input.impact + .2 * Number(!input.targetFacing) - .25 * input.courage - .2 * Number(input.red) - .15 * Number(input.guard)));
}
export function contest(rng: Rng, input: ContestInput): "success" | "resisted" | "interrupted" {
  if (input.interrupted) return "interrupted";
  return rng.next() < contestProbability(input) ? "success" : "resisted";
}
