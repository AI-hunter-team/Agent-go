import type { PublicStationMap } from "../src/shared/world";
import type { ActionPlan, BossContext, EntityRef, PlanStep } from "../src/shared/types";
import { isPlanStep } from "../src/sim/actions/primitives";
import { parsePlan } from "../src/sim/intent";
import { reconcileInstruction } from "../src/sim/actions/instructionAudit";
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
const condition = obj({ kind: en("guards_not_watching", "holding_item", "unverified"), text: str, itemKind: nullable(en("ticket", "coins", "umbrella", "water_bottle", "can", "snack", "backpack")) });
const CONDITION_INSTRUCTIONS = `保留instruction全文和context.guidance全部目标、条件、偏好及先后；不要把条件当成事实。长期目标只约束相关步骤，不要求本次全部完成。步骤preconditions可记录guards_not_watching（可见保安未注视时才做）、holding_item（实际持有itemKind）、unverified（其他尚不能检查的条件，须返回needs_precondition或明确说明，不能忽略）。when继续用于对话拒绝和前步结果。保安在角色东侧面朝西可能看着角色，以context.guards.sight相对几何为准；canSeeYou不代表隐藏警戒，缺观察为未知。投掷要实际持有；缺道具可先approach公开取物点，返回后重观察再take真实id；同一计划可take一个可见物品后再drop，不可捏造物品id或保证保安分心。保留步骤的每个前提，不要只在summary写“趁没注意”。 目标寻找信息：context.recentEvents与people.evidence是角色实际目击事件；holding为空只表示未见手持物。context.targetSearch.phase=confirmed时，按其targetId和购票成功证据继续原指令，不因票已收进口袋返回缺少持票证据，不再添加前置询问。目标尚在寻找时可安排观察/等待等准备，不把目标未知当成机制不支持。不得将离队事件推断为购票成功。`;
const ref = obj({ kind: en("person", "item", "facility", "node", "spot"), id: str });
const kinds = ["ticket", "coins", "umbrella", "water_bottle", "can", "snack", "backpack"];
// A flat wire object avoids nested-anyOf branch selection bugs in compatible APIs.
// Null fields are removed before the existing closed primitive validation.
export const BOSS_SCHEMA = obj({status:en("plan","unsupported","needs_precondition"),steps:{type:"array",items:obj({
 op:en("approach","take","give","drop","talk","snatch","push","restrain","release","force_cut_in","strike","vault","slide_handrail","make_noise","wait"),
 timing:nullable(en("after_previous","with_previous")),when:nullable(en("always","previous_refused","previous_succeeded","incapacitated_or_refused")),pursue:nullable({type:"boolean"}),
 preconditions:nullable({type:"array",items:condition}),
 target:nullable(ref),itemId:nullable(str),toId:nullable(str),mode:nullable(en("place","drop","throw")),at:nullable(ref),
 atPosition:nullable(obj({x:{type:"number"},y:{type:"number"}})),
 npcId:nullable(str),message:nullable(str),goal:nullable(en("chat","ask_ticket","trade","yield","persuade","threaten","bribe")),offerItemId:nullable(str),
 itemKind:nullable(en(...kinds)),facilityId:nullable(str),aim:nullable(en("knockout","hurt")),obstacle:nullable(en("gate","railing","escalator_side")),
 level:nullable(en("low","mid","high")),seconds:nullable({type:"number"}),
})},summary:str,reason:str});
export function buildBossSystem(map?:PublicStationMap) {
  const nodes=map?.nodes??NAV_NODES, spots=map?.itemSpots??ITEM_SPOTS;
  return `${SAFETY_SYSTEM_PROMPT}\n你是中立的游戏行动解释器。把 instruction 翻译为 schema 的闭合原语，最多八步。只使用 context 中可见的实体 id 和公开导航节点。不能创造物品、替人物决定同意、保证成功或改写世界。指代不明返回 needs_precondition；机制不支持返回 unsupported，两者 steps 为空。可执行返回 plan，1–8 步。reason 与 summary 简短中文，不输出结算结果。设施使用 strike 的 facilityId 分支（aim=hurt），人物使用 npcId 分支；两者互斥。公开导航节点：${JSON.stringify(nodes)}。公开取物点：${JSON.stringify(spots.map(({id,label,pos})=>({id,label,pos})))}。翻闸直接使用 vault(obstacle=gate)，不需要创造闸机内侧的目标节点；接近使用现有 facility/node。距离、碰撞、被发现与行动成败均由模拟器校验，不因无法保证成功而拒绝翻译一次尝试。每步仅 op 和该原语所需字段有值，其余字段一律 null；target/at 对象有值时必须完整提供 kind/id。snatch 使用可见人物 npcId 和 itemKind，不要求提供物品 itemId；持物不明确可请求前置观察。翻闸示例 steps=[{"op":"vault","obstacle":"gate"}]。翻安检低栏杆使用 vault(obstacle=railing)，栏杆无需实体 id；售票厅一侧的栏杆前节点为 ${nodes.filter(n=>n.id.startsWith("RAIL_")).map(n=>n.id).join("、")}，可先 approach 它们，也可直接 vault，模拟器会先走到最近的低栏杆段；不要 approach 安检后大厅节点代替翻越。不要用重复 approach 代替跨越，也不要声称没有 vault 原语。下面再次提供完整输出结构，字段须原样使用：${JSON.stringify(BOSS_SCHEMA)}`;
}
export const BOSS_SYSTEM=buildBossSystem();
export function bossContextValid(value: unknown): value is BossContext {
  if (!value || typeof value !== "object") return false;
  const c = value as BossContext;
  const pos = (v: unknown) => Boolean(v && typeof v === "object" && Number.isFinite((v as {x:number}).x) && Number.isFinite((v as {y:number}).y));
  const list = (v: unknown, check: (v: any) => boolean) => Array.isArray(v) && v.length <= 200 && v.every(x => x && typeof x.id === "string" && x.id.length <= 80 && check(x));
  const sceneEvent=(e:any) => !!e && typeof e.id==="string" && e.id.length<=100 && typeof e.personId==="string" && e.personId.length<=80 && Number.isFinite(e.t) && pos(e.position) && ["purchase_completed","queue_exit","item_received","item_released","ticket_used"].includes(e.kind) && typeof e.text==="string" && e.text.length<=500 && (e.itemKind===undefined||kinds.includes(e.itemKind)) && (e.facilityId===undefined||typeof e.facilityId==="string");
  const search=c.targetSearch;
  if(c.recentEvents!==undefined && (!Array.isArray(c.recentEvents)||c.recentEvents.length>80||!c.recentEvents.every(sceneEvent))) return false;
  if(search && (typeof search.instruction!=="string"||[...search.instruction].length>1000||!["searching","confirmed","lost","expired","acting","finished"].includes(search.phase)||!Number.isFinite(search.startedAt)||!Number.isFinite(search.deadline)||!Array.isArray(search.evidence)||search.evidence.length>8||!search.evidence.every(sceneEvent)||!search.query||!["recent_purchase","recent_item_gain","recent_queue_exit","holding_item"].includes(search.query.criterion)||typeof search.query.description!=="string"||search.query.description.length>500||typeof search.detail!=="string"||search.detail.length>1500||search.lastSeenPosition!==undefined&&!pos(search.lastSeenPosition))) return false;
  return !!c.self && pos(c.self.position) && list(c.self.inventory, i => kinds.includes(i.kind))
    && list(c.people, p => typeof p.look === "string" && p.look.length <= 500 && pos(p.position) && (p.queue === null || typeof p.queue === "string") && (p.holding === undefined || Array.isArray(p.holding) && p.holding.length <= 7 && p.holding.every((kind: unknown) => typeof kind === "string" && kinds.includes(kind))))
    && (!c.publicMap || list(c.publicMap.nodes,n=>pos(n.pos))&&list(c.publicMap.itemSpots,s=>pos(s.pos)))
    && list(c.items, i => kinds.includes(i.kind) && pos(i.position)) && list(c.facilities, f => typeof f.label === "string")
    && (c.guidance === undefined || typeof c.guidance === "string" && [...c.guidance].length <= 300)
    && (c.guards === undefined || list(c.guards, g => pos(g.position) && typeof g.facing === "string" && Number.isFinite(g.distance)
      && (g.sight === undefined || typeof g.sight.canSeeYou === "boolean" && typeof g.sight.directionToYou === "string" && [g.sight.facingDegrees,g.sight.angleToYouDegrees,g.sight.fieldOfViewDegrees].every(Number.isFinite))));
}
export function validatePlan(value: unknown, context: BossContext): ActionPlan | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ActionPlan;
  if (!["plan", "unsupported", "needs_precondition"].includes(v.status) || typeof v.reason !== "string" || v.reason.length > 500 || typeof v.summary !== "string" || v.summary.length > 500 || !Array.isArray(v.steps)) return null;
  if (v.status !== "plan") return v.steps.length === 0 ? { status: v.status, steps: [], summary: v.summary, reason: v.reason, source: "llm" } : null;
  if (!v.steps.length || v.steps.length > 8) return null;
  const people = new Set(context.people.map(p => p.id)), items = new Set([...context.items, ...context.self.inventory].map(i => i.id));
  const refOk = (r: EntityRef) => r.kind === "person" ? people.has(r.id) : r.kind === "item" ? items.has(r.id) : r.kind === "facility" ? context.facilities.some(f => f.id === r.id) : r.kind === "spot" ? (context.publicMap?.itemSpots??ITEM_SPOTS).some(s => s.id === r.id) : r.kind === "node" && (context.publicMap?.nodes??NAV_NODES).some(n => n.id === r.id);
  const steps = v.steps.map(step => {
    const clean = Object.fromEntries(Object.entries(step).filter(([, value]) => value !== null));
    if (Array.isArray(clean.preconditions)) clean.preconditions = clean.preconditions.map(c => c && typeof c === "object" ? Object.fromEntries(Object.entries(c).filter(([,v]) => v !== null)) : c);
    return clean as PlanStep;
  });
  if (!steps.every(s => isPlanStep(s) && (!("npcId" in s) || people.has(s.npcId)) && (!("facilityId" in s) || context.facilities.some(f => f.id === s.facilityId)) && (!("toId" in s) || people.has(s.toId)) && (!("itemId" in s) || s.itemId === undefined || items.has(s.itemId)) && (!("offerItemId" in s) || s.offerItemId === undefined || items.has(s.offerItemId)) && (!("target" in s) || refOk(s.target)) && (!("at" in s) || !s.at || refOk(s.at)))) return null;
  return { status: v.status, steps, summary: [...v.summary].slice(0,60).join(""), reason: v.reason, source: "llm" };
}
export async function interpret(transport: Structured, instruction: string, context: BossContext): Promise<ActionPlan> {
  const call: Structured = (system, user, schema, name, maxTokens) => transport(system + "\n" + CONDITION_INSTRUCTIONS + "\n投掷必须是drop(mode=throw)，需要目标坐标atPosition{x,y}或at引用；实际落点按6米能力与障碍由模拟器结算，目标太远也能出手，不以超距为由拒绝解释。不允许用make_noise替代物品转移。先投掷再翻越必须保留步骤顺序；为随后翻越做准备仅为目的，不添加当下vault。未确认保安反应时应先投掷，等待并重新观察后再决定翻越。", user, schema, name, maxTokens);
  const finalize = (plan: ActionPlan) => {
    const {plan: checked,changes,requirements} = reconcileInstruction(instruction,plan,context);
    return {...checked,translation:{...checked.translation,instruction,originalSteps:structuredClone(plan.steps),changes,requirements}};
  };
  const fallback = (reason:string, metadata:import("../src/shared/interaction").ModelMetadata) => {
    const parsed=parsePlan(instruction,context), checked=finalize({...parsed,...metadata});
    checked.reason=checked.reason || reason;
    if (checked.translation) checked.translation.changes.unshift(reason);
    return checked;
  };
  try {
    const {value,metadata} = unpackStructured(await call(`${buildBossSystem(context.publicMap)}\n调度规则：最多八步，保留原文每项要求和明确先后；没有指定顺序可自主安排并给出可核对的条件依据。台词只用talk，实际动作用独立步骤。可以先动作后语言；同时说话时紧接身体动作的talk设置timing=with_previous。拒绝后才执行的步骤设置when=previous_refused；依赖前步成功设置previous_succeeded；失能或对话拒绝后取物使用incapacitated_or_refused，其余always。不得把否定、引用或条件句升级为无条件动作。抓住/限制逃跑用restrain，松开用release；只支持控制乘客，有时限和反抗。追近设置pursue=true，仅支持strike/snatch/push/restrain，有两次和6秒上限。直接击打0.5秒，无防备乘客命中后默认90%击晕；不得保证命中。打晕目标仍用aim=knockout，物品获取仍需snatch或真实交付，失能者不能说话。用物品击打须传实际持有itemId。无法覆盖的机制或条件须明确返回unsupported，不能默默删去；summary不要宣布成功。`, untrustedData("行动与可见上下文", { instruction, context }), BOSS_SCHEMA, "action_plan", 3072));
    const plan = validatePlan(value, context);
    if (plan) return finalize({...plan,...metadata});
    return fallback("模型计划字段无效，已改用有限规则解释；请核对步骤，没有保证完整覆盖",metadata);
  } catch (error) { return fallback("模型解释失败，已改用有限规则解释；请核对步骤，没有保证完整覆盖",failureMetadata(error)); }
}
