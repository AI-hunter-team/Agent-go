import type { PlanStep } from "../../shared/types";
import { observeGuards } from "../observation";
import type { GuardSystem } from "../guards";
import type { World } from "../world";

/** Explicit conditions, checked from the same visible information as the role. */
export function preconditionError(step: PlanStep, world: World, guards: GuardSystem): string | null {
  for (const condition of step.preconditions ?? []) {
    if (condition.kind === "unverified") return `条件尚未能检查：${condition.text}；请观察或拆分行动，未执行`;
    if (condition.kind === "holding_item" && !world.items.holdings(world.player!.id).some(i => i.kind === condition.itemKind && !i.used)) {
      return `条件未满足：${condition.text}；需要先寻找并取得 ${condition.itemKind}，未执行`;
    }
    if (condition.kind === "guards_not_watching") {
      const visible = observeGuards(world, guards);
      if (!visible.length) return `条件未知：${condition.text}；当前看不到可判断的保安，不能当作无人看守，未执行`;
      const watching = visible.filter(g => g.sight?.canSeeYou);
      if (watching.length) return `条件未满足：${condition.text}；${watching.map(g => g.id).join("、")} 当前视线覆盖你，请先观察或转移注意力，未执行`;
    }
  }
  return null;
}
