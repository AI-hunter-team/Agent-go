import { expect,test } from "vitest";
import { adaptJourneyPlan, defaultJourneyPlan } from "../server/journeyPlanning";
import { planToNormalized,validPlan,type JourneyInput } from "../src/shared/journey";
import { validateNormalized } from "../server/security";
import { buildSystemPrompt } from "../server/prompts";
import { fake,jsonResponse,response } from "./responsesSupport";
import { DebugLogger,traceOperation } from "../server/debug";
import type { OperationDebug } from "../src/shared/debug";

const input:JourneyInput={sceneId:"metro",seed:1,settings:{timeLimitSeconds:150,extraQueuePeople:3},guidance:"想办法引开保安注意翻越栏杆。不买票。直接抢有票乘客的票",autonomous:false,runId:"journey-tolerance"};
const longPlan={understanding:"按原文规划。".repeat(250),actions:Array.from({length:24},(_,i)=>`步骤${i+1}：${"完整保留这个条件和细节。".repeat(100)}`),adjustment:"依据真实观察调整，不保证成功。".repeat(100)};
test("proposals longer than eight steps, 1000 characters and 8000 total retain every character",()=>{
  const plan=adaptJourneyPlan(longPlan,input);
  expect(validPlan(plan)).toBe(true);expect(plan.actions).toEqual(longPlan.actions);expect(plan.understanding).toBe(longPlan.understanding);
  expect(()=>validateNormalized(planToNormalized(plan))).not.toThrow();
  const prompt=buildSystemPrompt(input.guidance,planToNormalized(plan),input.settings,undefined,plan).guidance;
  expect(prompt).toContain(longPlan.actions[23]);expect(prompt).toContain(input.guidance);
});
test.each([
  {actions:"先按指导找目标，再根据现场情况准备道具。"},
  {steps:[{instruction:"确认可见目标"},{text:"寻找并拿取易拉罐"}]},
  ["先寻找易拉罐","投掷后观察视线"],
  {"我的理解":"按用户原意","准备尝试":["先观察","再判断"],"遇到变化":"补充观察"},
  "先寻找持票目标，按原指导尝试；缺道具先准备，条件变化时重观察。",
  {understanding:"保留原指导",actions:[]},
  null,{},[],
])("different provider shapes always produce a reviewable proposal without demanding user fields: %j",value=>{
  const p=adaptJourneyPlan(value,input);expect(validPlan(p)).toBe(true);expect(p.sourceGuidance).toBe(input.guidance);
  expect(p.requirements?.map(r=>r.text).join("")).toBe(input.guidance);
  expect(p.actions.join(" ")).not.toContain("改为买票");
});
test("object-shaped proposal steps preserve their conditions and extra detail",()=>{
  const p=adaptJourneyPlan({actions:[{instruction:"翻越栏杆",condition:"只有保安没看我时",preparation:"先取得易拉罐"}]},input);
  expect(p.actions[0]).toContain("只有保安没看我时");expect(p.actions[0]).toContain("先取得易拉罐");
});
test("basic proposals distinguish defaults from model success and do not invent compliance",()=>{
  const base=defaultJourneyPlan(input);expect(base.preparation?.source).toBe("default");
  expect(base.understanding).toContain(input.guidance);expect(base.requirements?.every(r=>r.handling==="unverified")).toBe(true);
  const autonomous=defaultJourneyPlan({...input,guidance:"",autonomous:true});expect(autonomous.sourceGuidance).toBeUndefined();
});
test("plain prose, missing coverage and incomplete provider output do not become format dead ends",async()=>{
  const prose="先确认视线与持物，再按完整指导分步尝试。";
  const plain=response({output:[{type:"message",role:"assistant",content:[{type:"output_text",text:prose}]}]});
  const p=await fake([plain]).service.prepareJourney(input);expect(p.actions).toEqual([prose]);expect(p.sourceGuidance).toBe(input.guidance);
  const truncated=await fake([jsonResponse({actions:["未完成的草稿"]},{status:"incomplete"})]).service.prepareJourney(input);
  expect(truncated.preparation?.source).toBe("default");expect(truncated.actions).not.toEqual(["未完成的草稿"]);
});
test("a provider failure returns a labeled basic proposal with one request and preserves diagnostics",async()=>{
  const captured:OperationDebug[]=[];
  class Logger extends DebugLogger { override async write(event:Record<string,unknown>) { if(event.debug)captured.push(event.debug as OperationDebug); } }
  const raw="{broken proposal";
  const f=fake([response({output:[{type:"message",role:"assistant",content:[{type:"output_text",text:raw}]}]})]);
  const result=await traceOperation({operation:"normalize",runId:input.runId,sessionId:null},{},new Logger(false),()=>f.service.prepareJourney(input));
  expect(f.requests).toHaveLength(1);expect(result.value.preparation?.source).toBe("default");
  expect(captured[0].planning).toMatchObject({outputText:raw,source:"default",problem:expect.any(String)});
});
