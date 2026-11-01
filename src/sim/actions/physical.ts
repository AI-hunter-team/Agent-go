import type { ActionPlan, PhysicalAction, PlanStep, TalkGoal } from "../../shared/interaction";

const goals: TalkGoal[] = ["chat", "ask_ticket", "trade", "yield", "persuade", "threaten", "bribe"];
const kinds = ["ticket", "coins", "umbrella", "water_bottle", "can", "snack", "backpack"];
const text = (v: unknown, max = 200): v is string => typeof v === "string" && !!v.trim() && [...v].length <= max;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const optionalText = (v: unknown) => v == null || text(v);

/** The same validation is used at transport and engine boundaries. */
export function parsePhysicalAction(value: unknown): PhysicalAction | null {
  if (!object(value) || value.type !== "physical_action" || !text(value.npcId) || !text(value.action) || !["push", "snatch", "strike", "restrain", "release"].includes(value.action)) return null;
  if (value.speechTiming != null && !["before", "after", "during"].includes(String(value.speechTiming))) return null;
  if (Object.keys(value).some(k => !["type", "action", "npcId", "aim", "itemId", "itemKind", "speech", "speechTiming", "reason"].includes(k))) return null;
  if (!optionalText(value.itemId) || (value.reason !== undefined && typeof value.reason !== "string")) return null;
  if (value.action === "strike" ? !["hurt", "knockout"].includes(String(value.aim)) || value.itemKind != null : value.aim != null || value.itemId != null) return null;
  if (value.action === "snatch" ? !kinds.includes(String(value.itemKind)) : value.itemKind != null) return null;
  let speech: PhysicalAction["speech"];
  if (value.speech != null) {
    const s = value.speech;
    if (!object(s) || Object.keys(s).some(k => !["message", "goal", "offerItemId"].includes(k)) || !text(s.message) || !goals.includes(s.goal as TalkGoal) || !optionalText(s.offerItemId)) return null;
    speech = { message: s.message, goal: s.goal as TalkGoal, ...(s.offerItemId ? { offerItemId: s.offerItemId as string } : {}) };
  }
  return { type: "physical_action", action: value.action as PhysicalAction["action"], npcId: value.npcId,
    ...(value.aim ? { aim: value.aim as PhysicalAction["aim"] } : {}), ...(value.itemId ? { itemId: value.itemId as string } : {}),
    ...(value.itemKind ? { itemKind: value.itemKind as PhysicalAction["itemKind"] } : {}), ...(speech ? { speech } : {}), ...(value.speechTiming ? { speechTiming: value.speechTiming as PhysicalAction["speechTiming"] } : {}), reason: String(value.reason ?? "").slice(0, 80) };
}

export function physicalActionPlan(value: PhysicalAction): ActionPlan {
  const a = parsePhysicalAction(value);
  if (!a) return { status: "needs_precondition", summary: "", reason: "肢体行动参数无效", steps: [], source: "keywords" };
  const physical: PlanStep = a.action === "strike" ? { op: "strike", npcId: a.npcId, aim: a.aim!, ...(a.itemId ? { itemId: a.itemId } : {}) }
    : a.action === "snatch" ? { op: "snatch", npcId: a.npcId, itemKind: a.itemKind! } : { op: a.action, npcId: a.npcId };
  const talk: PlanStep | null = a.speech ? { op: "talk", npcId: a.npcId, ...a.speech, ...(a.speechTiming === "during" ? { timing: "with_previous" as const } : {}) } : null;
  return { status: "plan", summary: "按语言与动作指定的时序执行", reason: a.reason, source: "keywords",
    steps: !talk ? [physical] : a.speechTiming === "after" || a.speechTiming === "during" ? [physical, talk] : [talk, physical] };
}
