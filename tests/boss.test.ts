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
