import { afterEach, describe, expect, test, vi } from "vitest";
import type { ActionPlan, PlanStep } from "../src/shared/types";
import { createLabEngine } from "../src/lab/scenarios";
import { buildIntentContext } from "../src/sim/intent";
import { extractRequirements, reconcileInstruction } from "../src/sim/actions/instructionAudit";
import { physicalActionPlan } from "../src/sim/actions/physical";
import { loadLocalModel, saveLocalModel, clearLocalModel } from "../src/agent/localModel";
import { LabController, type LabAgent } from "../src/lab/controller";

const plan = (steps: PlanStep[]): ActionPlan => ({ status:"plan",source:"llm",summary:"测试计划",reason:"根据请求尝试",steps });
const refused = {reply:"不给",decision:"refuse" as const,give:null,want:null,reason:"测试",source:"offline" as const};
function setup() { const e=createLabEngine("physical"); const n=[...e.world.persons.values()].find(p=>!p.isPlayer)!; return {e,n}; }
function advance(e: ReturnType<typeof createLabEngine>, limit=100) { for(let i=0;i<limit&&e.executor.busy;i++){if(e.executor.pendingDialogue)e.dialogue.apply(refused);e.step();} }

describe("instruction fidelity and execution",()=>{
  test("original command survives role shortening; hit-first, control and ticket transfer reach real state",async()=>{
    const {e,n}=setup(); e.executor.surpriseKnockoutRate=1;
    const input="向最近的乘客直接殴打，打完索要车票，威胁并且强迫，不让逃跑";
    const actor: LabAgent={kind:"llm",decide:async()=>({action:{type:"act",instruction:"威胁乘客要票并殴打",reason:"简短理由"},model:"fixture",error:null,thinking:null,usage:null,latencyMs:0}),
      interpret:async instruction=>{expect(instruction).toBe(input);return plan([{op:"talk",npcId:n.id,message:"交票",goal:"threaten"},{op:"strike",npcId:n.id,aim:"hurt"}]);},respond:async()=>refused,dispose:async()=>{}};
    const c=new LabController(e,undefined,async()=>actor,async()=>{});await c.run(input,"model");
    const r=c.runs[0];
    expect(r.paths![0].role).toMatchObject({instruction:"威胁乘客要票并殴打"});
    expect(r.paths![0].finalPlan!.steps[0].op).toBe("strike");
    expect(r.trace.some(t=>t.kind==="人物对话")).toBe(false);
    expect(r.after!.hasTicket).toBe(true);
    expect(r.after!.npcs.find(p=>p.id===n.id)!.incapacitated).toBeGreaterThan(0);
    expect(r.steps.some(s=>s.step.op==="talk"&&s.phase==="skipped")).toBe(true);
    expect(r.paths![0].changes.length).toBeGreaterThan(0);
  });
  test("an actual hit settles after 0.5 seconds, independently of its knockout outcome",()=>{
    const {e,n}=setup();e.executor.surpriseKnockoutRate=0;
    expect(e.applyAction({type:"physical_action",action:"strike",npcId:n.id,aim:"hurt",reason:""}).ok).toBe(true);
    advance(e);
    const start=e.executor.lifecycle.find(r=>r.phase==="perform")!, end=e.executor.lifecycle.find(r=>r.phase==="completed")!;
    expect(end.t-start.t).toBeCloseTo(.5);expect(end.ok).toBe(true);expect(n.incapacitated).toBe(0);
  });
  test.each(["before","after","during"] as const)("speech scheduling: %s",timing=>{
    const {e,n}=setup();e.executor.surpriseKnockoutRate=0;
    const p=physicalActionPlan({type:"physical_action",action:"push",npcId:n.id,speechTiming:timing,speech:{message:"请让开",goal:"chat"},reason:""});
    expect(e.executor.start(p).ok).toBe(true);advance(e);
    const body=e.executor.lifecycle.find(r=>r.phase==="perform"&&r.step.op==="push")!, speech=e.executor.lifecycle.find(r=>r.phase==="dialogue")!;
    expect(body).toBeDefined();expect(speech).toBeDefined();
    if(timing==="before") expect(speech.t).toBeLessThan(body.t);
    if(timing==="after") expect(speech.t).toBeGreaterThan(body.t);
    if(timing==="during") expect(speech.t).toBe(body.t);
    expect(e.executor.busy).toBe(false);
  });
  test("refusal branch never runs merely because a conversation completed",()=>{
    const {e,n}=setup();
    e.executor.start(plan([{op:"talk",npcId:n.id,message:"请帮忙",goal:"chat"},{op:"strike",npcId:n.id,aim:"hurt",when:"previous_refused"}]));
    e.dialogue.apply({...refused,decision:"accept",reply:"好的"});advance(e);
    expect(e.executor.lifecycle.some(r=>r.step.op==="strike"&&r.phase==="perform")).toBe(false);
    expect(e.executor.lifecycle.some(r=>r.step.op==="strike"&&r.phase==="skipped")).toBe(true);
  });
  test("restraint blocks actual movement, ends when the holder departs, and does not stun",()=>{
    const {e,n}=setup();e.world.restraints.set(n.id,{holderId:"player",until:e.t+5});
    const old={...n.pos};e.world.movePerson(n,{x:n.pos.x+2,y:n.pos.y},1);
    expect(n.pos).toEqual(old);expect(n.incapacitated).toBe(0);
    e.player.pos={x:3,y:3};expect(e.world.isRestrained(n.id)).toBe(false);
  });
  test("unconscious target can be searched but a nonexistent ticket cannot be created",()=>{
    const {e,n}=setup();e.world.knockOut(n,20);
    expect(e.executor.start(plan([{op:"snatch",npcId:n.id,itemKind:"ticket"}])).ok).toBe(true);advance(e);
    expect(e.player.hasTicket).toBe(true);
    expect(e.executor.start(plan([{op:"snatch",npcId:n.id,itemKind:"ticket"}])).ok).toBe(false);
  });
  test("negation and quoted violence do not become requested attacks; unsupported conditions stay explicit",()=>{
    expect(extractRequirements('不要殴打，告诉他“我会击打你”').some(r=>r.kind==="strike")).toBe(false);
    const {e,n}=setup();
    const r=reconcileInstruction("如果天气下雨就击打最近乘客",plan([{op:"strike",npcId:n.id,aim:"hurt"}]),buildIntentContext(e.world,e.guards));
    expect(r.plan.status).toBe("unsupported");expect(r.plan.steps).toEqual([]);
  });
  test("explicit prohibitions remove invented actions and before-phrases preserve the requested order",()=>{
    const {e,n}=setup(), context=buildIntentContext(e.world,e.guards);
    const source=plan([{op:"talk",npcId:n.id,goal:"ask_ticket",message:"请给票"},{op:"strike",npcId:n.id,aim:"hurt"}]);
    const denied=reconcileInstruction("不要殴打，向最近乘客索要车票",source,context);
    expect(denied.plan.steps.some(s=>s.op==="strike")).toBe(false);
    const ordered=reconcileInstruction("向最近乘客索要车票之前先击打他",source,context);
    expect(ordered.plan.steps[0].op).toBe("strike");
  });
});

describe("browser-local model settings",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  test("restore, overwrite and clear without leaking credentials into run data",()=>{
    const data=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});
    const saved={baseUrl:"https://example.invalid",apiKey:"fixture-key",model:"fixture",reasoningEffort:"none" as const,token:"fixture-token"};
    saveLocalModel(saved);expect(loadLocalModel()).toEqual(saved);
    saveLocalModel({...saved,model:"another"});expect(loadLocalModel()!.model).toBe("another");
    clearLocalModel();expect(loadLocalModel()).toBeNull();
  });
});
