import { describe, expect, test, vi } from "vitest";
import { createLabEngine } from "../src/lab/scenarios";
import { LabController, type LabAgent } from "../src/lab/controller";
import { buildIntentContext, classifyByKeywords, parsePlan } from "../src/sim/intent";
import { reconcileInstruction } from "../src/sim/actions/instructionAudit";
import { personQuery } from "../src/sim/personSearch";
import { GameRunner } from "../src/agent/runner";
import { bossContextValid } from "../server/boss";

const input="击打买了票的乘客击晕并抢走车票";
const noFrame=async()=>{};
function buyer() {
  const e=createLabEngine("ticket-buyer"), f=e.world.facility("TVM-2")!, n=e.world.persons.get(f.queue.shift()!)!;
  n.pos={...f.def.head};n.activity={kind:"service",facility:f.def.id};f.serving={personId:n.id,remaining:.1,recheck:false};
  return {e,f,n};
}
const refuse={reply:"不给",decision:"refuse" as const,give:null,want:null,reason:"fixture",source:"offline" as const};

describe("observable target discovery",()=>{
  test.each(["击晕刚买完票的顾客","抢买到票的人","跟购票成功的旅客交谈","击打刚从售票机出来的乘客"])("recognizes the qualified target in %s",text=>{
    expect(personQuery(text)?.criterion).toBe("recent_purchase");
  });
  test("a witnessed purchase proves acquisition even when the ticket is immediately pocketed",()=>{
    const {e,n}=buyer();e.step();
    expect(n.hasTicket).toBe(true);
    expect(e.observe().people!.find(p=>p.id===n.id)!.holding).toEqual([]);
    const step=e.personSearch.next(input,e.observe())!;
    expect(step.state.phase).toBe("confirmed");expect(step.state.targetId).toBe(n.id);
    expect(step.state.evidence[0]).toMatchObject({kind:"purchase_completed",personId:n.id,itemKind:"ticket",facilityId:"TVM-2"});
    const context=buildIntentContext(e.world,e.guards);expect(bossContextValid(context)).toBe(true);
    const unknown={status:"needs_precondition" as const,steps:[],summary:"",reason:"未见手持车票",source:"llm" as const};
    const checked=reconcileInstruction(input,unknown,context);
    expect(checked.plan.status).toBe("plan");expect(checked.plan.steps.map(s=>s.op)).toEqual(["strike","snatch"]);
    expect(checked.plan.translation).toMatchObject({originalStatus:"needs_precondition",originalReason:"未见手持车票"});
  });
  test("unseen purchases and hidden possession never become witnessed evidence",()=>{
    const {e,n}=buyer();e.player.pos={x:40,y:20};e.step();expect(n.hasTicket).toBe(true);
    e.player.pos={x:8.5,y:6.4};
    expect(e.world.observedSceneEvents.some(v=>v.kind==="purchase_completed")).toBe(false);
    expect(e.personSearch.next(input,e.observe())!.state.targetId).toBeUndefined();
  });
  test("purchase evidence selects the actual buyer rather than a closer preexisting ticket holder",()=>{
    const {e,n}=buyer();
    const decoy=e.world.addPerson("normal",{x:e.player.pos.x+.7,y:e.player.pos.y},{hasTicket:true});decoy.activity={kind:"waiting",remaining:100};
    const ticket=e.world.items.holdings(decoy.id).find(i=>i.kind==="ticket")!;e.world.items.move(ticket.id,{type:"held",personId:decoy.id,slot:"hand"});
    e.step();const selection=e.personSearch.next(input,e.observe())!;
    expect(selection.state.targetId).toBe(n.id);expect(selection.state.targetId).not.toBe(decoy.id);
  });
  test("leaving a machine queue without buying does not identify a purchaser",()=>{
    const e=createLabEngine("ticket-buyer"), f=e.world.facility("TVM-2")!, n=e.world.persons.get(f.queue[0])!;
    e.world.removeFromQueue(n);n.activity={kind:"waiting",remaining:100};
    expect(e.world.observedSceneEvents.some(v=>v.kind==="queue_exit")).toBe(true);
    expect(e.personSearch.next(input,e.observe())!.state.phase).toBe("searching");
    expect(e.world.observedSceneEvents.some(v=>v.kind==="purchase_completed")).toBe(false);
  });
  test("observed acquisition also supports other items; observed release invalidates it",()=>{
    const e=createLabEngine("social"), n=[...e.world.persons.values()].find(p=>!p.isPlayer)!;
    const snack=e.world.items.holdings("player").find(i=>i.kind==="snack")!;
    expect(e.world.items.move(snack.id,{type:"held",personId:n.id,slot:"hand"},"give").ok).toBe(true);
    const text="跟刚拿到零食的乘客交谈";
    expect(e.personSearch.next(text,e.observe())!.state).toMatchObject({phase:"confirmed",targetId:n.id});
    e.world.items.move(snack.id,{type:"ground",pos:{...n.pos}},"drop");
    expect(e.personSearch.next(text,e.observe())!.state.targetId).toBeUndefined();
  });
  test("losing sight preserves a last-seen location, not the target's hidden live position",()=>{
    const {e,n}=buyer();e.step();e.personSearch.next(input,e.observe());const last={...e.world.personSearch!.lastSeenPosition!};
    n.pos={x:70,y:25};const observation=e.observe();
    expect(observation.targetSearch).toMatchObject({phase:"lost",lastSeenPosition:last});
    expect(observation.people!.some(p=>p.id===n.id)).toBe(false);
    expect(e.personSearch.next(input,observation)!.action?.type).toBe("move_to");
    expect(e.world.personSearch!.lastSeenPosition).not.toEqual(n.pos);
  });
  test("search expires on world time and a fresh scene has no observation memory",()=>{
    const e=createLabEngine("no-ticket");e.personSearch.next(input,e.observe());e.world.t=40;
    expect(e.personSearch.next(input,e.observe())!.state.phase).toBe("expired");
    expect(createLabEngine("no-ticket").world.observedSceneEvents).toEqual([]);
    expect(personQuery("我先买票，然后击打最近乘客")).toBeNull();
  });
});

