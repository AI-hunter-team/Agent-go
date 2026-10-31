import type { PublicStationMap } from "../src/shared/world";
import type { ActionPlan, BossContext, EntityRef, PlanStep } from "../src/shared/types";
import { isPlanStep } from "../src/sim/actions/primitives";
import { parsePlan } from "../src/sim/intent";
import { ITEM_SPOTS, NAV_NODES } from "../src/sim/layout";
import { SAFETY_SYSTEM_PROMPT, untrustedData } from "./security";

export interface StructuredEnvelope { value: unknown; metadata: import("../src/shared/interaction").ModelMetadata }
export function unpackStructured(result: unknown): StructuredEnvelope {
  return result && typeof result === "object" && "metadata" in result && "value" in result ? result as StructuredEnvelope : { value: result, metadata: {} };
}
export function failureMetadata(error: unknown): import("../src/shared/interaction").ModelMetadata {
  return error && typeof error === "object" && "modelMetadata" in error ? (error as {modelMetadata: import("../src/shared/interaction").ModelMetadata}).modelMetadata : {};
}
export type Structured = (system: string, user: string, schema: Record<string, unknown>, name: string, maxTokens: number) => Promise<unknown>;
const str = { type: "string" };
const en = (...values: string[]) => ({ type: "string", enum: values });
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const nullable = (value: unknown) => ({ anyOf: [value, { type: "null" }] });
const ref = obj({ kind: en("person", "item", "facility", "node", "spot"), id: str });
const kinds = ["ticket", "coins", "umbrella", "water_bottle", "newspaper", "snack", "backpack"];
// A flat wire object avoids nested-anyOf branch selection bugs in compatible APIs.
// Null fields are removed before the existing closed primitive validation.
export const BOSS_SCHEMA = obj({status:en("plan","unsupported","needs_precondition"),steps:{type:"array",items:obj({
 op:en("approach","take","give","drop","talk","snatch","push","force_cut_in","strike","vault","slide_handrail","make_noise","wait"),
 target:nullable(ref),itemId:nullable(str),toId:nullable(str),mode:nullable(en("place","drop","throw")),at:nullable(ref),
 npcId:nullable(str),message:nullable(str),goal:nullable(en("chat","ask_ticket","trade","yield","persuade","threaten","bribe")),offerItemId:nullable(str),
 itemKind:nullable(en(...kinds)),facilityId:nullable(str),aim:nullable(en("knockout","hurt")),obstacle:nullable(en("gate","railing","escalator_side")),
 level:nullable(en("low","mid","high")),seconds:nullable({type:"number"}),
})},summary:str,reason:str});
export function buildBossSystem(map?:PublicStationMap) {
  const nodes=map?.nodes??NAV_NODES, spots=map?.itemSpots??ITEM_SPOTS;
  return `${SAFETY_SYSTEM_PROMPT}\n你是中立的游戏行动解释器。把 instruction 翻译为 schema 的闭合原语，最多四步。只使用 context 中可见的实体 id 和公开导航节点。不能创造物品、替人物决定同意、保证成功或改写世界。指代不明返回 needs_precondition；机制不支持返回 unsupported，两者 steps 为空。可执行返回 plan，1–4 步。reason 与 summary 简短中文，不输出结算结果。设施使用 strike 的 facilityId 分支（aim=hurt），人物使用 npcId 分支；两者互斥。公开导航节点：${JSON.stringify(nodes)}。公开取物点：${JSON.stringify(spots.map(({id,label,pos})=>({id,label,pos})))}。翻闸直接使用 vault(obstacle=gate)，不需要创造闸机内侧的目标节点；接近使用现有 facility/node。距离、碰撞、被发现与行动成败均由模拟器校验，不因无法保证成功而拒绝翻译一次尝试。每步仅 op 和该原语所需字段有值，其余字段一律 null；target/at 对象有值时必须完整提供 kind/id。snatch 使用可见人物 npcId 和 itemKind，不要求提供物品 itemId；持物不明确可请求前置观察。翻闸示例 steps=[{"op":"vault","obstacle":"gate"}]。翻安检低栏杆使用 vault(obstacle=railing)，栏杆无需实体 id；售票厅一侧的栏杆前节点为 ${nodes.filter(n=>n.id.startsWith("RAIL_")).map(n=>n.id).join("、")}，可先 approach 它们，也可直接 vault，模拟器会先走到最近的低栏杆段；不要 approach 安检后大厅节点代替翻越。不要用重复 approach 代替跨越，也不要声称没有 vault 原语。下面再次提供完整输出结构，字段须原样使用：${JSON.stringify(BOSS_SCHEMA)}`;
}
export const BOSS_SYSTEM=buildBossSystem();
export function bossContextValid(value: unknown): value is BossContext {
  if (!value || typeof value !== "object") return false;
  const c = value as BossContext;
  const pos = (v: unknown) => Boolean(v && typeof v === "object" && Number.isFinite((v as {x:number}).x) && Number.isFinite((v as {y:number}).y));
  const list = (v: unknown, check: (v: any) => boolean) => Array.isArray(v) && v.length <= 200 && v.every(x => x && typeof x.id === "string" && x.id.length <= 80 && check(x));
  return !!c.self && pos(c.self.position) && list(c.self.inventory, i => kinds.includes(i.kind))
    && list(c.people, p => typeof p.look === "string" && p.look.length <= 500 && pos(p.position) && (p.queue === null || typeof p.queue === "string") && (p.holding === undefined || Array.isArray(p.holding) && p.holding.length <= 7 && p.holding.every((kind: unknown) => typeof kind === "string" && kinds.includes(kind))))
    && (!c.publicMap || list(c.publicMap.nodes,n=>pos(n.pos))&&list(c.publicMap.itemSpots,s=>pos(s.pos)))
    && list(c.items, i => kinds.includes(i.kind) && pos(i.position)) && list(c.facilities, f => typeof f.label === "string");
}
export function validatePlan(value: unknown, context: BossContext): ActionPlan | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ActionPlan;
  if (!["plan", "unsupported", "needs_precondition"].includes(v.status) || typeof v.reason !== "string" || v.reason.length > 500 || typeof v.summary !== "string" || v.summary.length > 500 || !Array.isArray(v.steps)) return null;
  if (v.status !== "plan") return v.steps.length === 0 ? { status: v.status, steps: [], summary: v.summary, reason: v.reason, source: "llm" } : null;
  if (!v.steps.length || v.steps.length > 4) return null;
  const people = new Set(context.people.map(p => p.id)), items = new Set([...context.items, ...context.self.inventory].map(i => i.id));
  const refOk = (r: EntityRef) => r.kind === "person" ? people.has(r.id) : r.kind === "item" ? items.has(r.id) : r.kind === "facility" ? context.facilities.some(f => f.id === r.id) : r.kind === "spot" ? (context.publicMap?.itemSpots??ITEM_SPOTS).some(s => s.id === r.id) : r.kind === "node" && (context.publicMap?.nodes??NAV_NODES).some(n => n.id === r.id);
  const steps = v.steps.map(step => Object.fromEntries(Object.entries(step).filter(([, value]) => value !== null)) as PlanStep);
  if (!steps.every(s => isPlanStep(s) && (!("npcId" in s) || people.has(s.npcId)) && (!("facilityId" in s) || context.facilities.some(f => f.id === s.facilityId)) && (!("toId" in s) || people.has(s.toId)) && (!("itemId" in s) || s.itemId === undefined || items.has(s.itemId)) && (!("offerItemId" in s) || s.offerItemId === undefined || items.has(s.offerItemId)) && (!("target" in s) || refOk(s.target)) && (!("at" in s) || !s.at || refOk(s.at)))) return null;
  return { status: v.status, steps, summary: v.summary, reason: v.reason, source: "llm" };
}
export async function interpret(call: Structured, instruction: string, context: BossContext): Promise<ActionPlan> {
  try {
    const {value,metadata} = unpackStructured(await call(buildBossSystem(context.publicMap), untrustedData("行动与可见上下文", { instruction, context }), BOSS_SCHEMA, "action_plan", 2048));
    const plan = validatePlan(value, context);
    if (plan) return {...plan,...metadata};
    return {...parsePlan(instruction, context),...metadata};
  } catch (error) { return {...parsePlan(instruction, context), ...failureMetadata(error)}; }
  return parsePlan(instruction, context);
}
