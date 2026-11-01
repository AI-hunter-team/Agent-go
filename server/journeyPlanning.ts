import { retainJourneyGuidance, type JourneyInput, type JourneyPlan } from "../src/shared/journey";
import { guidanceSources, verifiedCoverage } from "../src/shared/guidanceSources";
import { explicitPhysicalIntent } from "../src/shared/physicalIntent";
import { unknownJourneyTargets } from "./actionKnowledge";
import type {PublicStationMap} from "../src/shared/world";

/** Default principles fill omissions, never force an opposite route onto player goals. */
export function defaultJourneyPlan(input:JourneyInput, reason="模型未提供可读取的方案，先展示基础准备稿；原指导仍完整传给角色。已有计划不代表动作必然成功。"):JourneyPlan {
  const original=input.autonomous?"":input.guidance;
  const plan:JourneyPlan={
    understanding:`目标是在${input.settings.timeLimitSeconds}秒内登上地铁并进入车厢。${original ? `按你的完整指导规划：\n${original}` : "未填写额外指导，结合现场自主选择路径。"}`,
    actions:["根据当前位置与公开地图选择必要的观察，确认可用通道和保安当前视线。",original ? "围绕原指导安排下一项尝试，保留目标、偏好、先后与条件；具体准备根据现场需要自主决定，不假设条件已满足。" : "结合实际距离、队伍和通道状态，选择通往终点的可行路径；现场信息不足时先观察。","按真实行动结果继续调整，通过闸机后前往楼梯或扶梯入口，再使用下行动作到达站台。"],
    adjustment:"用户明确要求优先于默认建议；情况变化时补充观察和准备，不伪造成功，不因默认路线而删除原要求。",
    preparation:{source:"default",notes:[reason]},
  };
  return retainJourneyGuidance(plan,original);
}
const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v === "object" && !Array.isArray(v);
function text(value:unknown):string {
  if(typeof value === "string")return value;
  if(Array.isArray(value))return value.map(text).filter(v=>v.trim()).join("\n");
  if(record(value)) {
    for(const key of ["instruction","text","description","content","action"]) if(typeof value[key] === "string" && Object.keys(value).length===1)return value[key] as string;
    return JSON.stringify(value);
  }
  return "";
}

/** Initial plans are proposals, not an executable eight-step program. */
export function adaptJourneyPlan(value:unknown,input:JourneyInput,map?:PublicStationMap):JourneyPlan {
  const base=defaultJourneyPlan(input),original=input.autonomous?"":input.guidance;
  const notes:string[]=[],row=record(value)?value:{};
  const understanding=text(row.understanding??row.summary??row["我的理解"]);
  const adjustment=text(row.adjustment??row.contingency??row["遇到变化"]);
  const rawActions=row.actions??row.steps??row.plan??row.strategy??row["准备尝试"]??(typeof value === "string" || Array.isArray(value)?value:undefined);
  const actions=(Array.isArray(rawActions)?rawActions.map(text):[text(rawActions)]).filter(t=>t.trim());
  if (!understanding.trim() && !adjustment.trim() && !actions.length) return base;
  if(!understanding.trim())notes.push("理解部分由默认目标与完整原文补充。");
  if(!adjustment.trim())notes.push("未单列变化应对，已补充默认观察与调整原则。");
  if(!actions.length)notes.push("未单列行动段落，已补充基础准备步骤；不是已执行动作。");
  const coverage=Array.isArray(row.coverage)?row.coverage:Array.isArray(row.requirements)?row.requirements.map(r=>record(r)?{...r,sourceId:r.id}:r):[];
  const corrected=coverage.map(r=>{
    if(record(r) && r.kind === "prohibition" && guidanceSources(original).some(s=>s.id===r.sourceId && explicitPhysicalIntent(s.text))) {
      notes.push("模型把正向游戏动作误标为禁止，已撤销该对应判断；原文优先，该项待核对。");
      return {...r,kind:"method",handling:"unverified",steps:[],explanation:"原文是动作要求，不是禁止条件；保留原文，尚未核对方案对应。"};
    }
    return r;
  });
  if(original && !verifiedCoverage(corrected,original,actions.length||base.actions.length))notes.push("原文已逐项保留；缺失或无效的对应说明标为尚未核对，不阻止形成方案。");
  const plan:JourneyPlan={understanding:understanding.trim()?understanding:base.understanding,actions:actions.length?actions:base.actions,adjustment:adjustment.trim()?adjustment:base.adjustment};
  const unknown=unknownJourneyTargets(plan,map);
  if(unknown.length)notes.push(`草稿中地点 ${unknown.join("、")} 不在公开地图内；行动时须重新按真实地图选点，不能视为已到达。`);
  const prior=record(row.preparation)?row.preparation:undefined;
  if(prior && (prior.source==="adapted" || prior.source==="default") && Array.isArray(prior.notes)) {
    plan.preparation={source:prior.source,notes:[...new Set([...prior.notes.filter((n):n is string=>typeof n === "string"),...notes])]};
  } else if(notes.length) plan.preparation={source:"adapted",notes:[...new Set(notes)]};
  return retainJourneyGuidance(plan,original,corrected);
}
