import { expect, test } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { respond, dialogueRequestValid, validateResponse } from "../server/npcDialogue";
import { structuredCall } from "../server/structured";
import { generatePersona } from "../src/sim/persona";
import { Rng } from "../src/sim/rng";
import type { NpcDialogueRequest } from "../src/shared/types";
export const dialogueFixture = (): NpcDialogueRequest => {
  const persona = generatePersona(new Rng(1), "normal");
  return {npc:{id:"n1",...persona, alert:{level:"none",cause:null}, memory:[],holdings:[],queue:null},speaker:{look:"乘客",holding:[]},goal:"ask_ticket",message:"请给我车票",offer:null,history:[]};
};
test("NPC validates actual holdings and malformed inputs", async () => {
  const request=dialogueFixture();
  expect(dialogueRequestValid(request)).toBe(true);
  expect(dialogueRequestValid({...request, history:Array(4).fill({})})).toBe(false);
  const value={reply:"给你",decision:"accept",give:"ticket",want:null,reason:"同意"};
  expect(validateResponse(value,request)).toMatchObject({decision:"refuse",give:null});
  expect((await respond(async()=>({}),request)).source).toBe("error");
  expect((await respond(async()=>{throw Error("offline")},request)).decision).toBe("refuse");
});
test("Anthropic structured adapter supports the new NPC schema", async () => {
  const request=dialogueFixture();
  const client=new Anthropic({apiKey:"fake",fetch:async()=>Response.json({id:"m1",type:"message",role:"assistant",model:"claude-test",stop_reason:"end_turn",usage:{input_tokens:1,output_tokens:2},content:[{type:"text",text:JSON.stringify({reply:"不行",decision:"refuse",give:null,want:null,reason:"没有票"})}]})});
  const result=await respond((system,user,schema,_name,maxTokens)=>structuredCall(client,{model:"claude-test",maxTokens:4096,maxThinkingTokens:1024,fallback:false},{system,user,schema,maxTokens,validate:(value):value is unknown=>!!value}),request);
  expect(result).toMatchObject({decision:"refuse",source:"llm"});
});
