import { expect, test } from "vitest";
import { createFixtureEngine } from "./fixtures/scenarios";
import { buildIntentContext, parsePlan } from "../src/sim/intent";
import { reconcileInstruction } from "../src/sim/actions/instructionAudit";
import { parseToolUse } from "../server/tools";
import { interpret } from "../server/boss";
import { PresentationBuffer, sampleItem, sampleActor } from "../src/ui/presentation";
import { preconditionError } from "../src/sim/actions/preconditions";
import type { ActionPlan, ItemKind, PlanStep } from "../src/shared/types";
import { fake, jsonResponse } from "./responsesSupport";
import { guidanceSources } from "../src/shared/guidanceSources";
import { GameRunner } from "../src/agent/runner";

const plan=(steps:PlanStep[]):ActionPlan=>({status:"plan",steps,summary:"尝试",reason:"",source:"llm"});
function fixture(kind:ItemKind="can", facing=Math.PI) {
  const e=createFixtureEngine(undefined,[{id:"throw-guard",label:"现场保安",route:[{x:22,y:11}],facing,speed:.9,pauseSeconds:0}]);
  e.player.pos={x:25.3,y:10}; e.takeTriggers();
  const item=e.world.items.spawn(kind,{type:"held",personId:"player",slot:"hand"},"player");
  return {e,item};
}
function launch() {
  const {e,item}=fixture();
  const parsed=parseToolUse("throw_item",{itemId:item.id,x:20,y:10,reason:"引开保安后重新观察"});
  if (!("action" in parsed)) throw new Error(parsed.error);
  expect(e.applyAction(parsed.action).ok).toBe(true);
  for(let i=0;i<20 && e.executor.busy;i++) e.step();
  return {e,item};
}

test("a can releases, has a real flight, lands once, and becomes observable and retrievable",()=>{
  const {e,item}=launch();
  expect(item.location.type).toBe("flight");
  expect(e.world.items.holdings("player").some(i=>i.id===item.id)).toBe(false);
  expect(e.observe().items?.some(i=>i.id===item.id)).toBe(false); // Cannot pick up an airborne item.
  const release=e.events.events.find(v=>v.kind==="item_thrown" && v.itemId===item.id)!;
  expect(release).toMatchObject({pos:{x:25.3,y:10},loudness:0,trajectory:{from:{x:25.3,y:10},to:{x:20,y:10}}});
  expect(e.events.events.some(v=>v.trajectory && v.kind==="item_dropped")).toBe(false);
  for(let i=0;i<6;i++) e.step();
  expect(item.location).toEqual({type:"ground",pos:{x:20,y:10}});
  const lands=e.events.events.filter(v=>v.itemId===item.id && v.kind==="item_dropped" && v.trajectory);
  expect(lands).toHaveLength(1); expect(lands[0].loudness).toBe(9);
  expect(e.observe().items?.find(i=>i.id===item.id)).toMatchObject({kind:"can",where:"ground:20,10"});
  for(let i=0;i<10;i++) e.step();
  expect(e.events.events.filter(v=>v.itemId===item.id && v.trajectory && v.kind==="item_dropped")).toHaveLength(1);
  expect(e.world.items.transfers.filter(t=>t.itemId===item.id).map(t=>t.how)).toEqual(["spawn","throw","land"]);
  expect(e.applyAction({type:"take",itemId:item.id,reason:"取回易拉罐"}).ok).toBe(true);
});

test("an actual landing makes a nearby guard walk and face away, enabling a conditional attempt",()=>{
  const {e}=launch(),g=e.guards.guards[0];
  const origin={...g.pos};
  for(let i=0;i<12;i++) e.step();
  expect(g.mode).toBe("investigate"); expect(g.investigation?.point).toEqual({x:20,y:10});
  expect(g.pos.x).toBeLessThan(origin.x); expect(e.guards.canSee(g,e.player.pos)).toBe(false);
  const p=new PresentationBuffer(e),pose={x:0,y:0,z:0,yaw:0};
  sampleActor(p,g.def.id,1,pose); expect(pose.x).toBe(g.pos.x); expect(pose.yaw).toBeCloseTo(Math.PI/2-g.facing);
  const step:PlanStep={op:"vault",obstacle:"railing",preconditions:[{kind:"guards_not_watching",text:"保安未注视才翻"}]};
  expect(preconditionError(step,e.world,e.guards)).toBeNull();
  expect(e.executor.start(plan([step])).ok).toBe(true); // Opportunity now, not a guarantee for the whole vault.
});

