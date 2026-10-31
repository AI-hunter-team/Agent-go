import { expect, test, vi } from "vitest";
import { GameRunner } from "../../src/agent/runner";
import { ScriptedAgent, type ScriptedStep } from "../helpers/scriptedAgent";
import { createFixtureEngine, emptyScenario } from "../fixtures/scenarios";
import { generatePersona } from "../../src/sim/persona";
import { Rng } from "../../src/sim/rng";
import type { Engine } from "../../src/sim/engine";
import type { GuardDef } from "../../src/sim/scenario";
const guard=(x:number,y:number,facing:number,id="guard"):GuardDef=>({id,label:id,route:[{x,y}],facing,speed:0,pauseSeconds:0});
const setup=(x:number,y:number,guards:GuardDef[]=[],seed=1)=>{
  const e=createFixtureEngine(emptyScenario(seed),guards);
  e.player.pos={x,y};
  vi.spyOn(e.npcs,"step").mockImplementation(()=>{});
  return e;
};
function person(e:Engine,x:number,y:number) {
  const n=e.world.addPerson("normal",{x,y});n.persona=generatePersona(new Rng(2),"normal");n.speed=0;
  n.persona.traits={courage:.6,vanity:1,temper:0,fairness:1,meddling:1};n.facing=Math.PI;
  return n;
}
const runner=(e:Engine,script:ScriptedStep[],respond?:import("../../src/agent/agent").NpcResponder)=>new GameRunner(e,new ScriptedAgent([...script,{at:"arrived",action:{type:"move_to",target:"TRAIN_1",reason:"到站台后继续登车"}}]),async()=>({mechanic:"unsupported",reason:"",source:"keywords"}),{respond});
const route:ScriptedStep[]=[{at:"creative_done",action:{type:"move_to",target:"STAIRS_TOP",reason:"离开现场"}},{at:"arrived",action:{type:"traverse",route:"stairs",reason:"抵达站台"}}];
async function until(r:GameRunner,condition:()=>boolean,max=1000) {
  if(r.phase==="ready")r.start();
  for(let i=0;i<max && !condition() && r.engine.status==="running";i++) {if(r.pending)await r.pending;else r.advance(1);}
  expect(condition(),JSON.stringify({t:r.engine.t,status:r.engine.status,reason:r.engine.failReason,guards:r.engine.guards.guards,decisions:r.decisions.map(d=>d.result),events:r.engine.events.events,alerts:[...r.engine.alerts.records.values()]})).toBe(true);
}
test("1 exchange after taking a prop transfers actual ticket and reaches platform",async()=>{
  const e=setup(42,15);e.player.screened=true;
  const n=person(e,42,17), ticket=e.world.items.spawn("ticket",{type:"held",personId:n.id,slot:"pocket"},n.id);
  const umbrella=e.world.items.spawn("umbrella",{type:"ground",pos:{x:42,y:15}},null);
  const snack=e.world.items.spawn("snack",{type:"held",personId:"player",slot:"hand"},"player");
  const r=runner(e,[{at:"start",action:{type:"take",itemId:umbrella.id,reason:"道具"}},{at:"creative_done",action:{type:"talk",npcId:n.id,message:"你的穿搭真好看，零食换票可以吗",goal:"trade",offerItemId:snack.id,reason:"交换"}},{at:"spoken_to",action:{type:"join_queue",facility:"G3",reason:"过闸"}},{at:"service_done",action:{type:"move_to",target:"STAIRS_TOP",reason:"到楼梯"}},{at:"arrived",action:{type:"traverse",route:"stairs",reason:"下楼"}}],async()=>({reply:"好，交换",decision:"accept",give:"ticket",want:"snack",reason:"喜欢零食",source:"llm"}));
  await r.runToEnd();
  expect(e.status).toBe("success");expect(ticket.used).toBe(true);expect(e.world.items.holderId(snack)).toBe(n.id);
  expect(e.world.items.transfers.some(t=>t.itemId===ticket.id && t.to.includes("player"))).toBe(true);
  expect(e.alerts.history.every(c=>["none","white"].includes(c.to))).toBe(true);
});
function theft(seed=1) {
  const e=setup(12,15,[{...guard(25,15,0),speed:.4}],seed), n=person(e,13.2,15);
  e.world.items.spawn("ticket",{type:"held",personId:n.id,slot:"pocket"},n.id);
  const witness=person(e,12,17);witness.facing=-Math.PI/2;witness.speed=1.3;
  return {e,n,witness};
}
test("2 theft leads to physical report then guard yellow ring red and defeat",async()=>{
  const {e,n,witness}=theft();
  const r=runner(e,[{at:"start",action:{type:"act",instruction:`抢 ${n.id} 的车票`,reason:"剧本"}}]);
  await until(r,()=>e.events.events.some(e=>e.kind==="report"));
  const report=e.events.events.find(e=>e.kind==="report")!;
  expect(report.causeId).toBeTruthy();expect(e.alerts.get(witness.id,"player")?.level).toBe("red");
  expect(e.alerts.history.filter(c=>c.observerId==="guard").every(c=>c.t>=report.t)).toBe(true);
  await until(r,()=>e.status==="failed");
  expect(e.alerts.get("guard","player")?.level).toBe("red");expect(e.failReason).toContain("判负");
});
test("3 hiding after report clears guard yellow while victim red persists",async()=>{
  const e=setup(38,15,[guard(27,15,Math.PI)]);e.player.screened=true;
  const n=person(e,39.2,15);n.persona!.traits={courage:0,vanity:0,temper:0,fairness:0,meddling:0};n.persona!.situation.fatigue=1;
  e.world.items.spawn("ticket",{type:"held",personId:n.id,slot:"pocket"},n.id);
  const witness=person(e,38,17);witness.facing=-Math.PI/2;witness.speed=1.3;
  const r=runner(e,[{at:"start",action:{type:"act",instruction:`抢 ${n.id} 的车票`,reason:"剧本"}},{at:"creative_done",action:{type:"move_to",target:"GATE_S",reason:"躲柱后"}},{at:25,action:{type:"join_queue",facility:"G4",reason:"离开现场"}},{at:"service_done",action:{type:"move_to",target:"STAIRS_TOP",reason:"到楼梯"}},{at:"arrived",action:{type:"traverse",route:"stairs",reason:"下楼"}}]);
  await until(r,()=>e.alerts.get("guard","player")?.level==="yellow");
  await until(r,()=>!e.alerts.get("guard","player"));
  expect(e.status).toBe("running");expect(e.alerts.get(n.id,"player")?.level).toBe("red");
  await r.runToEnd();expect(e.status).toBe("success");expect(e.alerts.get(n.id,"player")?.level).toBe("red");
});
test("4 dropped bottle draws a guard away then unseen vault can reach platform",async()=>{
  const e=setup(43,12,[guard(40,10,-Math.PI/2)]);
  const bottle=e.world.items.spawn("water_bottle",{type:"held",personId:"player",slot:"hand"},"player");
  const r=runner(e,[{at:"start",action:{type:"act",instruction:`扔 ${bottle.id} 到 GATE_N`,reason:"声响"}},{at:"creative_done",action:{type:"act",instruction:"翻闸",reason:"视野外"}},...route]);
  await r.runToEnd();
  expect(e.events.events.some(e=>e.kind==="item_thrown")).toBe(true);
  expect(e.status).toBe("success");
  expect(e.alerts.get("guard","player")?.level??"none").not.toBe("red");
});
test("5 witnessed vault fails immediately",async()=>{
  const e=setup(43,15,[guard(40,15,0)]);
  const r=runner(e,[{at:"start",action:{type:"act",instruction:"翻闸",reason:"回归"}}]);
  await until(r,()=>e.status==="failed");expect(e.failReason).toContain("翻越闸机");expect(e.player.passedGate).toBe(false);
});
test("6 rear knockout disables guard perception and a witness reports to another",async()=>{
  const e=setup(39,15,[guard(40.2,15,0),guard(30,15,Math.PI,"other")],1);
  const n=person(e,39,24.9);n.facing=-Math.PI/2;n.speed=1.3;
  const r=runner(e,[{at:"start",action:{type:"act",instruction:"打晕 guard",reason:"背后"}}]);
  await until(r,()=>e.guards.guards[0].incapacitated>0);
  expect(e.guards.guards[0].incapacitated).toBeCloseTo(20);
  expect(e.guards.canSee(e.guards.guards[0],e.player.pos)).toBe(false);
  await until(r,()=>e.events.events.some(e=>e.kind==="report" && e.targetId==="other"));
  expect(e.alerts.get(n.id,"player")?.level).toBe("red");r.stop();
  const front=setup(41.5,15,[guard(40.2,15,0)]);
  const r2=runner(front,[{at:"start",action:{type:"act",instruction:"打晕 guard",reason:"正面"}}]);
  await until(r2,()=>front.status==="failed");expect(front.guards.guards[0].incapacitated).toBe(0);
});