describe("continuous goal execution",()=>{
  test("a missing target stops the lab search at its deadline without turning it into dialogue",async()=>{
    const c=new LabController(createLabEngine("no-ticket"),undefined,undefined,noFrame);
    await c.run(input,"offline");const r=c.runs[0];
    expect(r.state).toBe("partial");expect(r.after!.targetSearch?.phase).toBe("expired");expect(r.after!.t).toBeCloseTo(40);
    expect(r.trace.some(t=>t.kind==="人物对话")).toBe(false);expect(r.steps.some(s=>s.step.op==="strike")).toBe(false);
  });
  test("lab waits for a real purchase and resumes the original command without asking or paid polling",async()=>{
    const e=createLabEngine("ticket-buyer");e.executor.surpriseKnockoutRate=1;
    const actor:LabAgent={kind:"llm",decide:vi.fn(async()=>({action:{type:"talk" as const,npcId:"p1",message:"你有票吗",goal:"chat" as const,reason:"先问"},model:"fixture",usage:null,thinking:null,error:null,latencyMs:0})),
      interpret:vi.fn(async()=>({status:"needs_precondition" as const,steps:[],summary:"",reason:"没有手持物",source:"llm" as const})),respond:vi.fn(async()=>refuse),dispose:async()=>{}};
    const c=new LabController(e,undefined,async()=>actor,noFrame);await c.run(input,"model");const r=c.runs[0];
    expect(actor.decide).not.toHaveBeenCalled();expect(actor.respond).not.toHaveBeenCalled();expect(actor.interpret).toHaveBeenCalledTimes(1);
    expect(r.searchHistory!.some(s=>s.state.phase==="confirmed")).toBe(true);
    expect(r.trace.some(t=>t.kind==="实际目击"&&t.text.includes("完成购票"))).toBe(true);
    expect(r.paths![0].requirements.every(r=>r.state==="unverified")).toBe(true);
    expect(r.after!.hasTicket).toBe(true);expect(r.steps.some(s=>s.step.op==="strike"&&s.phase==="completed"&&s.ok)).toBe(true);
    expect(r.trace.some(t=>t.kind==="人物对话")).toBe(false);
  });
  test("formal runner shares discovery and continuation rather than querying the passenger",async()=>{
    const e=createLabEngine("ticket-buyer");e.executor.surpriseKnockoutRate=1;
    const decide=vi.fn(async(turn:import("../src/shared/types").AgentTurn)=>({action:{type:"wait" as const,seconds:2,reason:turn.observation.self.hasTicket?"next task":"fixture"},thinking:null,model:"fixture",usage:null,latencyMs:0,error:null}));
    const runner=new GameRunner(e,{kind:"llm",decide,dispose:async()=>{}},async text=>classifyByKeywords(text),{guidance:input,interpret:async(text,context)=>parsePlan(text,context)});
    runner.start();
    for(let i=0;i<500&&!e.player.hasTicket&&runner.phase!=="ended";i++) {if(runner.pending)await runner.pending;else runner.advance(10);}
    expect(e.player.hasTicket).toBe(true);expect(e.world.observedSceneEvents.some(e=>e.kind==="purchase_completed")).toBe(true);
    // The formal game may immediately decide its next task after actual transfer.
    expect(decide.mock.calls.every(([turn])=>turn.observation.self.hasTicket)).toBe(true);runner.stop("fixture complete");
  });
});
