import type { ActionPlan, AgentAction, BossContext, ItemKind, PlanStep } from "../../shared/types";
import { currentActionText, explicitPhysicalIntent } from "../../shared/physicalIntent";
import { guidanceSources, requiresUnobservedGuard } from "../../shared/guidanceSources";
import { personQuery } from "../personSearch";
import { parsePlan } from "../intent";

export interface Requirement {
  text: string; start: number; kind: string; conditional: boolean;
  condition?: "previous_refused" | "previous_succeeded" | "incapacitated_or_refused" | "guards_not_watching" | "holding_item" | "unsupported";
  conditionText?: string;
  conditionItemKind?: ItemKind;
  state: "covered" | "missing" | "unverified"; steps: number[]; explanation: string;
}
const catalogue: [string, RegExp][] = [
  ["strike", /击晕|打晕|殴打|击打|打人|动手打|揍/g],
  ["restrain", /抓住|控制住|按住|限制(?:他|她|对方)?移动|不让(?:他|她|对方)?逃跑|不许(?:他|她|对方)?逃跑/g],
  ["release", /松开|放开/g], ["snatch", /抢夺|抢(?:走)?[^，。；]{0,8}(?:车票|票|零食|雨伞)/g],
  ["push", /推搡|推开|推倒/g], ["ask_ticket", /索要(?:车票|票)?|要票|交(?:出)?车票/g],
  ["threaten", /威胁|恐吓/g], ["trade", /交换|换(?:取|票)/g], ["yield", /让位/g],
  ["force_cut_in", /插队|加塞/g], ["give", /交付|递给|送给/g], ["take", /拿起|捡起|拾取/g],
  ["drop", /放下|丢下|扔(?:出|到|向|掉)?|投掷|throw/g], ["vault", /翻越|翻闸|翻过/g], ["approach", /靠近|走向/g],
  ["wait", /等待/g], ["join_queue", /买票|加入[^，。；]{0,16}队|(?:去|开始|我要)排队|^排队/g], ["traverse", /下楼|到(?:达)?站台|乘扶梯|走楼梯/g],
];
const speechKinds = ["ask_ticket", "threaten", "trade", "yield"];
const conditionItems: [ItemKind, RegExp][] = [["water_bottle", /水瓶|瓶子|矿泉水/], ["coins", /零钱|硬币/], ["umbrella", /雨伞/], ["ticket", /车票/], ["can", /易拉罐|罐子/], ["snack", /零食/], ["backpack", /背包/]];

function applyRequirementCondition(step: PlanStep, requirement: Requirement) {
  if (!requirement.conditional || !requirement.condition || requirement.condition === "unsupported") return;
  const text = requirement.conditionText || requirement.text;
  if (requirement.condition === "guards_not_watching") {
    if (!step.preconditions?.some(c => c.kind === "guards_not_watching")) step.preconditions = [...(step.preconditions ?? []), { kind: "guards_not_watching", text }];
  } else if (requirement.condition === "holding_item" && requirement.conditionItemKind) {
    if (!step.preconditions?.some(c => c.kind === "holding_item" && c.itemKind === requirement.conditionItemKind)) step.preconditions = [...(step.preconditions ?? []), { kind: "holding_item", itemKind: requirement.conditionItemKind, text }];
  } else if (requirement.condition !== "holding_item") step.when = requirement.condition;
}

