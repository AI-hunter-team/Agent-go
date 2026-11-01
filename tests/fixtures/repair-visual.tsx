/** Isolated local UI acceptance: real formal GameScene/replay; preset alert styles; no API/model calls. */
import {useState} from "react";
import {createRoot} from "react-dom/client";
import GameScene from "../../src/ui/scene/GameScene";
import {GameSession} from "../../src/ui/gameSession";
import {FrameMetrics} from "../../src/ui/frameMetrics";
import {createFixtureEngine} from "./scenarios";
import {ReviewRecorder} from "../../src/agent/reviewRecorder";
import {GameRunner} from "../../src/agent/runner";
import {HeuristicAgent} from "../../src/agent/heuristicAgent";
import {TrajectoryReplayView} from "../../src/ui/TrajectoryReplay";
import {DepartureAudio} from "../../src/ui/departureAudio";
import type {GameReport} from "../../src/shared/types";

if(!import.meta.env.DEV)throw new Error("Development fixture only");
function setup(styles=true){
  const session=new GameSession(1),e=createFixtureEngine(undefined,[{id:"visual-guard",label:"现场保安",route:[{x:22,y:11}],facing:Math.PI,speed:.9,pauseSeconds:0}]);
  e.player.pos={x:25.3,y:10};e.takeTriggers();session.engine=e;
  if(styles)for(const [i,level] of (["white","yellow","red"] as const).entries()){
    const n=e.world.addPerson("normal",{x:23+i*1.2,y:8.5});
    e.alerts.records.set(JSON.stringify([n.id,"player"]),{observerId:n.id,subjectId:"player",level,ring:.55,hiddenFor:0,since:0,causeEventId:"preset-visual-only",reaction:null});
  }
  const item=e.world.items.spawn("can",{type:"held",personId:"player",slot:"hand"},"player");
  session.presentation.reset(e);const recorder=new ReviewRecorder();recorder.capture(e);
  return {session,item,recorder,metrics:new FrameMetrics(),audio:new DepartureAudio()};
}
function Acceptance(){
  const [test,setTest]=useState(setup),[,refresh]=useState(0),[view,setView]=useState("playing"),[error,setError]=useState(""),[report,setReport]=useState<GameReport|null>(null);
  const {session,item,recorder,metrics}=test,e=session.engine;
  const show=()=>{session.presentation.settle(e);session.notify();refresh(n=>n+1);};
  const advance=(seconds:number)=>{for(let i=0;i<seconds*10;i++){e.step();recorder.capture(e);}show();};
  const reset=(styles=true)=>{setTest(setup(styles));setView("playing");setReport(null);setError("");};
  const finish=()=>{
    const r=new GameRunner(e,new HeuristicAgent(),async()=>({mechanic:"unsupported",source:"keywords",reason:""}));r.stop();recorder.capture(e,true);
    setReport({...r.report(),worldSnapshots:recorder.snapshot(),replayMotion:recorder.motionSnapshot()});setView("review");show();
  };
  return <><header><h1>小状态点、投掷与终局清理验收</h1><p>隔离场景 · 正式 GameScene 与回放组件 · 样式场景使用预置警戒值 · 不调用模型</p>
    <button onClick={()=>reset()}>重开状态样式场景</button><button onClick={()=>reset(false)}>进入投掷场景</button>
    <button onClick={()=>{e.applyAction({type:"drop",itemId:item.id,mode:"throw",atPosition:{x:20,y:18},reason:"远距离投掷意图"});advance(1);}}>向远处投掷（20,18）</button>
    <button onClick={()=>advance(.2)}>推进 0.2 秒</button><button onClick={()=>advance(1)}>推进 1 秒</button>
    <button onClick={finish}>结束并进入复盘</button><button onClick={()=>setView("lobby")}>返回大厅</button>
    <p role="status">页面：{view} · 世界：{e.status} · t={e.t.toFixed(1)}s · 易拉罐：{item.location.type} · 保安：{e.guards.guards[0].mode} · 照明 {e.world.lightAt({x:35,y:15})}</p>{error&&<p role="alert">{error}</p>}</header>
    <p style={{margin:"0 24px 14px"}}>道具实际坐标：({e.world.items.position(item)?.x.toFixed(2)},{e.world.items.position(item)?.y.toFixed(2)}) · 保安实际坐标：({e.guards.guards[0].pos.x.toFixed(2)},{e.guards.guards[0].pos.y.toFixed(2)}) · 朝向 {Math.round(e.guards.guards[0].facing*180/Math.PI)}°</p>
    <div id="scene"><GameScene session={session} stage="watch" launchReady={true} fastEntry={true} audio={test.audio} onRoomAction={()=>{}} onModelLoadStart={()=>{}} onModelProgress={()=>{}} onModelLoaded={()=>{}} camera={{mode:"follow",reset:0}} quality="low" targetFps={30} simpleCrowd={false} reducedMotion={true} assetUrl="" assetRotation={0} guardAssetUrl="" guardAssetRotation={0} onAssetError={setError} onGuardAssetError={setError} onStationAssetError={setError} onFailure={setError} metrics={metrics} showVision={false} showTrail={false} showInteractionBadges={view==="playing"&&e.status==="running"}/></div>
    {view==="review"&&report&&<section><h2>复盘：此区域不应有悬浮状态点</h2><TrajectoryReplayView report={report} engine={e}/></section>}
    {view==="lobby"&&<section><h2>大厅：此区域不应有悬浮状态点</h2></section>}
  </>;
}
const root=createRoot(document.getElementById("root")!);root.render(<Acceptance/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
