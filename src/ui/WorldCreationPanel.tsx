import { previewWorldVersion } from "./worldVersion";
import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { WorldDefinition } from "../shared/world";
import { generateWorld } from "../sim/worldDefinition";
import { randomSeed } from "./seed";
import { resolveWorldSeed, type CreatedWorld, type WorldSeedSource } from "./worldCreation";
import { WorldPlan } from "./WorldPlan";
import { BrandMark } from "./BrandMark";
import styles from "./ControlRoom.module.css";
const WorldPreview=lazy(()=>import("./WorldPreview"));
class PreviewBoundary extends Component<{children:ReactNode;fallback:ReactNode;onUnavailable:(reason:string)=>void},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onUnavailable("三维预览暂时不可用，已切换为同一地图的平面预览。");}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}
export interface WorldCreationProps {
 draft:{seed:number;initial:CreatedWorld|null;revision:number};
 onConfirm:(world:WorldDefinition,source:WorldSeedSource,name:string)=>void;
 onCancel:()=>void;quality:"standard"|"low";reducedMotion:boolean;
}
export function WorldCreation({draft,onConfirm,onCancel,quality,reducedMotion}:WorldCreationProps){
 const [source,setSource]=useState<WorldSeedSource>(draft.initial?.source??{mode:"random",value:String(draft.seed)}),[name,setName]=useState(draft.initial?.name??"");
 const [world,setWorld]=useState<WorldDefinition|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const [view,setView]=useState<"3d"|"concourse"|"platform">("3d"),[reset,setReset]=useState(0),[turn,setTurn]=useState(0),[attempt,setAttempt]=useState(0),[unavailable,setUnavailable]=useState("");
 const fallback=useCallback((reason:string)=>{setUnavailable(reason);setView("concourse");},[]);
 useEffect(()=>{
  let active=true;setBusy(true);setWorld(null);
  const timer=setTimeout(()=>{
   const seed=resolveWorldSeed(source.value);
   if(!seed.ok){setError(seed.error);setBusy(false);return;}
   try{const next=generateWorld(seed.seed,{generatorVersion:previewWorldVersion()});if(active){setWorld(next);setError("");setBusy(false);setTurn(0);}}
   catch{if(active){setError("地图准备失败，请换一个种子后重试。");setBusy(false);}}
  },180);return()=>{active=false;clearTimeout(timer);};
 },[source]);
 const seed=resolveWorldSeed(source.value),canConfirm=!busy&&!error&&world&&seed.ok&&world.seed===seed.seed;
 const plan=world?<WorldPlan world={world} floor={view==="platform"?"platform":"concourse"}/>:null;
 return <Dialog.Root open onOpenChange={open=>{if(!open)onCancel();}}><Dialog.Portal>
  <Dialog.Overlay className={styles.workspaceShade}/>
  <Dialog.Content className={styles.workspace} aria-describedby="world-creation-description">
   <header className={styles.workspaceHeading}><BrandMark/><div><Dialog.Title>创建世界</Dialog.Title><Dialog.Description id="world-creation-description">先看看下一站，再决定如何出发。</Dialog.Description></div><Dialog.Close asChild><button aria-label="关闭创建世界">×</button></Dialog.Close></header>
   <section className={styles.sceneSelection} aria-label="场景选择">
    <div className={styles.sceneChoices}>
     <button type="button" aria-pressed="true"><strong>地铁站</strong><small>可体验</small></button>
     {(["校园","商场"] as const).map(scene=><button type="button" key={scene} aria-pressed="false"><strong>{scene}</strong></button>)}
    </div>
   </section>
   <div className={styles.workspaceBody}>
    <section className={styles.previewColumn} aria-label="地图预览">
     <div className={styles.previewToolbar}>{(["3d","concourse","platform"] as const).map(mode=><button key={mode} aria-pressed={view===mode} onClick={()=>setView(mode)}>{mode==="3d"?"3D预览":mode==="concourse"?"B1站厅":"B2站台"}</button>)}</div>
     <div className={styles.previewViewport} data-testid="world-preview">
      {busy?<div className={styles.previewEmpty} role="status">正在生成地图…</div>:!world?<div className={styles.previewEmpty}>输入种子后预览车站</div>:view!=="3d"?plan:
       <PreviewBoundary key={`${world.layoutHash}:${attempt}`} fallback={plan} onUnavailable={fallback}><Suspense fallback={plan}><WorldPreview world={world} reset={reset} turn={turn} reducedMotion={reducedMotion} quality={quality} onUnavailable={fallback}/></Suspense></PreviewBoundary>}
     </div>
     {view==="3d"?<div className={styles.previewFooter}><span>拖动旋转 · 滚轮缩放 · 仅静态布局</span><div><button aria-label="向左旋转地图" onClick={()=>setTurn(v=>v-1)}>↶</button><button aria-label="向右旋转地图" onClick={()=>setTurn(v=>v+1)}>↷</button><button onClick={()=>setReset(v=>v+1)}>复位</button></div></div>:<p className={styles.hint}>公开车站布局；现场人群、队列与故障仍需进入后观察。</p>}
     {unavailable&&<p className={styles.hint} role="status">{unavailable} <button onClick={()=>{setUnavailable("");setAttempt(v=>v+1);setView("3d");}}>重新尝试3D</button></p>}
    </section>
    <section className={styles.worldForm} aria-label="世界设置">
     <span className={styles.kicker}>YOUR NEXT STATION</span><h2>准备一座新车站</h2>
     <label className="field">世界名称<input autoFocus aria-label="世界名称" maxLength={48} placeholder={world?.name??"我的地铁旅程"} value={name} onChange={e=>setName(e.target.value)}/></label>
     <div className="segmented">{(["random","custom"] as const).map(mode=><button key={mode} aria-pressed={source.mode===mode} className={source.mode===mode?"on":""} onClick={()=>setSource(s=>mode===s.mode?s:mode==="random"?{mode,value:String(randomSeed(world?.seed??draft.seed))}:{...s,mode})}>{mode==="random"?"随机种子":"自定义种子"}</button>)}</div>
     <label className="field">世界种子<div className="row"><input aria-label="世界种子" value={source.value} readOnly={source.mode==="random"} maxLength={128} aria-invalid={!!error} onChange={e=>setSource({mode:"custom",value:e.target.value})}/>{source.mode==="random"&&<button onClick={()=>setSource({mode:"random",value:String(randomSeed(Number(source.value)))})}>换一个</button>}</div></label>
     <p className={styles.hint}>数字或文字均可。同一种子与版本生成同一座车站。</p>
     <div className={styles.worldSummary} role="status">{busy?"正在生成地图…":error|| (world&&<><strong>{world.name}</strong><span>{(world.architecture?.layoutType?({"dual-ended":"双端站厅型","offset-entry":"偏置入口型","open-hall":"开阔站厅型"})[world.architecture.layoutType]:({central:"中央付费区",side:"侧向服务带",dual:"双端入站组团",legacy:"固定车站"})[world.archetype])} · {world.layout.WIDTH} × {world.layout.HEIGHT} m</span><small>双层岛式站台 · {world.layout.FACILITIES.length}组设施</small></>)}</div>
     <div className={styles.worldActions}><button className="primary full-width" disabled={!canConfirm} onClick={()=>canConfirm&&world&&onConfirm(world,source,name.trim()||world.name)}>创建世界 →</button><button className="ghost full-width" onClick={onCancel}>返回休息室</button></div>
    </section>
   </div>
  </Dialog.Content>
 </Dialog.Portal></Dialog.Root>;
}