function conditionCovered(requirement: Requirement, step: PlanStep): boolean {
  if (!requirement.conditional) return true;
  if (requirement.condition === "guards_not_watching") return !!step.preconditions?.some(c => c.kind === "guards_not_watching");
  if (requirement.condition === "holding_item") return !!step.preconditions?.some(c => c.kind === "holding_item" && c.itemKind === requirement.conditionItemKind);
  return requirement.condition !== "unsupported" && step.when === requirement.condition;
}
export function extractRequirements(input: string): Requirement[] {
  // Keep offsets while excluding quoted words from physical commands.
  const text = currentActionText(input).replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/g, s => " ".repeat(s.length));
  const found: Requirement[] = [];
  for (const [kind, pattern] of catalogue) for (const m of text.matchAll(new RegExp(pattern))) {
    const prefix = text.slice(Math.max(0, m.index! - 18), m.index);
    if (/(?:不要|别|禁止|无需|避免|不能|不想|不执行|不实施|不(?:要|许|能|想)?(?:直接|主动|随便)?)\s*$/.test(prefix)) continue;
    if (["strike", "push", "snatch"].includes(kind)) {
      const clause = text.slice(Math.max(text.lastIndexOf("，", m.index), text.lastIndexOf("。", m.index)) + 1).split(/[，。；]/)[0];
      if (!/如果|拒绝|否则|不交.*就/.test(clause) && !explicitPhysicalIntent(clause)) continue;
    }
    const boundary = Math.max(text.lastIndexOf("，", m.index), text.lastIndexOf("。", m.index), text.lastIndexOf("；", m.index));
    const before = text.slice(boundary + 1, m.index);
    const held = /(?:已经)?(?:持有|拿到|取得|拿着)[^，。；]{0,15}(?:后|时|才|再|就)/.test(before) ? conditionItems.find(([, pattern]) => pattern.test(before))?.[0] : undefined;
    const conditional = !!held || /如果|假如|只有|仅当|等到|趁|拒绝|否则|不交.*就|(?:前|上)一步.*(?:成功|完成)/.test(before);
    const condition: Requirement["condition"] = requiresUnobservedGuard(before) ? "guards_not_watching"
      : held ? "holding_item"
      : /(?:前|上)一步.*(?:成功|完成)/.test(before) ? "previous_succeeded"
      : /(?:失能|击晕|昏迷).*(?:或|或者).*拒绝/.test(before) ? "incapacitated_or_refused"
      : /拒绝|不交|不答应|否则/.test(before) ? "previous_refused" : "unsupported";
    found.push({ text: m[0], start: m.index!, kind, conditional, ...(conditional ? { condition, conditionText: before, ...(held ? { conditionItemKind: held } : {}) } : {}), state: "missing", steps: [], explanation: "尚未找到对应步骤" });
  }
  const unique = found.sort((a,b) => a.start-b.start).filter((r,i,a) => !a.slice(0,i).some(v => v.kind === r.kind && Math.abs(v.start-r.start)<5));
  if (!unique.length) unique.push({ text: input, start: 0, kind: "unknown", conditional: false, state: "unverified", steps: [], explanation: "没有可靠的自动拆解规则，请核对实际参数与执行记录；不宣称完整覆盖" });
  return unique;
}
function matches(r: Requirement, s: PlanStep) {
  if (r.kind === "drop" && /投掷|扔|throw/.test(r.text)) return s.op === "drop" && s.mode === "throw";
  return speechKinds.includes(r.kind) ? s.op === "talk" && (s.goal === r.kind || r.kind === "ask_ticket" && /票/.test(s.message) || r.kind === "threaten" && /威胁|不然|否则|不客气/.test(s.message)) : s.op === r.kind;
}
export function auditInstruction(input: string, steps: PlanStep[], action?: AgentAction) {
  return extractRequirements(input).map(r => {
    const indices = steps.flatMap((s,i) => matches(r,s) ? [i+1] : []);
    const direct = action && r.kind === action.type;
    const conditionOk = !r.conditional || indices.some(i => conditionCovered(r, steps[i - 1]));
    return { ...r, steps: indices, state: r.kind === "unknown" ? "unverified" as const : (indices.length || direct) && conditionOk ? "covered" as const : "missing" as const,
      explanation: !conditionOk ? "条件没有转换成执行约束，不能无条件执行" : indices.length ? `对应步骤 ${indices.join("、")}；是否成功由世界结算` : direct ? "由角色直接操作执行" : r.explanation };
  });
}

