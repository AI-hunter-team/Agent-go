import { expect, test } from "vitest";
import { GameRunner } from "../src/agent/runner";
import { ScriptedAgent } from "./helpers/scriptedAgent";
import { createFixtureEngine } from "./fixtures/scenarios";
import { generatePersona } from "../src/sim/persona";
import { Rng } from "../src/sim/rng";
import type { ActionPlan, NpcResponse } from "../src/shared/types";

test("act interpreter then NPC response serialize and freeze the world", async () => {
  const e=createFixtureEngine();
  e.player.pos={x:7,y:15};
  const n=e.world.addPerson("normal",{x:8,y:15});
  n.persona=generatePersona(new Rng(1),"normal");
  const ticket=e.world.items.spawn("ticket",{type:"held",personId:n.id,slot:"pocket"},n.id);
  let resolvePlan!: (p: ActionPlan)=>void, resolveReply!: (r:NpcResponse)=>void;
  const agent=new ScriptedAgent([{at:"start",action:{type:"act",instruction:`向 ${n.id} 要票`,reason:"试验"}}]);
  const r=new GameRunner(e,agent,async()=>({mechanic:"unsupported",reason:"",source:"keywords"}),{
    interpret:()=>new Promise(resolve=>{resolvePlan=resolve}),respond:()=>new Promise(resolve=>{resolveReply=resolve}),
  });
  r.start();
  for(let i=0;i<10 && !resolvePlan;i++) await Promise.resolve();
  const t=e.t;
  r.advance(50);
  expect(e.t).toBe(t);
  resolvePlan({status:"plan",steps:[{op:"talk",npcId:n.id,message:"能给我票吗",goal:"ask_ticket"}],summary:"要票",reason:"",source:"llm"});
  await r.pending;
  for(let i=0;i<100 && !resolveReply;i++) { r.advance(1); if(r.pending) await Promise.resolve(); }
  expect(resolveReply).toBeTypeOf("function");
  const frozen=e.t;
  r.advance(100);
  expect(e.t).toBe(frozen);
  resolveReply({reply:"给你",decision:"accept",give:"ticket",want:null,reason:"帮助",source:"llm"});
  await r.pending;
  expect(e.world.items.holderId(ticket)).toBe("player");
  expect(r.calls).toEqual({decisions:1,boss:1,npc:1});
  expect(r.report().debug?.attempts.map(a=>a.operation)).toEqual(["decision","interpret","npc_respond"]);
  r.stop();
});