test("the captured west-facing security guard can turn away from the player toward a can landing",()=>{
  const e=createFixtureEngine(undefined,[{id:"security-S2",label:"2号安检员",role:"security_staff",route:[{x:28.5,y:12.5}],facing:Math.PI,speed:.9,pauseSeconds:0}]);
  e.player.pos={x:25.3,y:10};const g=e.guards.guards[0];
  const item=e.world.items.spawn("can",{type:"held",personId:"player",slot:"hand"},"player");
  expect(e.guards.canSee(g,e.player.pos)).toBe(true);
  expect(e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:{x:30,y:10},reason:"引开视线后重观察"}).ok).toBe(true);
  for(let i=0;i<23;i++)e.step();
  expect(item.location).toEqual({type:"ground",pos:{x:30,y:10}});
  expect(g.investigation?.point).toEqual({x:30,y:10});expect(g.pos.x).toBeGreaterThan(28.5);
  expect(e.guards.canSee(g,e.player.pos)).toBe(false);
  const view=e.observe().guards.find(entry=>entry.id===g.def.id)!;
  expect(view.sight?.canSeeYou).toBe(false);expect(view.doing).toContain("前往动静处查看");
});

test("a guard already watching an identified actor is not redirected by a later can landing",()=>{
  const {e,item}=fixture("can",0);
  const warning=e.events.emit({t:e.t,kind:"odd_behaviour",severity:"suspicious",actorId:"player",pos:{...e.player.pos},loudness:0});
  e.events.beginAct({actorId:"player",kind:warning.kind,severity:warning.severity,eventId:warning.id});
  e.resolveInteractions(0); e.events.endAct("player");
  expect(e.guards.guards[0].mode).toBe("watch");
  expect(e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:{x:20,y:10},reason:""}).ok).toBe(true);
  for(let i=0;i<25;i++) e.step();
  expect(e.guards.guards[0].mode).toBe("watch");
  expect(e.guards.guards[0].watching?.subjectId).toBe("player");
});

test("remote intentions settle closer; missing inventory and a silent landing do not fake a distraction",()=>{
  const {e,item}=fixture();
  expect(e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:{x:12,y:4},reason:""}).ok).toBe(true);
  expect(item.location.type).toBe("held");
  expect(e.applyAction({type:"drop",itemId:"invented",mode:"throw",atPosition:{x:20,y:10},reason:""}).ok).toBe(false);
  const quiet=fixture("ticket");
  expect(quiet.e.applyAction({type:"drop",itemId:quiet.item.id,mode:"throw",atPosition:{x:25,y:15},reason:""}).ok).toBe(true);
  for(let i=0;i<25;i++) quiet.e.step();
  expect(quiet.e.guards.guards[0].mode).toBe("patrol");
});

test("a person leaving the committed landing point is not hit by a homing projectile",()=>{
  const e=createFixtureEngine(); e.player.pos={x:7,y:15};
  const target=e.world.addPerson("normal",{x:9,y:15});target.activity={kind:"waiting",remaining:100};
  const item=e.world.items.spawn("can",{type:"held",personId:"player",slot:"hand"},"player");
  expect(e.executor.start(plan([{op:"drop",itemId:item.id,mode:"throw",at:{kind:"person",id:target.id}}])).ok).toBe(true);
  for(let i=0;i<20 && e.executor.busy;i++)e.step();
  if (item.location.type!=="flight") throw new Error("Expected an actual flight");
  const landing={...item.location.trajectory.to};target.pos={x:15,y:18};
  for(let i=0;i<6;i++)e.step();
  expect(item.location).toEqual({type:"ground",pos:landing});
  expect(e.events.events.some(v=>v.kind==="collision" && v.itemId===item.id)).toBe(false);
});

test("presentation samples flight and landing coordinates copied from the world",()=>{
  const {e,item}=launch(),buffer=new PresentationBuffer(e),pose={x:0,y:0,z:0,spin:0};
  sampleItem(buffer,item.id,1,pose); expect(pose.x).toBeCloseTo(25.3); expect(pose.y).toBeCloseTo(1);
  for(let i=0;i<3;i++) e.step(); buffer.capture(e);
  sampleItem(buffer,item.id,1,pose); expect(pose.x).toBeLessThan(25.3); expect(pose.x).toBeGreaterThan(20); expect(pose.y).toBeGreaterThan(.16);
  for(let i=0;i<3;i++) e.step(); buffer.capture(e);
  sampleItem(buffer,item.id,1,pose); expect(pose).toMatchObject({x:20,z:10,y:.16});
  expect(buffer.previous.items.find(i=>i.id===item.id)?.trajectory?.to).toEqual({x:20,y:10});
});

