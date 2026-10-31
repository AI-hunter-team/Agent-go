/** Unlinked local acceptance harness. It mounts the official simulator, renderer and 2D fallback. */
import { useEffect,useRef,useState,lazy,Suspense } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { generateWorld } from "../sim/worldDefinition";
import type { WorldDescriptor } from "../shared/world";
import { Engine } from "../sim/engine";
import { GameSession } from "../ui/gameSession";
import { FrameMetrics } from "../ui/frameMetrics";
import { DepartureAudio } from "../ui/departureAudio";
import { HeuristicAgent } from "../agent/heuristicAgent";
import { classifyByKeywords } from "../sim/intent";
import { drawStation,SCALE } from "../ui/render";
import { worldViewBounds } from "../sim/entranceGeometry";
const GameScene=lazy(()=>import("../ui/scene/GameScene"));
const params=new URLSearchParams(location.search),noop=()=>{};
type Version=WorldDescriptor["generatorVersion"];
const session=new GameSession(1,{},undefined,true),metrics=new FrameMetrics(),audio=new DepartureAudio();audio.enabled=false;
const inspect=()=>{const read=(window as typeof window&{victoryInspect?:()=>unknown}).victoryInspect;return read?.()??null;};
function load(seed:number,version:Version,benchmark:boolean){
 const d=generateWorld(seed,{version});session.preview(seed,{},undefined,d);
 if(benchmark){
  const e=new Engine(seed,{}, {seed,initialStatus:{},spawns:[],events:[]},undefined,d);e.guards.guards.splice(0);
  const node=d.layout.NAV_NODES.find(n=>n.id==="LANDING_C")!;e.player.pos={...node.pos};e.player.activity={kind:"idle"};e.player.passedGate=e.player.screened=true;
  let count=0;
  for(let x=4;x<d.layout.WIDTH-3&&count<32;x+=2)for(let y=6;y<25&&count<32;y+=2){const pos={x,y,floorId:"concourse"};if(!e.world.spatial.clearOfScenery(pos,pos,.48)||Math.hypot(x-e.player.pos.x,y-e.player.pos.y)<1)continue;e.world.addPerson("normal",pos,{hasTicket:true});count++;}
  if(count!==32)throw new Error("受控客流无法落位");session.engine=e;session.presentation.reset(e);session.setPaused(true);
 }
 session.notify();return d;
}
function Stats(){const [,update]=useState(0);useEffect(()=>{const timer=setInterval(()=>update(n=>n+1),500);return()=>clearInterval(timer);},[]);const d=session.engine.world.definition;return <pre id="validation-stats" style={{whiteSpace:"pre-wrap",fontSize:11,maxHeight:200,overflow:"auto"}}>{JSON.stringify({version:d.generatorVersion,seed:d.seed,hash:d.layoutHash,type:d.architecture?.layoutType,generation:session.generation,t:session.engine.t,status:session.engine.status,activity:session.engine.player.activity.kind,metrics:metrics.summary(),scene:inspect()},null,2)}</pre>;}
function Flat(){const canvas=useRef<HTMLCanvasElement>(null);useEffect(()=>{let raf=0;const paint=()=>{const el=canvas.current;if(el){const b=worldViewBounds(session.engine.world.definition);el.width=Math.ceil(b.w*SCALE);el.height=Math.ceil((b.h*2+4)*SCALE);drawStation(el.getContext("2d")!,session.engine,{showVision:false,showTrail:true,thinking:false});}raf=requestAnimationFrame(paint);};paint();return()=>cancelAnimationFrame(raf);},[]);return <canvas ref={canvas} aria-label="同一世界二维降级" style={{width:"100%",height:"100%",objectFit:"contain"}}/>;}
function App(){
 const [seed,setSeed]=useState(params.get("seed")??"1"),[version,setVersion]=useState<Version>(params.get("worldgen")==="v1"?"metro-v1":"metro-v3"),[quality,setQuality]=useState<"standard"|"low">(params.get("quality")==="low"?"low":"standard"),[benchmark,setBenchmark]=useState(true);
 const [revision,setRevision]=useState(0),[renderer,setRenderer]=useState("3d"),[error,setError]=useState(""),[stress,setStress]=useState<unknown[]>([]),[busy,setBusy]=useState(false),[mode,setMode]=useState<"overview"|"follow">("overview");
 const initial=useRef(false);if(!initial.current){load(Number(seed),version,true);initial.current=true;}
 useEffect(()=>{let raf=0,last=performance.now();const tick=(now:number)=>{session.tick((now-last)/1000);last=now;raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(raf);session.stop();audio.dispose();};},[]);
 const refresh=(nextSeed=Number(seed),nextVersion=version,bench=benchmark)=>{load(nextSeed,nextVersion,bench);setError("");setRenderer("3d");setRevision(n=>n+1);};
 const fail=(message:string)=>{setError(message);setRenderer("2d");};
 const journey=()=>{setBenchmark(false);refresh(Number(seed),version,false);setMode("follow");session.startPrepared(new HeuristicAgent(),async input=>classifyByKeywords(input));session.setSpeed(4);};
 const stressRun=async()=>{setBusy(true);const records:unknown[]=[];const wait=()=>new Promise<void>(resolve=>setTimeout(resolve,450));
  try{for(let i=0;i<=21;i++){const next=i===0||i===21?1:[1,3,7][i%3];flushSync(()=>{load(next,"metro-v3",true);setRevision(n=>n+1);});await wait();records.push({i,seed:next,scene:inspect(),resources:{...metrics.environment}});setStress([...records]);}}
  catch(e){setError(String(e));}finally{setBusy(false);}
 };
 return <main style={{fontFamily:"system-ui",background:"#e8e7dd",minHeight:"100vh",color:"#263d36"}}>
  <header style={{padding:8,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><strong>本地生成器验收 · 正式模块</strong><label>版本 <select aria-label="验收版本" value={version} onChange={e=>setVersion(e.target.value as Version)}><option value="metro-v1">V1基线</option><option value="metro-v2">V2回退</option><option value="metro-v3">V3</option></select></label><label>种子 <input aria-label="验收种子" value={seed} onChange={e=>setSeed(e.target.value)} style={{width:70}}/></label><button onClick={()=>refresh()}>载入世界</button><label><input type="checkbox" checked={benchmark} onChange={e=>setBenchmark(e.target.checked)}/>受控32人客流</label><select aria-label="验收画质" value={quality} onChange={e=>setQuality(e.target.value as "standard"|"low")}><option value="standard">标准画质</option><option value="low">节能画质</option></select><button onClick={()=>{setMode(mode==="overview"?"follow":"overview");setRevision(n=>n+1);}}>切换镜头</button><button onClick={()=>setRenderer(renderer==="3d"?"2d":"3d")}>二维 / 三维</button><button onClick={()=>{metrics.start();session.notify();}}>采样60秒</button><button disabled={busy} onClick={()=>void stressRun()}>连续切换20次</button><button onClick={journey}>完整离线旅程</button><button onClick={()=>session.setSpeed(1)}>正常速度</button><button onClick={()=>session.setPaused(!session.paused)}>暂停 / 继续</button></header>
  {error&&<p role="alert">{error}</p>}
  <section style={{height:"min(70vh,720px)",minHeight:350}} aria-label="验收场景">
   {renderer==="2d"?<Flat/>:<Suspense fallback={<p>载入正式场景…</p>}><GameScene session={session} stage="watch" launchReady fastEntry={false} audio={audio} onRoomAction={noop} camera={{mode,reset:revision}} quality={quality} targetFps={60} simpleCrowd={false} reducedMotion assetUrl="" assetRotation={0} guardAssetUrl="" guardAssetRotation={0} onAssetError={noop} onModelLoadStart={noop} onModelProgress={noop} onModelLoaded={noop} onGuardAssetError={noop} onStationAssetError={message=>setError(message)} onFailure={fail} metrics={metrics} showVision={false} showTrail={false}/></Suspense>}
  </section><Stats/><pre id="stress-results" style={{whiteSpace:"pre-wrap",maxHeight:100,overflow:"auto",fontSize:10}}>{JSON.stringify({busy,completed:Math.max(0,stress.length-2),samples:stress},null,2)}</pre>
 </main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
