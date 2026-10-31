// Development-only visual fixture. Never imports into the production application.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { GameSession } from "./gameSession";
import { AlertBadge, SceneItems } from "./scene/Interactions";
import { MessageBillboardLayout } from "./scene/MessageBillboardLayout";
import { Station } from "./scene/Station";
import { Character } from "./scene/Character";
import { InteractionPanel } from "./InteractionPanel";
import { GameRunner } from "../agent/runner";
import { HeuristicAgent } from "../agent/heuristicAgent";
import { classifyByKeywords } from "../sim/intent";
import type { NpcDialogueRequest } from "../shared/types";
import "./styles.css";
if (!import.meta.env.DEV) throw Error("Acceptance fixture is development-only");
const session=new GameSession(1);
const params=new URLSearchParams(location.search);
const dialogue=params.has("dialogue");
const conversation=params.has("conversation");
let conversationNpcId="";
const environment=new URLSearchParams(location.search).has("environment");
if(environment && new URLSearchParams(location.search).has("dark")) session.engine.world.powerOut("concourse",120);
session.engine.world.persons.forEach((_p,id)=>{if(id!=="player") session.engine.world.persons.delete(id)});
session.engine.player.pos={x:7,y:15};
for(const [index,level] of (["white","yellow","red"] as const).entries()) {
  const n=session.engine.world.addPerson("normal",{x:dialogue?7+index*.25:6+index*2,y:13});
  if(index===0) conversationNpcId=n.id;
  session.engine.alerts.records.set(n.id,{observerId:n.id,subjectId:"player",level,ring:.6,hiddenFor:0,since:0,causeEventId:"fixture",reaction:null});
  if(index===1&&!conversation) session.engine.world.log("speech",`${n.id}：请注意排队。`,true);
  if(dialogue) session.engine.world.log("speech",`${n.id}：${["可以，你先走吧，我还要等朋友。", "前面安检通道可以通行，请沿着标识向前。", "请依次排队，不要拥挤。".repeat(30)][index]}`,true);
}
if(dialogue) session.engine.world.log("speech","player：不好意思，我赶末班地铁，可以让我先过去吗？",true);
session.engine.world.items.spawn("umbrella",{type:"ground",pos:{x:10,y:15}},null);
session.engine.events.emit({t:0,actorId:"player",kind:"item_dropped",severity:"odd",pos:{x:10,y:15},loudness:3});
session.presentation.settle(session.engine);
if(conversation) session.runner=new GameRunner(session.engine,new HeuristicAgent(),async intent=>classifyByKeywords(intent));
function ConversationControls() {
  const [round,setRound]=useState(0),[waiting,setWaiting]=useState(false);
  const ask=()=>{
    const next=round+1;
    const npc=session.engine.world.persons.get(conversationNpcId)!;
    const request:NpcDialogueRequest={npc:{id:npc.id,...npc.persona!,alert:{level:"none",cause:null},memory:[],holdings:[],queue:null},speaker:{look:"乘客",holding:[]},goal:"ask_ticket",message:`第${next}轮：可以帮我指一下路吗？`,offer:null,history:[]};
    session.engine.world.t+=.1;
    session.engine.dialogue.pendingDialogue={request,step:{op:"talk",npcId:npc.id,goal:request.goal,message:request.message},eventId:`fixture-${next}`};
    session.presentation.settle(session.engine);
    setRound(next);setWaiting(true);
  };
  const answer=()=>{
    const pending=session.engine.dialogue.pendingDialogue!;
    session.runner!.interactionDialogues.push({t:session.engine.t,request:pending.request,response:{reply:`第${round}轮回复：请沿着标识向前走。`,decision:"refuse",give:null,want:null,reason:"固定无费用验收回复",source:"offline"}});
    session.engine.dialogue.pendingDialogue=null;
    session.presentation.settle(session.engine);
    setWaiting(false);
  };
  return <section aria-label="连续对话验收"><button onClick={ask} disabled={waiting}>下一句提问</button><button onClick={answer} disabled={!waiting}>NPC 回复</button><span>第{round}轮 · {waiting?"等待回复":"可继续提问"}</span></section>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><main><h1>交互 2.0 展示验收</h1><p>固定夹具 · 世界暂停 · 白/黄60%进度环，红色无环，地面雨伞及台词。</p>{conversation&&<ConversationControls/>}<div style={{height:450}}><Canvas camera={{position:environment?[40,28,43]:[7,5,20],fov:55}} onCreated={({camera})=>camera.lookAt(...(environment?[37,0,15]:[7,1,13]) as [number,number,number])}><ambientLight intensity={2}/>{environment&&<Station overview={environment} standard={false} onAssetError={()=>{}} session={session}/>}<mesh rotation={[-Math.PI/2,0,0]} position={[7,0,14]}><planeGeometry args={[16,16]}/><meshStandardMaterial color="#eee9dc"/></mesh>{[...session.presentation.current.actors.values()].map(a=><React.Fragment key={a.id}><Character id={a.id} kind={a.kind} session={session} assetRotation={0} assetUrl="" onAssetError={()=>{}} reducedMotion/><AlertBadge id={a.id} session={session} messageMode={params.has("icons")?"icons":params.has("hidden")?"hidden":"full"}/></React.Fragment>)}<MessageBillboardLayout/><SceneItems session={session}/></Canvas></div><InteractionPanel engine={session.engine}/></main></React.StrictMode>);
