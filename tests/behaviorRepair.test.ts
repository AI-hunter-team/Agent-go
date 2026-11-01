import {expect,test} from "vitest";
import {createFixtureEngine} from "./fixtures/scenarios";
import {ReviewRecorder} from "../src/agent/reviewRecorder";
import {getReplayFrame} from "../src/replay/trajectory";
import {SessionStore} from "../server/sessions";
import {fake,jsonResponse,response,toolCall,turn} from "./responsesSupport";
import {publicActionKnowledge} from "../server/actionKnowledge";
import {defaultJourneyPlan} from "../server/journeyPlanning";
import {respond} from "../server/npcDialogue";
import type {AgentTurn} from "../src/shared/types";
import {generatePersona} from "../src/sim/persona";
import {Rng} from "../src/sim/rng";
import {buildReviewInput} from "../src/shared/review";
import {failedReport} from "./reviewFixture";
import {createApp} from "../server/app";
import type {AddressInfo} from "node:net";
import {stationAtlas,replayMapFrame} from "../src/ui/stationMap";
import {createWorldV2} from "../src/sim/worldV2";

function throwable(){const e=createFixtureEngine(undefined,[{id:"test-guard",label:"保安",route:[{x:22,y:11}],facing:Math.PI,speed:.9,pauseSeconds:0}]);e.player.pos={x:25.3,y:10};e.takeTriggers();const item=e.world.items.spawn("can",{type:"held",personId:"player",slot:"hand"},"player");return {e,item};}
test.each([{x:24,y:22},{x:20,y:18}])("the captured distant throw $x,$y releases and lands closer instead of being rejected",target=>{
  const {e,item}=throwable();expect(e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:target,reason:"引开注意"}).ok).toBe(true);
  expect(e.events.events.some(v=>v.itemId===item.id&&(v.kind==="item_thrown"||v.kind==="item_dropped"))).toBe(false);
  for(let i=0;i<17;i++)e.step();
  expect(item.location.type).toBe("ground");const end=e.world.items.position(item)!;
  expect(Math.hypot(end.x-25.3,end.y-10)).toBeCloseTo(6,4);
  expect(end).not.toEqual(target);expect(e.world.items.transfers.filter(t=>t.itemId===item.id).map(t=>t.how)).toEqual(["spawn","throw","land"]);
  expect(e.events.events.find(v=>v.kind==="item_dropped"&&v.itemId===item.id)?.pos).toEqual(end);
  const release=e.events.events.filter(v=>v.kind==="item_thrown"&&v.itemId===item.id);expect(release).toHaveLength(1);
  expect(e.events.events.find(v=>v.kind==="item_dropped"&&v.itemId===item.id)?.causeId).toBe(release[0].id);
});
test("a pillar stops the actual projectile at its near side, preserving a ground endpoint",()=>{
  const {e,item}=throwable();e.player.pos={x:32,y:12};e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:{x:40,y:12},reason:""});
  for(let i=0;i<17;i++)e.step();const point=e.world.items.position(item)!;expect(item.location.type).toBe("ground");expect(point.x).toBeGreaterThan(34);expect(point.x).toBeLessThan(35);expect(point.y).toBe(12);
});
test("an interface error is not a refusal, does not spend a round and cannot trigger a conditional attack",()=>{
  const e=createFixtureEngine();e.player.pos={x:7,y:15};const n=e.world.addPerson("normal",{x:8,y:15});
  expect(e.executor.start({status:"plan",summary:"先问后根据拒绝行动",reason:"",source:"keywords",steps:[{op:"talk",npcId:n.id,message:"请让我先走",goal:"chat"},{op:"strike",npcId:n.id,aim:"knockout",when:"previous_refused"}]}).ok).toBe(true);
  for(let i=0;i<10&&!e.dialogue.pendingDialogue;i++)e.step();
  const result=e.dialogue.apply({reply:"暂不可用",decision:"refuse",give:null,want:null,reason:"接口异常",source:"error"});
  expect(result.ok).toBe(false);expect(result.text).toContain("不代表拒绝");expect(e.dialogue.history.get(n.id)).toBeUndefined();
  for(let i=0;i<10;i++)e.step();expect(e.events.events.some(v=>v.kind==="strike")).toBe(false);
  expect(e.applyAction({type:"talk",npcId:n.id,message:"现在方便答复吗",goal:"chat",reason:""}).ok).toBe(true);
});
test("NPC malformed fields are diagnosed without exposing provider response text",async()=>{
  const request={npc:{id:"n1",...generatePersona(new Rng(1),"normal"),alert:{level:"none" as const,cause:null},memory:[],holdings:[],queue:null},speaker:{look:"乘客",holding:[]},goal:"chat" as const,message:"你好",offer:null,history:[]};
  const r=await respond(async()=>({reply:"正常句子",decision:"mystery",give:null,want:null,reason:"思考"}),request);
  expect(r.source).toBe("error");expect(r.reason).toContain("decision");expect(r.reply).toContain("不代表拒绝");
});
test("planning avoids an unsolicited item itinerary, but runtime and explicitly requested props stay available",async()=>{
  const input={sceneId:"metro" as const,seed:1,settings:{timeLimitSeconds:150,extraQueuePeople:3},guidance:"不买票，保安不注意时翻过去",autonomous:false,runId:"repair"};
  const f=fake([jsonResponse({understanding:input.guidance,actions:["观察视线，必要时分散注意力"],adjustment:"根据现场决定"})]);await f.service.prepareJourney(input);
  expect(f.requests[0].body.instructions).toContain("不提前展开为固定准备步骤");expect(f.requests[0].body.instructions).not.toContain("can落地听觉半径9米");
  expect(JSON.stringify(defaultJourneyPlan(input))).not.toContain("没有道具先寻找");
  expect(publicActionKnowledge("planning","投掷易拉罐")).toContain("can落地听觉半径9米");expect(publicActionKnowledge()).toContain("convenience");
});
test("long histories keep original guidance, earlier exact facts and recent complete reasoning/tool exchanges",async()=>{
  const responses=Array.from({length:9},(_,i)=>response({output:[{type:"reasoning",summary:[],encrypted_content:`opaque-${i}`},toolCall(JSON.stringify({seconds:2,reason:`暂缓${i}`}),`memory-${i}`,"wait")]}));
  const f=fake(responses),s=new SessionStore().create("购票和安检都优先交涉",null);
  for(let i=0;i<9;i++){const t:AgentTurn=turn();t.observation.t=i;t.lastResult={ok:true,text:`真实结果${i}`};if(i===0)t.observation.recentEvents=[{id:"witness-0",t:0,kind:"purchase_completed",personId:"seen-p1",position:{x:7,y:5},text:"亲眼看到seen-p1取票"}];if(i>=5)t.observation.self.hasTicket=true;expect((await f.service.decide(s,t)).action).not.toBeNull();}
  const sent=f.requests.at(-1)!.body.input,raw=JSON.stringify(sent);
  expect(raw).toContain("购票和安检都优先交涉");expect(raw).toContain("真实结果1");expect(raw).toContain("安检");expect(raw).toContain("本阶段尚未交涉");
  expect(raw).toContain("亲眼看到seen-p1取票");
  expect(sent.filter((i:any)=>i.type==="function_call").length).toBeLessThanOrEqual(4);
  for(const call of sent.filter((i:any)=>i.type==="function_call"))expect(sent.some((i:any)=>i.type==="function_call_output"&&i.call_id===call.call_id)).toBe(true);
  expect(sent.some((i:any)=>i.type==="reasoning"&&i.encrypted_content==="opaque-7")).toBe(true);
});
test("new replay frames track flight, real guard investigation and facility changes, without leaking to review input",()=>{
  const {e,item}=throwable(),r=new ReviewRecorder();r.capture(e);e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:{x:20,y:10},reason:""});
  for(let i=0;i<40;i++){e.step();r.capture(e);}
  e.world.setStatus("S1","closed","测试停用");r.capture(e);
  const report={...failedReport(),elapsed:e.t,trail:e.trail,worldSnapshots:r.snapshot(),replayMotion:r.motionSnapshot()};
  const air=getReplayFrame(report,1.25),ground=getReplayFrame(report,2.4),end=getReplayFrame(report,e.t);
  const flying=air.motion!.items.find(i=>i.id===item.id)!;
  expect(flying.trajectory).toBeDefined();expect(flying.position.x).toBeGreaterThan(20);expect(flying.position.x).toBeLessThan(25.3);
  expect(ground.motion!.items.find(i=>i.id===item.id)?.position).toEqual({x:20,y:10});expect(ground.motion!.guards[0].mode).toBe("investigate");
  expect(end.world!.facilities.find(f=>f.id==="S1")?.status).toBe("closed");expect(air.world!.facilities.find(f=>f.id==="S1")?.status).toBe("open");
  expect(JSON.stringify(buildReviewInput(report))).not.toContain("replayMotion");
  const legacy={...report,replayMotion:undefined,worldSnapshots:undefined};expect(getReplayFrame(legacy,2).motion).toBeUndefined();
});

