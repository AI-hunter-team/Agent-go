/** Development-only, no model/HTTP business calls; actual Engine and formal renderer components. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { SceneItems } from "../../src/ui/scene/Interactions";
import { Character } from "../../src/ui/scene/Character";
import { GameSession } from "../../src/ui/gameSession";
import { createFixtureEngine } from "./scenarios";
import { sampleItem } from "../../src/ui/presentation";

if (!import.meta.env.DEV) throw new Error("Only for local visual acceptance");
function setup() {
  const session=new GameSession(1),engine=createFixtureEngine(undefined,[{id:"visual-guard",label:"现场保安",route:[{x:22,y:11}],facing:Math.PI,speed:.9,pauseSeconds:0}]);
  engine.player.pos={x:25.3,y:10};engine.takeTriggers();
  const item=engine.world.items.spawn("can",{type:"held",personId:"player",slot:"hand"},"player");
  session.engine=engine;session.presentation.reset(engine);
  return {session,item};
}
function Acceptance() {
  const [test,setTest]=useState(setup),[,refresh]=useState(0),[error,setError]=useState("");
  const {session,item}=test,e=session.engine,g=e.guards.guards[0];
  const show=()=>{session.presentation.settle(e);session.notify();refresh(n=>n+1);};
  const advance=(seconds:number)=>{for(let i=0;i<seconds*10;i++)e.step();show();};
  const pose={x:0,y:0,z:0,spin:0};sampleItem(session.presentation,item.id,1,pose);
  return <><header><h1>易拉罐：真实投掷与保安调查</h1><p>隔离验收现场 · 共用正式物品与人物显示组件 · 不调用大模型</p>
    <button onClick={()=>{const result=e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:{x:20,y:10},reason:"投掷后观察"});setError(result.ok?"":result.text);advance(1);}}>投掷到 (20, 10)</button>
    <button onClick={()=>advance(.2)}>推进 0.2 秒</button><button onClick={()=>advance(1)}>推进 1 秒</button><button onClick={()=>setTest(setup())}>重置现场</button>
    <p role="status">t={e.t.toFixed(1)}s · 易拉罐：{item.location.type === "flight" ? "飞行中" : item.location.type === "ground" ? "已落地" : "持有中"} ({e.world.items.position(item)?.x.toFixed(2)}, {e.world.items.position(item)?.y.toFixed(2)}) · 保安：{g.mode === "investigate" ? "正走向落点调查" : g.mode} ({g.pos.x.toFixed(2)}, {g.pos.y.toFixed(2)}) · 朝向 {Math.round(g.facing*180/Math.PI)}° · {e.guards.canSee(g,e.player.pos)?"视线覆盖角色":"当前未看见角色"}</p>
    {error&&<p role="alert">{error}</p>}</header>
    <div id="scene"><Canvas camera={{position:[23,9,18],fov:45}} onCreated={({camera})=>camera.lookAt(22.5,0,10.5)}>
      <color attach="background" args={["#e6e4d9"]}/><ambientLight intensity={1.4}/><directionalLight position={[25,10,15]} intensity={2}/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[23,-.02,11]}><planeGeometry args={[15,12]}/><meshStandardMaterial color="#dad6c9"/></mesh>
      <gridHelper args={[14,28,"#9aa599","#c3c8bc"]} position={[23,0,11]}/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[20,.01,10]}><ringGeometry args={[.3,.4,24]}/><meshBasicMaterial color="#bd8339"/></mesh>
      <SceneItems session={session}/>{["player",g.def.id].map(id=><Character key={id} id={id} kind={id==="player"?"player":"guard"} session={session} assetUrl="" assetRotation={0} onAssetError={setError} reducedMotion={true}/>)}
    </Canvas></div>
    <pre aria-label="世界实际状态">{JSON.stringify({time:e.t,can:{id:item.id,state:item.location.type,position:e.world.items.position(item),height:pose.y},guard:{position:g.pos,facingDegrees:Math.round(g.facing*180/Math.PI),mode:g.mode,investigating:g.investigation?.point,canSeePlayer:e.guards.canSee(g,e.player.pos)},events:e.events.events.filter(v=>v.itemId===item.id).map(v=>({kind:v.kind,pos:v.pos,soundRadius:v.loudness,trajectory:v.trajectory}))},null,2)}</pre>
  </>;
}
const root=createRoot(document.getElementById("root")!);
root.render(<Acceptance/>);
if (import.meta.hot) import.meta.hot.dispose(()=>root.unmount());
