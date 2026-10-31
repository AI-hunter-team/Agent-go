import { expect, test } from "vitest";
import { interpret, validatePlan } from "../server/boss";
import { OpenAIClient, OpenAILlmService } from "../server/openai";
import { buildIntentContext } from "../src/sim/intent";
import { createFixtureEngine } from "./fixtures/scenarios";
const e = createFixtureEngine();
const context = buildIntentContext(e.world, e.guards);
const plan = { status: "plan", steps: [{ op: "wait", seconds: 1 }], summary: "等", reason: "等" };
test("Boss accepts bounded primitives and rejects invented ids or operations", async () => {
  expect(validatePlan(plan, context)?.source).toBe("llm");
  for (const steps of [[{op:"fly"}], [{op:"push",npcId:"invented"}], Array(5).fill({op:"wait",seconds:1})]) {
    expect(validatePlan({...plan,steps},context)).toBeNull();
    expect((await interpret(async () => ({...plan, steps}), "等1秒", context)).source).toBe("keywords");
  }
});
test("OpenAI structured adapter handles valid, refused and truncated replies", async () => {
  for (const finish_reason of ["stop", "length", "content_filter"]) {
    const client = new OpenAIClient("https://example.test/v1", "fake", (async (_url, init) => {
      const request = JSON.parse(init!.body as string);
      expect(request.response_format.json_schema.strict).toBe(true);
      expect(request.messages[1].content).toContain("不可信");
      return Response.json({choices:[{finish_reason,message:{content:JSON.stringify(plan)}}]});
    }) as typeof fetch);
    const llm = new OpenAILlmService(client, {model:"gpt-6-luna",maxTokens:4096,maxThinkingTokens:1024,fallback:false});
    expect((await llm.interpret("等1秒",context)).source).toBe(finish_reason === "stop" ? "llm" : "keywords");
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
 const client=new OpenAIClient("https://example.test/v1","fake",async()=>Response.json({model:"test-model",usage:{prompt_tokens:13,completion_tokens:7},choices:[{finish_reason:"length",message:{content:"{"}}]}));
 const llm=new OpenAILlmService(client,{model:"test-model",maxTokens:4096,maxThinkingTokens:1024,fallback:false});
 expect(await llm.interpret("等1秒",context)).toMatchObject({source:"keywords",usage:{inputTokens:13,outputTokens:7}});
 const {dialogueFixture}=await import("./fixtures/dialogue");
 expect(await llm.respond(dialogueFixture())).toMatchObject({source:"error",decision:"refuse",usage:{inputTokens:13,outputTokens:7}});
});