/** Bounded repairs only for explicit, visible, uniquely resolved commands. Never invent success. */
export function reconcileInstruction(input: string, original: ActionPlan, context: BossContext): { plan: ActionPlan; changes: string[]; requirements: Requirement[] } {
  const plan = structuredClone(original), changes: string[] = [];
  const binding=personQuery(input) && context.targetSearch?.phase==="confirmed" && context.targetSearch.instruction===input ? context.people.find(p=>p.id===context.targetSearch!.targetId) : undefined;
  if(binding && plan.status==="needs_precondition") {
    const fallback=parsePlan(input,context);
    if(fallback.status==="plan") {Object.assign(plan,fallback);changes.push(`目标已由现场证据确认为 ${binding.id}，恢复动作解释；未见手持物不等于没有票`);}
  }
  const guidance = context.guidance || original.translation?.sourceGuidance || "";
  const finish = () => {
    const requirements = auditInstruction(input, plan.steps);
    plan.translation = { instruction: input, originalSteps: original.translation?.originalSteps ?? structuredClone(original.steps),
      originalStatus:original.translation?.originalStatus??original.status, originalReason:original.translation?.originalReason??original.reason,
      originalSummary:original.translation?.originalSummary??original.summary, originalSource:original.translation?.originalSource??original.source,
      sourceGuidance: guidance, sourceClauses: guidanceSources(guidance || input),
      changes: [...new Set([...(original.translation?.changes ?? []), ...changes])], requirements };
    return { plan, changes, requirements };
  };
  if (plan.status !== "plan") return finish();
  if(binding) for(const step of plan.steps) {
    if("npcId" in step && step.npcId!==binding.id && !input.includes(step.npcId) && !/保安|安检员/.test(context.people.find(p=>p.id===step.npcId)?.look??"")) {
      changes.push(`目标纠正：${step.npcId} → ${binding.id}，依据已目击事件，不按眼前最近的人猜测`);step.npcId=binding.id;
    }
  }
  const requirements = extractRequirements(input);
  if (currentActionText(input) !== input && !requirements.some(r=>r.kind === "vault")) {
    const count=plan.steps.length;
    plan.steps=plan.steps.filter(s=>s.op !== "vault");
    if (plan.steps.length !== count) changes.push("移除仅作为未来目的提到的翻越，本次先执行投掷并重观察");
  }
  if (requirements.some(r=>r.kind === "drop" && /投掷|扔|throw/.test(r.text)) && !plan.steps.some(s=>s.op === "drop" && s.mode === "throw")
      && !plan.steps.every(s=>s.op === "approach" || s.op === "take")) {
    plan.status="needs_precondition"; plan.steps=[]; plan.reason="解释遗漏了实际投掷步骤，需要明确持有道具及投掷目标；实际落点由模拟器结算，未改成翻越或制造空响。";
    changes.push(plan.reason); return finish();
  }
  const guardCondition = requiresUnobservedGuard(input) || requiresUnobservedGuard(guidance);
  if (requirements.some(r=>r.condition==="unsupported")) {
    plan.status="unsupported"; plan.steps=[]; plan.reason="包含尚不能可靠执行的条件；原文已保留，当前支持前步结果、可见保安视线和实际持物等检查，请观察、澄清或拆分。";
    changes.push(plan.reason); return finish();
  }
  const physicalWords: Record<string,string> = {strike:"殴打|击打|击晕|打晕|动手|打人",push:"推搡|推开|推倒",snatch:"抢夺|抢票|抢走",restrain:"抓住|控制住|按住",release:"松开|放开"};
  plan.steps=plan.steps.filter(s=>{
    const words=physicalWords[s.op]; if(!words) return true;
    const prohibited=new RegExp(`(?:不要|不许|不能|禁止|别)(?:直接|执行|进行)?(?:${words})`).test(input);
    const forcedRetrieval=s.op==="snatch" && /强迫|强制/.test(input) && /票/.test(input) && requirements.some(r=>r.kind==="strike"||r.kind==="restrain");
    const speechOnly=!forcedRetrieval && speechKinds.some(k=>requirements.some(r=>r.kind===k)) && !requirements.some(r=>r.kind===s.op) && !/自由|自行|任何方式|不择手段/.test(input);
    if(prohibited||speechOnly) { changes.push(`移除未授权的 ${s.op}：${prohibited?"原文明确禁止":"仅要求语言，不能擅自增加身体动作"}`); return false; }
    return true;
  });
  const ids: string[] = input.match(/\b(?:p\d+|n\d+|lab-guard|guard-[AB])\b/g) ?? [];
  const named = context.people.filter(p => ids.includes(p.id));
  let people = /乘客/.test(input) ? context.people.filter(p => !/保安|安检员/.test(p.look)) : context.people;
  if (/保安/.test(input)) people = context.people.filter(p => /保安|安检员/.test(p.look));
  const target = binding ?? (named.length === 1 ? named[0] : ids.length ? undefined : /最近/.test(input) ? [...people].sort((a,b)=>Math.hypot(a.position.x-context.self.position.x,a.position.y-context.self.position.y)-Math.hypot(b.position.x-context.self.position.x,b.position.y-context.self.position.y))[0] : people.length === 1 ? people[0] : undefined);
  for (const r of requirements) {
    if (plan.steps.some(s=>matches(r,s)) || !target || plan.steps.length >= 8) continue;
    let step: PlanStep | undefined;
    if (r.kind === "strike" && !/用.*(?:伞|瓶|刀|棍|枪)/.test(input)) step = { op: "strike", npcId: target.id, aim: /击晕|打晕/.test(r.text) ? "knockout" : "hurt", pursue: true };
    if (["push", "restrain", "release"].includes(r.kind)) step = { op: r.kind as "push" | "restrain" | "release", npcId: target.id };
    if (r.kind === "snatch") {
      const kind = explicitPhysicalIntent(input.slice(r.start))?.itemKind;
      if (kind) step = { op: "snatch", npcId: target.id, itemKind: kind, pursue: true };
    }
    if (speechKinds.includes(r.kind)) step = { op: "talk", npcId: target.id, message: input.slice(0,200), goal: r.kind as "ask_ticket" | "threaten" | "trade" | "yield" };
    // A trade without a concrete offered item must remain visible as missing.
    if (r.kind === "trade") step = undefined;
    if (step) {
      applyRequirementCondition(step, r);
      plan.steps.push(step); changes.push(`补回“${r.text}”对应的 ${step.op}；目标 ${target.id} 来自可见上下文`);
    }
  }
  const explicitOrder = /先|然后|接着|再|打完|之后|以后|之前/.test(input);
  if (explicitOrder) {
    const before = JSON.stringify(plan.steps);
    const ordered=[...requirements];
    const beforeWord=input.match(/之前|以前|前先/);
    if(beforeWord) {
      const left=[...ordered].reverse().find(r=>r.start<beforeWord.index!), right=ordered.find(r=>r.start>beforeWord.index!);
      if(left&&right) { const i=ordered.indexOf(right); ordered.splice(i,1); ordered.splice(ordered.indexOf(left),0,right); }
    }
    const rank = (s: PlanStep) => s.op === "approach" ? -1 : Math.min(...ordered.flatMap((r,i)=>matches(r,s)?[i]:[]), Number.MAX_SAFE_INTEGER);
    plan.steps.sort((a,b)=>rank(a)-rank(b));
    if (JSON.stringify(plan.steps)!==before) changes.push("按原文动作出现的明确顺序修正步骤；没有固定先对话");
  }
  const strikeFirst = /(?:直接|先)[^，。；]{0,18}(?:殴打|击打|打晕|击晕)|打完/.test(input);
  if (strikeFirst) {
    const i=plan.steps.findIndex(s=>s.op==="strike"), talk=plan.steps.findIndex(s=>s.op==="talk");
    if (i>talk && talk>=0) { const [s]=plan.steps.splice(i,1); plan.steps.splice(talk,0,s); changes.push("保留先击打、后语言的明确要求"); }
  }
  if (/不让(?:他|她|对方)?逃跑/.test(input)) {
    const i=plan.steps.findIndex(s=>s.op==="restrain"), j=plan.steps.findIndex(s=>s.op==="talk");
    if(i>j && j>=0) { const [hold]=plan.steps.splice(i,1); plan.steps.splice(j,0,hold); changes.push("为限制谈话期间逃跑，将身体控制放在交谈前；控制仍可能失败或到期"); }
  }
  if (target && /强迫|强制/.test(input) && /票/.test(input) && requirements.some(r=>r.kind==="strike"||r.kind==="restrain") && !plan.steps.some(s=>s.op==="snatch") && plan.steps.length<8) {
    plan.steps.push({op:"snatch",npcId:target.id,itemKind:"ticket",when:"incapacitated_or_refused",pursue:true});
    changes.push("强迫取得车票需要实际物品转移：补充失能或对话拒绝后取票的独立尝试，不能以台词代替交付");
  }
  for (const s of plan.steps) {
    if (s.op === "vault" && guardCondition && !s.preconditions?.some(c => c.kind === "guards_not_watching")) {
      s.preconditions = [...(s.preconditions ?? []), { kind: "guards_not_watching", text: "保留原文条件：保安未注视时才翻越" }];
      changes.push("将保安注意力条件保留为翻越前检查，不从绝对方向推定已经满足");
    }
    const r = requirements.find(r=>matches(r,s));
    if (r?.conditional && !conditionCovered(r, s)) { applyRequirementCondition(s, r); changes.push(`补回“${r.conditionText || r.text}”对应的执行条件`); }
    if (s.op === "strike" && "npcId" in s && /击晕|打晕/.test(input) && s.aim!=="knockout") { s.aim="knockout"; changes.push("恢复明确要求的击晕目标"); }
    if (["strike","snatch","restrain","push"].includes(s.op)) s.pursue = true;
  }
  if (/边.+边|同时|一边/.test(input)) {
    const i=plan.steps.findIndex(s=>["strike","push","restrain","snatch"].includes(s.op)), j=plan.steps.findIndex(s=>s.op==="talk");
    if(i>=0&&j>=0) { const [talk]=plan.steps.splice(j,1); const body=plan.steps.findIndex(s=>["strike","push","restrain","snatch"].includes(s.op)); talk.timing="with_previous"; plan.steps.splice(body+1,0,talk); changes.push("按同时表达启动语言与动作，分别记录结果"); }
  }
  if (!plan.steps.length) {plan.status="unsupported";plan.reason="计划内容与原文限制不符，移除未授权动作后没有可执行步骤";}
  return finish();
}
