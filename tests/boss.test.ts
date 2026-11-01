import { generateWorld } from "../src/sim/worldDefinition";
import { Engine } from "../src/sim/engine";
import { buildBossSystem } from "../server/boss";
import { jsonResponse } from "./responsesSupport";
import { expect, test } from "vitest";
import { interpret, validatePlan } from "../server/boss";
import { ResponsesClient, ResponsesLlmService } from "../server/responses";
import { buildIntentContext, parsePlan } from "../src/sim/intent";
import { createFixtureEngine } from "./fixtures/scenarios";
const e = createFixtureEngine();
const context = buildIntentContext(e.world, e.guards);
const plan = { status: "plan", steps: [{ op: "wait", seconds: 1 }], summary: "等", reason: "等" };
test("Boss accepts bounded primitives and rejects invented ids or operations", async () => {
  expect(validatePlan(plan, context)?.source).toBe("llm");
  for (const steps of [[{op:"fly"}], [{op:"push",npcId:"invented"}], Array(9).fill({op:"wait",seconds:1})]) {
    expect(validatePlan({...plan,steps},context)).toBeNull();
    expect((await interpret(async () => ({...plan, steps}), "等1秒", context)).source).toBe("keywords");
  }
});
test("Responses structured adapter handles valid, refused and truncated replies", async () => {
  for (const status of ["completed", "incomplete", "failed"] as const) {
    const client = new ResponsesClient("https://example.test/v1", "fake", (async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      expect(request.text.format.strict).toBe(true);
      expect(request.input[0].content).toContain("不可信");
      return Response.json(jsonResponse(plan,{status}));
    }) as typeof fetch);
    const llm = new ResponsesLlmService(client, {model:"gpt-6-luna",maxTokens:4096,reasoningEffort:"none",openaiStream:false});
    expect((await llm.interpret("等1秒",context)).source).toBe(status === "completed" ? "llm" : "keywords");
  }
});
test("facility strikes use the visible facility branch and reject mixed/invented targets",()=>{
 const c={...context,facilities:[{id:"TVM-2",label:"售票机"}]};
 expect(validatePlan({...plan,steps:[{op:"strike",facilityId:"TVM-2",aim:"hurt"}]},c)).not.toBeNull();
 for(const step of [{op:"strike",facilityId:"TVM-9",aim:"hurt"},{op:"strike",npcId:"n1",facilityId:"TVM-2",aim:"hurt"},{op:"strike",facilityId:"TVM-2",aim:"knockout"}]) expect(validatePlan({...plan,steps:[step]},c)).toBeNull();
});
test("Boss accepts public item spots and rejects invented spots",()=>{
 expect(validatePlan({...plan,steps:[{op:"approach",target:{kind:"spot",id:"convenience"}}]},context)).not.toBeNull();
 expect(validatePlan({...plan,steps:[{op:"approach",target:{kind:"spot",id:"invented"}}]},context)).toBeNull();
});
test("paid usage survives truncated Boss and NPC output",async()=>{
 const client=new ResponsesClient("https://example.test/v1","fake",async()=>Response.json(jsonResponse({}, {model:"test-model",status:"incomplete",usage:{input_tokens:13,output_tokens:7}})));
 const llm=new ResponsesLlmService(client,{model:"test-model",maxTokens:4096,reasoningEffort:"none",openaiStream:false});
 expect(await llm.interpret("等1秒",context)).toMatchObject({source:"keywords",usage:{inputTokens:13,outputTokens:7}});
 const {dialogueFixture}=await import("./fixtures/dialogue");
 expect(await llm.respond(dialogueFixture())).toMatchObject({source:"error",decision:"refuse",usage:{inputTokens:13,outputTokens:7}});
});

test("flat nullable wire steps decode all branches without changing primitives",()=>{
 expect(validatePlan({...plan,steps:[{op:"vault",obstacle:"gate",target:null,npcId:null,facilityId:null,seconds:null}]},context)?.steps).toEqual([{op:"vault",obstacle:"gate"}]);
 expect(validatePlan({...plan,steps:[{op:"strike",facilityId:"TVM-2",npcId:null,itemId:null,aim:"hurt"}]},{...context,facilities:[{id:"TVM-2",label:"售票机"}]} )?.steps).toEqual([{op:"strike",facilityId:"TVM-2",aim:"hurt"}]);
});

test("Boss context exposes held items while keeping pocket contents hidden",()=>{
 const engine=createFixtureEngine();const p=engine.world.addPerson("normal",{x:3,y:15},{hasTicket:true});
 engine.world.items.spawn("umbrella",{type:"held",personId:p.id,slot:"hand"},p.id);
 expect(buildIntentContext(engine.world,engine.guards).people.find(n=>n.id===p.id)?.holding).toEqual(["umbrella"]);
});

test("generated action interpretation uses this world's public nodes and item spots",()=>{
  const engine=new Engine(4,{},undefined,undefined,generateWorld(4)),context=buildIntentContext(engine.world,engine.guards);
  const request={status:"plan",steps:[{op:"approach",target:{kind:"node",id:"ENTRANCE_B"}}],summary:"去另一个入口",reason:""};
  expect(parsePlan("靠近 ENTRANCE_B",context).steps).toEqual(request.steps);
  expect(validatePlan(request,context)?.status).toBe("plan");
  expect(validatePlan(request,{...context,publicMap:undefined})).toBeNull();
  expect(buildBossSystem(context.publicMap)).toContain(JSON.stringify(context.publicMap!.nodes));
});
