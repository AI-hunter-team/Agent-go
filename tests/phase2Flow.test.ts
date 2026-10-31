import { describe, expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { World } from "../src/sim/world";
import { ITEM_DEFS } from "../src/sim/content/items";
import { emptyScenario, createFixtureEngine } from "./fixtures/scenarios";
import { ESCALATOR_TOP, RAILING_SEGMENTS, RAILING_X, STAIRS_TOP } from "../src/sim/layout";
import type { PlanStep } from "../src/shared/interaction";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameSession } from "../src/ui/gameSession";
import { parsePlan } from "../src/sim/intent";
import { getReplayFrame } from "../src/replay/trajectory";

const run = (e: Engine, seconds: number) => { for(let i=0;i<seconds*10;i++) e.step(); };
function plan(e: Engine, step: PlanStep) { return e.executor.start({status:"plan",steps:[step],summary:"测试",reason:"",source:"keywords"}); }
function security(backpack: boolean, water=false) {
 const w=new World(1,120,{backpack}); const p=w.addPerson("player",w.facility("S2")!.def.head,{isPlayer:true});
 p.serviceTime.security=3;
 if(water) w.items.spawn("water_bottle",{type:"held",personId:p.id,slot:"hand"},p.id);
 w.facility("S2")!.queue.push(p.id); p.activity={kind:"queued",facility:"S2"}; w.stepPeopleAndFacilities();
 return w;
}
describe("IV2 phase 2 world flows",()=>{
 test("observe consumes one second and wakes the next decision without exposing pocket items",()=>{
  const e=createFixtureEngine();e.takeTriggers();const n=e.world.addPerson("normal",{x:3,y:15},{hasTicket:true});
  e.world.items.spawn("umbrella",{type:"held",personId:n.id,slot:"hand"},n.id);
  const result=e.applyAction({type:"observe",targetId:n.id,reason:""});expect(result.ok).toBe(true);expect(result.text).toContain("umbrella");expect(result.text).not.toContain("ticket");
  run(e,.9);expect(e.hasTriggers()).toBe(false);run(e,.1);expect(e.takeTriggers().some(t=>t.kind==="wait_done")).toBe(true);expect(e.t).toBe(1);
 });
 test("loadout persists across preview, start and retry without changing fixed difficulty",()=>{
  const s=new GameSession(1,{}, {backpack:false});
  expect(s.engine.world.items.bag("player")).toBeUndefined();
  s.preview(2); s.start(new HeuristicAgent(),async()=>{throw Error("unused");});
  expect(s.engine.loadout).toEqual({backpack:false}); expect(s.engine.settings).toEqual({timeLimitSeconds:150,extraQueuePeople:3});
  s.stop(); s.start(new HeuristicAgent(),async()=>{throw Error("unused");}); expect(s.engine.world.items.bag("player")).toBeUndefined(); s.stop();
 });
 test("backpack and inspect items add time; confiscation uses audited item movement",()=>{
  expect(security(false).facility("S2")!.serving!.remaining).toBeCloseTo(3);
  expect(security(true).facility("S2")!.serving!.remaining-security(false).facility("S2")!.serving!.remaining).toBeCloseTo(2);
  expect(security(false,true).facility("S2")!.serving!.remaining-security(false).facility("S2")!.serving!.remaining).toBeCloseTo(2);
  const old=ITEM_DEFS.water_bottle.security;
  try { ITEM_DEFS.water_bottle.security="confiscate"; const w=security(false,true); for(let i=0;i<100;i++){w.t+=.1;w.stepPeopleAndFacilities();} expect(w.player!.screened).toBe(true);expect(w.items.holdings("player").some(i=>i.kind==="water_bottle")).toBe(false);expect(w.items.transfers.some(t=>t.how==="confiscate")).toBe(true); }
  finally {ITEM_DEFS.water_bottle.security=old;}
 });
 test("railing takes 3 seconds and crosses security without granting gate access",()=>{
  const e=createFixtureEngine();e.player.pos={x:24.5,y:10};expect(plan(e,{op:"vault",obstacle:"railing"}).ok).toBe(true);
  run(e,2.9);expect(e.player.screened).toBe(false);run(e,.2);expect(e.player.screened).toBe(true);expect(e.player.passedGate).toBe(false);expect(e.events.events[0]).toMatchObject({kind:"vault",severity:"violation"});
 });
 test("railing vault from the hall walks to the nearest low section and crosses only there",()=>{
  const e=createFixtureEngine();e.player.pos={x:24.5,y:15};expect(plan(e,{op:"vault",obstacle:"railing"}).ok).toBe(true);
  expect(e.player.activity).toMatchObject({kind:"acting",op:"approach"});
  run(e,10);expect(e.player.screened).toBe(true);expect(e.player.pos.x).toBeGreaterThan(RAILING_X);
  expect(RAILING_SEGMENTS.some(s=>e.player.pos.y>=s.minY&&e.player.pos.y<=s.maxY)).toBe(true);
 });
 test.each(["RAIL_N","RAIL_S"])("move_to %s stands close enough to vault without another approach",(target)=>{
  const e=createFixtureEngine();e.player.pos={x:19,y:15};expect(e.applyAction({type:"move_to",target,reason:""}).ok).toBe(true);
  run(e,10);expect(e.player.activity.kind).toBe("idle");
  expect(plan(e,{op:"vault",obstacle:"railing"}).ok).toBe(true);expect(e.player.activity).toMatchObject({kind:"acting",op:"vault"});
 });
 test("railing vault is rejected once past the security wall",()=>{
  const e=createFixtureEngine();e.player.pos={x:28,y:10};expect(plan(e,{op:"vault",obstacle:"railing"}).ok).toBe(false);
 });
 test("an unreachable concourse approach before a railing vault is replaced by the hall-side walk",()=>{
  // Report seed 78017401: the interpreter planned approach CONC_N then vault, which failed as unreachable.
  const e=createFixtureEngine();e.player.pos={x:23.6,y:7.2};
  expect(e.executor.start({status:"plan",steps:[{op:"approach",target:{kind:"node",id:"CONC_N"}},{op:"vault",obstacle:"railing"}],summary:"测试",reason:"",source:"llm"}).ok).toBe(true);
  run(e,10);expect(e.player.screened).toBe(true);expect(e.player.pos.x).toBeGreaterThan(RAILING_X);
  expect(e.executor.outcomes.every(o=>o.ok)).toBe(true);
 });
 test.each([[false,10],[true,5]] as const)("escalator walking=%s takes %s seconds",(walking,seconds)=>{
  const e=createFixtureEngine();e.player.passedGate=true;e.player.pos={...ESCALATOR_TOP};expect(e.applyAction({type:"traverse",route:"escalator",walking,reason:""}).ok).toBe(true);run(e,seconds-.1);expect(e.player.onPlatform).toBe(false);run(e,.2);expect(e.status).toBe("running");expect(e.player.onPlatform).toBe(true);expect(e.player.pos.y).toBe(ESCALATOR_TOP.y);
 });
 test("mid-escalator side exit continues stairs; slide reaches platform in 2 seconds",()=>{
  const e=createFixtureEngine();e.player.passedGate=true;e.player.pos={...ESCALATOR_TOP};e.applyAction({type:"traverse",route:"escalator",reason:""});run(e,3);
  expect(plan(e,{op:"vault",obstacle:"escalator_side"}).ok).toBe(true);run(e,1.1);expect(e.events.events.some(v=>v.kind==="escalator_exit"&&v.severity==="suspicious")).toBe(true);expect(e.player.activity.kind).toBe("stairs");run(e,5);expect(e.status).toBe("running");expect(e.player.onPlatform).toBe(true);
  const s=createFixtureEngine();s.player.passedGate=true;s.player.pos={...STAIRS_TOP};expect(plan(s,{op:"slide_handrail"}).ok).toBe(true);run(s,1.9);expect(s.player.onPlatform).toBe(false);run(s,.2);expect(s.status).toBe("running");expect(s.player.onPlatform).toBe(true);
 });
 test("power scripts reduce and restore shared sight and emit environment facts",()=>{
  const scenario=emptyScenario();scenario.events=[{t:.1,type:"power",zone:"concourse",duration:1}];const e=createFixtureEngine(scenario);
  const observer={id:"n",role:"npc" as const,pos:{x:30,y:5},facing:0};expect(e.perception.canSee(observer,{x:38,y:5})).toBe(true);run(e,.1);expect(e.perception.canSee(observer,{x:38,y:5})).toBe(false);run(e,1.1);expect(e.perception.canSee(observer,{x:38,y:5})).toBe(true);expect(e.events.events.map(e=>e.kind)).toEqual(["power_out","power_restored"]);
 });
 test("facility strike interrupts service through a causal damage event",()=>{
  const e=createFixtureEngine(); const f=e.world.facility("TVM-2")!; e.player.pos={...f.def.head}; const p=e.world.addPerson("normal",f.def.head); f.serving={personId:p.id,remaining:100,recheck:false};p.activity={kind:"service",facility:f.def.id};
  expect(plan(e,{op:"strike",facilityId:f.def.id,aim:"hurt"}).ok).toBe(true);run(e,2);expect(f.status).toBe("broken");expect(f.serving).toBeNull();expect(e.events.events.find(v=>v.kind==="facility_damaged")?.causeId).toBe(e.events.events.find(v=>v.kind==="strike")?.id);
 });
 test("reports archive departed personas and freeze copies; replay filters future facts",()=>{
  const e=createFixtureEngine();const p=e.world.addPerson("normal",{x:5,y:5});e.world.persons.delete(p.id);e.world.powerOut("hall",1);const r=new GameRunner(e,new HeuristicAgent(),async()=>{throw Error("unused");});const report=r.report();expect(report.personas?.[p.id]).toBeDefined();expect(report.worldEvents).toHaveLength(1);e.world.powerOut("concourse",1);expect(report.worldEvents).toHaveLength(1);expect(getReplayFrame({...report,elapsed:2,worldEvents:[{...report.worldEvents![0],t:1}]},.5).events).toEqual([]);
 });
 test("offline facility parsing cannot invent a facility",()=>{
  const context={self:{position:{x:12,y:12},inventory:[]},people:[],items:[],facilities:[{id:"TVM-2",label:"售票机"}]};expect(parsePlan("击打 TVM-2",context).steps).toEqual([{op:"strike",facilityId:"TVM-2",aim:"hurt"}]);
 });
 test("low-fairness hurried NPC attempts insertions and victims become yellow through perception",()=>{
  const e=createFixtureEngine();const f=e.world.facility("TVM-2")!;
  const victim=e.world.addPerson("normal",{x:12,y:12});const cutter=e.world.addPerson("normal",{x:11,y:12});
  victim.persona!.traits.fairness=1;victim.persona!.traits.temper=0; victim.facing=Math.PI;
  cutter.persona!.traits.fairness=0;cutter.persona!.situation.hurry=1;
  for(const p of [victim,cutter]){p.activity={kind:"queued",facility:f.def.id};f.queue.push(p.id);}
  for(let t=0;t<1000 && !e.npcBrain.cuts.size;t++){e.world.t=t;e.npcBrain.step();}
  expect(e.npcBrain.cuts.size).toBe(1);e.resolveInteractions(0);expect(e.alerts.get(victim.id,cutter.id)?.level).toBe("yellow");
  for(let i=0;i<100;i++){e.world.t+=.1;e.npcBrain.step();}
  expect(e.npcBrain.cuts.size).toBe(0);expect(e.world.cutInReservations.size).toBe(0);
 });
});
test("side exit collision emits an affecting cause and resumes escalator without overlap",()=>{
 const e=createFixtureEngine();e.player.passedGate=true;e.player.pos={...ESCALATOR_TOP};e.applyAction({type:"traverse",route:"escalator",reason:""});run(e,3);
 const p=e.world.addPerson("normal",{x:e.player.pos.x,y:ESCALATOR_TOP.y-1});p.activity={kind:"waiting",remaining:20};
 expect(plan(e,{op:"vault",obstacle:"escalator_side"}).ok).toBe(true);run(e,1);
 expect(e.events.events.find(v=>v.kind==="collision")).toMatchObject({severity:"affecting",targetId:p.id,causeId:expect.any(String)});
 expect(e.player.activity).toMatchObject({kind:"escalator"});expect(e.player.pos.y).toBe(ESCALATOR_TOP.y);
});
test("completed Boss outcomes remain attached to their original plan",()=>{
 const e=createFixtureEngine();const r=new GameRunner(e,new HeuristicAgent(),async()=>{throw Error("unused")});
 expect(plan(e,{op:"wait",seconds:.1}).ok).toBe(true);r.bossPlans.push({t:0,instruction:"等",plan:{status:"plan",steps:[{op:"wait",seconds:.1}],summary:"等",reason:"",source:"keywords"},outcomes:e.executor.outcomes});run(e,.1);
 expect(plan(e,{op:"make_noise",level:"low"}).ok).toBe(true);run(e,1);
 expect(r.report().boss?.[0].outcomes).toHaveLength(1);expect(r.report().boss?.[0].outcomes[0].text).toBe("等待结束");
});
