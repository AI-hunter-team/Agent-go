import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp, type LlmService } from "../server/app";
import { SessionStore } from "../server/sessions";
import { DebugLogger } from "../server/debug";
import { dialogueFixture } from "./fixtures/dialogue";
import type { NpcResponse } from "../src/shared/types";
const reply: NpcResponse={reply:"请到队尾。",decision:"refuse",give:null,want:null,reason:"重视公平",source:"llm",model:"fixed-npc",usage:{inputTokens:50,outputTokens:20,thinkingTokens:null,cacheReadTokens:0}};
let server:Server|null=null;
afterEach(()=>{server?.close();server=null;});
async function start(respond?:NonNullable<LlmService["respond"]>) {
 const sessions=new SessionStore();const session=sessions.create("",null);
 const app=createApp({llm:respond?{model:"fixed-npc",respond,normalize:async()=>{throw Error("unused")},decide:async()=>{throw Error("unused")},classify:async()=>{throw Error("unused")}}:null,sessions,debugLogger:new DebugLogger(false,"logs",["private-secret"])});
 // Windows may allocate a temporary port that the Fetch standard blocks.
 const blockedPorts=new Set([2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]);
 do {
  server=app.listen(0,"127.0.0.1");await new Promise(r=>server!.once("listening",r));
  if(blockedPorts.has((server.address() as AddressInfo).port)){await new Promise<void>(resolve=>server!.close(()=>resolve()));server=null;}
 } while(!server);
 return async(request:unknown,sessionId:string|null=session.id,path="/api/npc/respond")=>{
  const res=await fetch(`http://127.0.0.1:${(server!.address() as AddressInfo).port}${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sessionId,request})});const text=await res.text();return {status:res.status,body:text.startsWith("{")?JSON.parse(text):text};
 };
}
test("old negotiation route is removed",async()=>{const call=await start();expect((await call({},null,"/api/npc/negotiate")).status).toBe(404);});
test("missing session cannot invoke session model",async()=>{let calls=0;const call=await start(async()=>{calls++;return reply;});expect((await call(dialogueFixture(),null)).status).toBe(404);expect(calls).toBe(0);});
test("missing session model fails closed",async()=>{const call=await start();expect(await call(dialogueFixture())).toMatchObject({status:503,body:{source:"error",decision:"refuse",model:null,usage:null}});});
test("one call preserves model reply, paid usage and bound model identity",async()=>{const seen:unknown[]=[];const call=await start(async r=>{seen.push(r);return reply;});expect(await call(dialogueFixture())).toMatchObject({status:200,body:reply});expect(seen).toEqual([dialogueFixture()]);});
test("model cannot give items it does not hold",async()=>{const call=await start(async()=>({...reply,decision:"accept",give:"ticket"}));expect(await call(dialogueFixture())).toMatchObject({status:200,body:{decision:"refuse",give:null}});});
test.each([false,true])("upstream failures cannot expose credentials, throws=%s",async throws=>{const call=await start(async()=>{if(throws)throw Error("private-secret");return {...reply,reason:"private-secret",source:"error"};});const result=await call(dialogueFixture());expect(result.status).toBe(502);expect(JSON.stringify(result.body)).not.toContain("private-secret");expect(result.body.decision).toBe("refuse");});
const request=dialogueFixture();
test.each([
 null,[],{}, {...request,message:" "},{...request,message:true},{...request,message:"问".repeat(201)},
 {...request,npc:null},{...request,npc:{...request.npc,id:""}},{...request,npc:{...request.npc,id:"x".repeat(81)}},
 {...request,npc:{...request.npc,traits:{...request.npc.traits,courage:-1}}}, {...request,npc:{...request.npc,traits:{...request.npc.traits,temper:2}}},
 {...request,npc:{...request.npc,look:{...request.npc.look,outfit:"x".repeat(201)}}}, {...request,npc:{...request.npc,situation:{...request.npc.situation,hurry:"1"}}},
 {...request,npc:{...request.npc,holdings:["invented"]}}, {...request,npc:{...request.npc,memory:Array(13).fill("x")}},
 {...request,npc:{...request.npc,queue:{facility:"S1",position:0,length:2}}}, {...request,npc:{...request.npc,queue:{facility:"S1",position:3,length:2}}},
 {...request,goal:"override"}, {...request,offer:"invented"}, {...request,history:null}, {...request,history:Array(4).fill({})}, {...request,history:[null]},
 {...request,history:[{message:"m",reply:"r",decision:"override"}]}, {...request,history:[{message:"x".repeat(201),reply:"r",decision:"refuse"}]},
])("invalid dialogue is rejected before any model call %#",async request=>{let calls=0;const call=await start(async()=>{calls++;return reply;});expect((await call(request)).status).toBe(400);expect(calls).toBe(0);});
test("200 Unicode speech characters and 3 historical turns remain valid",async()=>{const call=await start(async()=>reply);expect((await call({...request,message:"🙏".repeat(200),history:Array(3).fill({message:"m",reply:"r",decision:"refuse"})})).status).toBe(200);});
