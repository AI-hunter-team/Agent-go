// Explicit opt-in paid acceptance. Not part of npm test. Credentials stay in env.
import "dotenv/config";
import {mkdir,writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import type {AddressInfo} from "node:net";
import {createApp} from "../server/app";
import {createLlm} from "../server/llm";
import {SessionStore} from "../server/sessions";
import {GameRunner} from "../src/agent/runner";
import {Engine} from "../src/sim/engine";
import {classifyByKeywords,buildIntentContext} from "../src/sim/intent";
import {generatePersona} from "../src/sim/persona";
import {Rng} from "../src/sim/rng";
import type {ActionPlan,DecisionResult,GameReport,NpcResponse} from "../src/shared/types";
const llm=createLlm();if(!llm)throw Error("No configured model");
const server=createApp({llm,sessions:new SessionStore()}).listen(0,"127.0.0.1");
await new Promise<void>((r,j)=>{server.once("listening",r);server.once("error",j);});
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let lastModelRequest=0;
const gapMs=Number(process.env.IV2_REQUEST_GAP_MS??10000);
async function api<T>(path:string,body:unknown):Promise<T>{
 if(["/api/agent/decide","/api/boss/interpret","/api/npc/respond"].includes(path)){await new Promise(r=>setTimeout(r,Math.max(0,gapMs-(Date.now()-lastModelRequest))));lastModelRequest=Date.now();}
 const r=await fetch(base+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const v=await r.json();if(!r.ok)throw Error(`HTTP ${r.status}: ${v.error??v.reason??"unavailable"}`);return v as T;}
const result:{testedAt:string;model:string;npcModel:string|null;cases:{name:string;report:GameReport}[];probes:unknown[];errors:string[]}={testedAt:new Date().toISOString(),model:llm.model,npcModel:llm.model,cases:[],probes:[],errors:[]};
const output=process.env.IV2_ACCEPTANCE_OUTPUT??"tmp/iv2-model-acceptance.json";
const save=async()=>{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+"\n");};
try{
 const configs=[
  {name:"risk-11",seed:11,guidance:"这局探索违规路线：不买票，先排队安检；安检后走到G3附近，尝试自然语言行动翻越闸机，最终到STAIRS_TOP下楼到站台。行动失败也如实继续，不宣称成功。"},
  {name:"orderly-43",seed:43,guidance:"按预计耗时选择开放设施，先买票再安检再刷票。办理、走路或排队中用wait等待。过闸后立即前往STAIRS_TOP并traverse楼梯。"},
  {name:"orderly-50",seed:50,guidance:"全程守序，尽快买票、安检、刷票、下楼到站台。选择预计最快的开放通道，不要反复等待。"},
  {name:"social-28",seed:28,guidance:"尝试向附近持票乘客礼貌索要或交换车票，对方拒绝就正常买票。全程以赶到站台为目标。"},
  {name:"risk-1",seed:1,guidance:"探索自由行动：过安检后观察保安，尝试丢物吸引注意，再寻找机会翻闸；若条件不成立可正常过闸。目标是进入站台。"},
 ];
 const selected=(process.env.IV2_CASES??"orderly-50,social-28,risk-1").split(",");
 for(const c of configs.filter(c=>selected.includes(c.name))){
  try{
   const {sessionId}=await api<{sessionId:string}>("/api/session",{guidance:c.guidance,loadout:{backpack:true}});
   const runner=new GameRunner(new Engine(c.seed),{kind:"llm",decide:async turn=>{
    const r=await api<DecisionResult>("/api/agent/decide",{sessionId,turn});console.log(JSON.stringify({case:c.name,t:turn.observation.t,action:r.action?.type,error:r.error,usage:r.usage}));return r;
   },dispose:async()=>{}},async intent=>classifyByKeywords(intent),{guidance:c.guidance,interpret:(instruction,context)=>api<ActionPlan>("/api/boss/interpret",{sessionId,instruction,context}),respond:request=>api<NpcResponse>("/api/npc/respond",{sessionId,request})});
   await runner.runToEnd();const report=runner.report();result.cases.push({name:c.name,report});await save();console.log(JSON.stringify({complete:c.name,status:report.status,score:report.score,calls:report.calls,operations:report.operationUsage}));
  }catch(error){result.errors.push(`${c.name}: ${String(error)}`);await save();console.log(JSON.stringify({failed:c.name,error:String(error)}));}
 }
 // Explicit real Boss/NPC probes cover paths an autonomous agent may decline to use.
 const {sessionId}=await api<{sessionId:string}>("/api/session",{guidance:"自由行动验收"});
 const e=new Engine(1);e.player.pos={x:12,y:12};const context=buildIntentContext(e.world,e.guards);
 for(const instruction of ["用拳头击打售票机设备 TVM-2，不是排队乘客","长出翅膀飞到站台"]){const at=performance.now();const response=await api<ActionPlan>("/api/boss/interpret",{sessionId,instruction,context});result.probes.push({kind:"boss",instruction,response,latencyMs:performance.now()-at});await save();}
 const routeEngine=new Engine(1);routeEngine.player.pos={x:43,y:15};routeEngine.player.screened=true;
 const target=routeEngine.world.addPerson("normal",{x:42,y:15},{hasTicket:true});
 for(const instruction of ["尝试翻越闸机",`抢夺乘客 ${target.id} 的车票`]){
  const at=performance.now();const response=await api<ActionPlan>("/api/boss/interpret",{sessionId,instruction,context:buildIntentContext(routeEngine.world,routeEngine.guards)});
  const start=routeEngine.executor.start(response);for(let i=0;i<150&&routeEngine.executor.busy&&routeEngine.status==="running";i++)routeEngine.step();
  result.probes.push({kind:"boss_route",instruction,response,latencyMs:performance.now()-at,simulation:{start,outcomes:routeEngine.executor.outcomes,events:routeEngine.events.events,passedGate:routeEngine.player.passedGate,status:routeEngine.status}});await save();
 }
 const persona=generatePersona(new Rng(1),"normal");const request={npc:{id:"npc-test",...persona,alert:{level:"none",cause:null},memory:[],holdings:["ticket"],queue:null},speaker:{look:"赶车乘客",holding:[]},goal:"ask_ticket",message:"我快赶不上车了，可以把票让给我吗？",offer:null,history:[]};
 const at=performance.now();const response=await api<NpcResponse>("/api/npc/respond",{sessionId,request});result.probes.push({kind:"npc",response,latencyMs:performance.now()-at});await save();
}catch(error){result.errors.push(String(error));}
finally{await save();await new Promise<void>(r=>server.close(()=>r()));console.log(JSON.stringify({saved:output,cases:result.cases.length,errors:result.errors}));}
if(result.errors.length||(!result.cases.length&&!result.probes.length))process.exitCode=1;