test("a finished report with motion history above 1MB is accepted only for its own run",async()=>{
  const sessions=new SessionStore(),session=sessions.create("",null,"motion-report");
  const server=createApp({llm:null,sessions}).listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/session/${session.id}/report`;
  try {
    const report={status:"failed",debug:{runId:session.runId},replayMotion:[],padding:"x".repeat(1_100_000)};
    const send=(value:unknown)=>fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({report:value})});
    expect((await send(report)).status).toBe(204);
    expect((await send({...report,debug:{runId:"another-run"}})).status).toBe(400);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test("the generated-floor replay consumes historical guards and items on their own floor",()=>{
  const atlas=stationAtlas(createWorldV2(1)),report={...failedReport(),elapsed:2,replayMotion:[
    {t:0,guards:[{id:"g",position:{x:10,y:10,floorId:"platform"},facing:0}],items:[{id:"can",kind:"can" as const,position:{x:5,y:5,floorId:"concourse"},holderId:null}]},
    {t:2,guards:[{id:"g",position:{x:20,y:10,floorId:"platform"},facing:Math.PI}],items:[]},
  ]};
  const frame=replayMapFrame(atlas,getReplayFrame(report,1));
  expect(frame.people).toEqual([expect.objectContaining({id:"g",floorId:"platform",x:15,facing:Math.PI/2})]);
  expect(frame.items).toEqual([expect.objectContaining({id:"can",floorId:"concourse",x:5})]);
});
