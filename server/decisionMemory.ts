import type { AgentTurn } from "../src/shared/types";
import type { Session } from "./sessions";
import { untrustedData } from "./security";

export function decisionStage(turn:AgentTurn):string {
  const self=turn.observation.self;
  return self.passedGate?"下行":self.screened?"闸机":self.hasTicket?"安检":"购票或安检前";
}
/** Retain exact actions/results, not every obsolete crowd snapshot. Original guidance/plan remain separate. */
export function prepareDecisionMemory(session:Session,turn:AgentTurn):string {
  const memory=session.actionMemory??=[];
  const witnessed=session.witnessedEvents??={};
  for(const event of [...(turn.observation.recentEvents??[]),...(turn.observation.people??[]).flatMap(p=>p.evidence??[])])witnessed[event.id]=structuredClone(event);
  if(session.lastAction){memory.push({...session.lastAction,result:structuredClone(turn.lastResult),triggers:structuredClone(turn.triggers)});delete session.lastAction;}
  const stage=decisionStage(turn),changed=stage!==session.previousStage;
  session.previousStage=stage;
  const candidates=turn.observation.facilities.flatMap(f=>f.people??[]).filter(p=>typeof p.distance==="number"&&p.distance<=3).map(p=>p.id);
  const talks=memory.filter(m=>m.stage===stage && (m.action.type==="talk"||m.action.type==="request_cut_in"));
  return untrustedData("当前策略执行核对",{
    stage,stageChanged:changed,originalGuidance:session.guidance,
    negotiation:/谈判|交涉|插队|协商/.test(session.guidance)?{
      status:talks.length?`本阶段已发起${talks.length}次交涉`:"本阶段尚未交涉，前一阶段拒绝不等于本阶段失败",
      nearbyVisibleQueuePeople:[...new Set(candidates)],
      instruction:"结合原文决定是否交涉；若暂缓，在reason说明当前距离、时间或现场依据。接口异常不代表拒绝。",
    }:undefined,
  });
}

export function compactDecisionHistory(session:Session):string {
  const ends:number[]=[];
  session.responseItems.forEach((item,i)=>{if(item.type==="function_call_output" || item.type==="message"&&item.role==="user")ends.push(i);});
  if(ends.length>4) session.responseItems.splice(0,ends[ends.length-5]+1);
  const memory=session.actionMemory??[];
  // Complete recent tool/reasoning exchanges are kept verbatim; old exact action/result facts are bounded by the run budget.
  return memory.length>4?untrustedData("较早行动事实（原始指导与完整方案未删改）",{actions:memory.slice(0,-4),witnessedEvents:Object.values(session.witnessedEvents??{})}):"";
}
