import type { ActionPlan, BossContext, EntityRef, PlanStep } from "../src/shared/types";
import { isPlanStep } from "../src/sim/actions/primitives";
import { parsePlan } from "../src/sim/intent";
import { NAV_NODES } from "../src/sim/layout";
import { SAFETY_SYSTEM_PROMPT, untrustedData } from "./security";

export type Structured = (system: string, user: string, schema: Record<string, unknown>, name: string, maxTokens: number) => Promise<unknown>;
const str = { type: "string" };
const en = (...values: string[]) => ({ type: "string", enum: values });
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const nullable = (value: unknown) => ({ anyOf: [value, { type: "null" }] });
const ref = obj({ kind: en("person", "item", "facility", "node", "spot"), id: str });
const kinds = ["ticket", "coins", "umbrella", "water_bottle", "newspaper", "snack", "backpack"];
export const BOSS_SCHEMA = obj({ status: en("plan", "unsupported", "needs_precondition"), steps: { type: "array", items: { anyOf: [
  obj({ op: en("approach"), target: ref }), obj({ op: en("take"), itemId: str }),
  obj({ op: en("give"), itemId: str, toId: str }), obj({ op: en("drop"), itemId: str, mode: en("place", "drop", "throw"), at: nullable(ref) }),
  obj({ op: en("talk"), npcId: str, message: str, goal: en("chat", "ask_ticket", "trade", "yield", "persuade", "threaten", "bribe"), offerItemId: nullable(str) }),
  obj({ op: en("snatch"), npcId: str, itemKind: en(...kinds) }), obj({ op: en("push", "force_cut_in"), npcId: str }),
  obj({ op: en("strike"), npcId: str, itemId: nullable(str), aim: en("knockout", "hurt") }),
  obj({ op: en("vault"), obstacle: en("gate", "railing", "escalator_side") }), obj({ op: en("slide_handrail") }),
  obj({ op: en("make_noise"), level: en("low", "mid", "high") }), obj({ op: en("wait"), seconds: { type: "number" } }),
] } }, summary: str, reason: str });
export const BOSS_SYSTEM = `${SAFETY_SYSTEM_PROMPT}\n你是中立的游戏行动解释器。把 instruction 翻译为 schema 的闭合原语，最多四步。只使用 context 中可见的实体 id 和公开导航节点。不能创造物品、替人物决定同意、保证成功或改写世界。指代不明返回 needs_precondition；机制不支持返回 unsupported，两者 steps 为空。可执行返回 plan，1–4 步。reason 与 summary 简短中文，不输出结算结果。可选字段无值填 null。`;
export function bossContextValid(value: unknown): value is BossContext {
  if (!value || typeof value !== "object") return false;
  const c = value as BossContext;
  const pos = (v: unknown) => Boolean(v && typeof v === "object" && Number.isFinite((v as {x:number}).x) && Number.isFinite((v as {y:number}).y));
  const list = (v: unknown, check: (v: any) => boolean) => Array.isArray(v) && v.length <= 200 && v.every(x => x && typeof x.id === "string" && x.id.length <= 80 && check(x));
  return !!c.self && pos(c.self.position) && list(c.self.inventory, i => kinds.includes(i.kind))
    && list(c.people, p => typeof p.look === "string" && p.look.length <= 500 && pos(p.position) && (p.queue === null || typeof p.queue === "string"))
    && list(c.items, i => kinds.includes(i.kind) && pos(i.position)) && list(c.facilities, f => typeof f.label === "string");
}
export function validatePlan(value: unknown, context: BossContext): ActionPlan | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ActionPlan;
  if (!["plan", "unsupported", "needs_precondition"].includes(v.status) || typeof v.reason !== "string" || v.reason.length > 500 || typeof v.summary !== "string" || v.summary.length > 500 || !Array.isArray(v.steps)) return null;
  if (v.status !== "plan") return v.steps.length === 0 ? { status: v.status, steps: [], summary: v.summary, reason: v.reason, source: "llm" } : null;
  if (!v.steps.length || v.steps.length > 4) return null;
  const people = new Set(context.people.map(p => p.id)), items = new Set([...context.items, ...context.self.inventory].map(i => i.id));
  const refOk = (r: EntityRef) => r.kind === "person" ? people.has(r.id) : r.kind === "item" ? items.has(r.id) : r.kind === "facility" ? context.facilities.some(f => f.id === r.id) : r.kind === "node" && NAV_NODES.some(n => n.id === r.id);
  const steps = v.steps.map(step => Object.fromEntries(Object.entries(step).filter(([, value]) => value !== null)) as PlanStep);
  if (!steps.every(s => isPlanStep(s) && (!("npcId" in s) || people.has(s.npcId)) && (!("toId" in s) || people.has(s.toId)) && (!("itemId" in s) || s.itemId === undefined || items.has(s.itemId)) && (!("offerItemId" in s) || s.offerItemId === undefined || items.has(s.offerItemId)) && (!("target" in s) || refOk(s.target)) && (!("at" in s) || !s.at || refOk(s.at)))) return null;
  return { status: v.status, steps, summary: v.summary, reason: v.reason, source: "llm" };
}
export async function interpret(call: Structured, instruction: string, context: BossContext): Promise<ActionPlan> {
  try {
    const plan = validatePlan(await call(BOSS_SYSTEM, untrustedData("行动与可见上下文", { instruction, context }), BOSS_SCHEMA, "action_plan", 2048), context);
    if (plan) return plan;
  } catch { /* An unavailable or invalid interpreter grants no new capability. */ }
  return parsePlan(instruction, context);
}
