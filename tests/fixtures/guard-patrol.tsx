/** No API/model calls: actual default guard definitions, simulation and formal actor rendering. */
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {Canvas} from "@react-three/fiber";
import {Html} from "@react-three/drei/web/Html";
import {Engine} from "../../src/sim/engine";
import {GameSession} from "../../src/ui/gameSession";
import {Character} from "../../src/ui/scene/Character";
import {RULES} from "../../src/sim/scenario";
if(!import.meta.env.DEV)throw new Error("Development fixture only");
function setup(){const s=new GameSession(21996796);s.engine=new Engine(21996796,{}, {seed:21996796,initialStatus:{},spawns:[],events:[]});s.engine.player.pos={x:18.913480250023543,y:5.621644999874308};s.engine.takeTriggers();s.presentation.reset(s.engine);return s;}
function Fixture(){
  const [session,setSession]=useState(setup),[,refresh]=useState(0),[error,setError]=useState("");const e=session.engine;
  const advance=(n:number)=>{for(let i=0;i<n*10;i++)e.step();session.presentation.settle(e);session.notify();refresh(v=>v+1);};
  const seen=e.guards.guards.filter(g=>e.guards.canSee(g,e.player.pos));
  return <><header><h1>3名执勤人员：实际巡逻与视线空档</h1><p>隔离空场验收 · 共用正式角色显示与世界规则 · 不调用模型</p>
    <button onClick={()=>advance(1)}>推进 1 秒</button><button onClick={()=>advance(10)}>推进 10 秒</button><button onClick={()=>setSession(setup())}>重置</button>
    <p role="status">t={e.t.toFixed(1)}s · 总数 {e.guards.guards.length} · 2名闸机保安＋1名安检巡逻员 · 原击打位置当前{seen.length?`被 ${seen.map(g=>g.def.label).join("、")} 看到`:"无人直接看见"}（不保证之后安全）</p>
    {error&&<p role="alert">{error}</p>}</header>
    <div id="scene"><Canvas camera={{position:[30,30,43],fov:45}} onCreated={({camera})=>camera.lookAt(30,0,15)}>
      <color attach="background" args={["#e6e4d9"]}/><ambientLight intensity={1.5}/><directionalLight position={[25,20,15]} intensity={2}/>
      <mesh rotation={[-Math.PI/2,0,0]} position={[30,-.03,15]}><planeGeometry args={[34,32]}/><meshStandardMaterial color="#d9d8cb"/></mesh><gridHelper args={[34,34,"#98a497","#c5c9bd"]} position={[30,0,15]}/>
      {[26,44].map(x=><mesh key={x} position={[x,.06,15]}><boxGeometry args={[.07,.08,30]}/><meshStandardMaterial color="#897d60"/></mesh>)}
      {e.guards.guards.map(g=><group key={g.def.id}>
        <mesh position={[g.pos.x,.015,g.pos.y]} rotation={[-Math.PI/2,0,-g.facing]}><circleGeometry args={[RULES.guardRange,36,-RULES.guardFovDeg*Math.PI/360,RULES.guardFovDeg*Math.PI/180]}/><meshBasicMaterial color={g.role==="security_staff"?"#d6aa62":"#7f9e92"} transparent opacity={.22} depthWrite={false}/></mesh>
        <group position={[g.pos.x,2.4,g.pos.y]}><Html center style={{whiteSpace:"nowrap",fontSize:13,color:"#243c36",background:"#f8f4e8dd",padding:3}}>{g.def.label} ({g.pos.y.toFixed(1)})</Html></group>
      </group>)}
      {[["player","player"],...e.guards.guards.map(g=>[g.def.id,"guard"])].map(([id,kind])=><Character key={id} id={id} kind={kind as "player"|"guard"} session={session} assetUrl="" assetRotation={0} onAssetError={setError} reducedMotion={true}/>)}
    </Canvas></div><pre>{e.guards.guards.map(g=>`${g.def.label} (${g.pos.x.toFixed(2)},${g.pos.y.toFixed(2)}) 朝向${Math.round(g.facing*180/Math.PI)}° ${g.mode}`).join("\n")}</pre>
  </>;
}
const root=createRoot(document.getElementById("root")!);root.render(<Fixture/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
