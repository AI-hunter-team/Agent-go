import { expect, test } from "vitest";
import { fake, jsonResponse } from "./responsesSupport";
import { respond, dialogueRequestValid, validateResponse } from "../server/npcDialogue";
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
test("Responses structured adapter supports the NPC schema", async () => {
  const {service}=fake([jsonResponse({reply:"不行",decision:"refuse",give:null,want:null,reason:"没有票"})]);
  expect(await service.respond(dialogueFixture())).toMatchObject({decision:"refuse",source:"llm"});
});