test("the captured purpose wording cannot become an immediate vault or an empty noise",async()=>{
  const {e,item}=fixture(),context=buildIntentContext(e.world,e.guards);
  const input=`将手中易拉罐（${item.id}）向空地（x=20,y=10）投掷，利用落地声响吸引保安，为随后翻越栏杆制造时机。`;
  const fallback=parsePlan(input,context);
  expect(fallback.steps).toEqual([{op:"drop",itemId:item.id,mode:"throw",atPosition:{x:20,y:10}}]);
  const bad=await interpret(async()=>plan([{op:"vault",obstacle:"railing"},{op:"make_noise",level:"mid"}]),input,context);
  expect(bad.status).toBe("needs_precondition"); expect(bad.steps).toEqual([]); expect(bad.translation?.instruction).toBe(input);
  const good=reconcileInstruction(input,plan([{op:"drop",itemId:item.id,mode:"throw",atPosition:{x:20,y:10}},{op:"vault",obstacle:"railing"}]),context).plan;
  expect(good.steps).toHaveLength(1); expect(good.steps[0].op).toBe("drop");
  expect(parsePlan("扔易拉罐",context).status).toBe("needs_precondition");
});

test("a combined throw-then-vault preserves real transfer and action ordering",()=>{
  const {e,item}=fixture(),text=`向(x=20,y=10)投掷易拉罐制造声音，然后翻越栏杆`;
  const parsed=parsePlan(text,buildIntentContext(e.world,e.guards));
  expect(parsed.steps.map(s=>s.op)).toEqual(["drop","vault"]);
  const checked=reconcileInstruction(text,plan([...parsed.steps].reverse()),buildIntentContext(e.world,e.guards)).plan;
  expect(checked.steps.map(s=>s.op)).toEqual(["drop","vault"]);
  expect(item.kind).toBe("can");
});

test("initial planning receives physical capabilities and corrects a reversed prohibition without blocking",async()=>{
  const input={sceneId:"metro" as const,seed:1,settings:{timeLimitSeconds:150,extraQueuePeople:3},guidance:"击晕乘客，抢夺车票。",autonomous:false,runId:"can-flow"};
  const coverage=guidanceSources(input.guidance).map(s=>({sourceId:s.id,kind:"method",handling:"planned",steps:[1,2],explanation:"尝试后由环境裁定"}));
  const data={understanding:input.guidance,actions:["找到可见目标后尝试击晕","实际抢夺持有的车票"],adjustment:"根据真实结果重观察",coverage};
  const f=fake([jsonResponse(data)]); await f.service.prepareJourney(input);
  expect(f.requests[0].body.instructions).toContain("strike击打"); expect(f.requests[0].body.instructions).not.toContain("can落地听觉半径9米");
  const invalid={...data,coverage:coverage.map(r=>({...r,kind:"prohibition",handling:"unsupported",steps:[]}))};
  const corrected=await fake([jsonResponse(invalid)]).service.prepareJourney(input);
  expect(corrected.sourceGuidance).toBe(input.guidance);
  expect(corrected.requirements?.[0]).toMatchObject({kind:"method",handling:"unverified"});
  expect(corrected.preparation?.notes.join(" ")).toContain("误标为禁止");
});

test("the formal GameRunner executes the same throw and subsequent guard movement",async()=>{
  const {e,item}=fixture();
  let count=0;
  const runner=new GameRunner(e,{kind:"llm",dispose:async()=>{},decide:async()=>({action:++count===1?{type:"drop",itemId:item.id,mode:"throw",atPosition:{x:20,y:10},reason:"尝试引开保安"}:{type:"wait",seconds:2,reason:"观察实际反应"},model:"fixture",usage:null,thinking:null,latencyMs:0,error:null})},async()=>({mechanic:"unsupported",source:"keywords",reason:""}),{guidance:"用易拉罐引开保安，等他不看我时再翻越。"});
  e.notify("start","隔离的正式运行器验收"); runner.start();
  while(e.t<3.5 && runner.phase!=="ended") {if(runner.pending) await runner.pending; else runner.advance(1);}
  expect(runner.decisions[0].action).toMatchObject({type:"drop",mode:"throw",atPosition:{x:20,y:10}});
  expect(item.location).toEqual({type:"ground",pos:{x:20,y:10}});
  expect(e.guards.guards[0].pos.x).toBeLessThan(22);
  expect(e.events.events.some(v=>v.kind==="vault")).toBe(false); // The runner never invents a follow-up vault.
  runner.stop();
});
