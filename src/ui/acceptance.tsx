// Development-only visual fixture. Never imports into the production application.
import React from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { GameSession } from "./gameSession";
import { AlertBadge, SceneItems } from "./scene/Interactions";
import { Character } from "./scene/Character";
import { InteractionPanel } from "./InteractionPanel";
import "./styles.css";
if (!import.meta.env.DEV) throw Error("Acceptance fixture is development-only");
const session=new GameSession(1);
session.engine.world.persons.forEach((_p,id)=>{if(id!=="player") session.engine.world.persons.delete(id)});
session.engine.player.pos={x:7,y:15};
for(const [index,level] of (["white","yellow","red"] as const).entries()) {
  const n=session.engine.world.addPerson("normal",{x:6+index*2,y:13});
  session.engine.alerts.records.set(n.id,{observerId:n.id,subjectId:"player",level,ring:.6,hiddenFor:0,since:0,causeEventId:"fixture",reaction:null});
  if(index===1) session.engine.world.log("speech",`${n.id}：请注意排队。`,true);
}
session.engine.world.items.spawn("umbrella",{type:"ground",pos:{x:7,y:14}},null);
session.engine.events.emit({t:0,actorId:"player",kind:"item_dropped",severity:"odd",pos:{x:7,y:14},loudness:3});
session.presentation.settle(session.engine);
createRoot(document.getElementById("root")!).render(<React.StrictMode><main><h1>交互 2.0 展示验收</h1><p>固定夹具 · 世界暂停 · 白/黄60%进度环，红色无环，地面雨伞及台词。</p><div style={{height:450}}><Canvas camera={{position:[7,5,20],fov:55}} onCreated={({camera})=>camera.lookAt(7,1,13)}><ambientLight intensity={2}/><mesh rotation={[-Math.PI/2,0,0]} position={[7,0,14]}><planeGeometry args={[16,16]}/><meshStandardMaterial color="#eee9dc"/></mesh>{[...session.presentation.current.actors.values()].map(a=><React.Fragment key={a.id}><Character id={a.id} kind={a.kind} session={session} assetUrl="" onAssetError={()=>{}} reducedMotion/><AlertBadge id={a.id} session={session}/></React.Fragment>)}<SceneItems session={session}/></Canvas></div><InteractionPanel engine={session.engine}/></main></React.StrictMode>);
