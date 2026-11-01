import type { AgentAction, BossContext, PhysicalAction } from "../shared/types";
import { explicitPhysicalIntent } from "../shared/physicalIntent";
export { explicitPhysicalIntent } from "../shared/physicalIntent";

export function recoverPhysicalAction(input: string, selected: AgentAction, context: BossContext): PhysicalAction | null {
  if (selected.type !== "talk") return null;
  const intent = explicitPhysicalIntent(input);
  if (!intent || !context.people.some(p => p.id === selected.npcId)) return null;
  const named = input.match(/\b(?:[pn]\d+|lab-guard|guard-[AB])\b/g) ?? [];
  if (named.some(id => id !== selected.npcId)) return null;
  // A missing tool cannot turn a requested armed action into an unarmed one.
  const weapon = /用.*伞/.test(input) ? "umbrella" : /用.*(?:水瓶|矿泉水|瓶子)/.test(input) ? "water_bottle" : null;
  const item = weapon ? context.self.inventory.find(i => i.kind === weapon) : undefined;
  if (weapon && !item) return null;
  return { type: "physical_action", ...intent, npcId: selected.npcId, ...(item ? { itemId: item.id } : {}),
    speech: { message: selected.message, goal: selected.goal, ...(selected.offerItemId ? { offerItemId: selected.offerItemId } : {}) }, reason: "按本次明确指令补回被纯对话遗漏的独立动作" };
}
