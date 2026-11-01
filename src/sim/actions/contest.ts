import type { Rng } from "../rng";
export interface ContestInput {
  op: "push" | "snatch" | "knockout" | "hurt";
  impact: number;
  targetFacing: boolean;
  courage: number;
  red: boolean;
  guard: boolean;
  interrupted?: boolean;
  surprised?: boolean;
  helpless?: boolean;
}
export function contestProbability(input: ContestInput): number {
  if (input.helpless) return 1;
  if (input.surprised && ["hurt", "knockout"].includes(input.op)) return .95;
  const base = {
    push: .7,
    snatch: .55,
    knockout: .35,
    hurt: .6
  }[input.op];
  const minimum = input.op === "hurt" || input.op === "knockout" ? .6 : .05;
  return Math.max(minimum, Math.min(.95, base + .3 * input.impact + .2 * Number(!input.targetFacing) - .25 * input.courage - .2 * Number(input.red) - .15 * Number(input.guard)));
}
export function contest(rng: Rng, input: ContestInput): "success" | "resisted" | "interrupted" {
  if (input.interrupted) return "interrupted";
  if (input.helpless) return "success";
  return rng.next() < contestProbability(input) ? "success" : "resisted";
}
