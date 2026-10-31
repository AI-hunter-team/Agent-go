import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Engine } from "../sim/engine";
import { captureMapFrame, floorViewport, mapViewportAtZoom, zoomMapViewport, miniMapShowsWhole, miniMapViewport, stationAtlas, type MapNavigation, type MiniMapMode, type MapFrame, type StationAtlas } from "./stationMap";
import { StationMap } from "./FloorMap";
import styles from "./MiniMap.module.css";
const preferenceKey="agent-go:minimap:v1";
export function readRoutePreference(){try{return localStorage.getItem(preferenceKey)!=="false";}catch{return true;}}
export function saveRoutePreference(value:boolean){try{localStorage.setItem(preferenceKey,String(value));}catch{/* Current-page preference remains available. */}}
function useSize(active=true){
 const [element,setElement]=useState<HTMLDivElement|null>(null),[size,setSize]=useState({width:240,height:180});
 const ref=useCallback((node:HTMLDivElement|null)=>setElement(node),[]);
 useEffect(()=>{if(!element||!active)return;const update=()=>{const r=element.getBoundingClientRect();if(r.width&&r.height)setSize({width:r.width,height:r.height});};update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect();},[element,active]);
 return{ref,...size};
}
const zoomLimit=(v:number)=>Math.max(.65,Math.min(12,v));
export function MiniMap({engine}:{engine:Engine}){
 const atlas=useMemo(()=>stationAtlas(engine.world.definition),[engine.world.definition]);
 const frame=captureMapFrame(engine);
 return <StationMapWidget key={atlas.key} atlas={atlas} frame={frame}/>;
}
/** Also accepts replay or arbitrary multi-floor map frames without an Engine. */
export function StationMapWidget({atlas,frame,replay=false}:{atlas:StationAtlas;frame:MapFrame;replay?:boolean}){
 const [route,setRoute]=useState(readRoutePreference),[collapsed,setCollapsed]=useState(()=>typeof window!=="undefined"&&window.innerWidth<=600),[open,setOpen]=useState(false);
 const [miniNavigation,setMiniNavigation]=useState<(MapNavigation & {key:string})|null>(null);
 const [miniMode,setMiniMode]=useState<MiniMapMode>("auto");
 const [manual,setManual]=useState<string|null>(null),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const trigger=useRef<HTMLButtonElement>(null);
 const zoomBy=useCallback((factor:number)=>setZoom(v=>zoomLimit(v*factor)),[]),panBy=useCallback((x:number,y:number)=>setPan(p=>({x:p.x+x,y:p.y+y})),[]);
 const size=useSize(),large=useSize(open);
 const playerFloor=atlas.floors.find(f=>f.id===frame.player.floorId)??atlas.floors[0],floor=atlas.floors.find(f=>f.id===manual)??playerFloor;
 const wholeMini=miniMapShowsWhole(playerFloor,miniMode);
 const baseMiniature=miniMapViewport(playerFloor,frame.player,size.width,size.height,miniMode),miniKey=`${playerFloor.id}:${wholeMini}`;
 const navigation=miniNavigation?.key===miniKey?miniNavigation:{zoom:1,pan:{x:0,y:0}};
 const miniature=mapViewportAtZoom(baseMiniature,navigation);
 const resetMini=()=>setMiniNavigation(null);
 const miniZoomBy=useCallback((factor:number,anchor?:{x:number;y:number})=>setMiniNavigation(current=>{
  const active=current?.key===miniKey?current:{zoom:1,pan:{x:0,y:0}};
  const next=zoomMapViewport(baseMiniature,active,factor,anchor);return next===active&&current?.key===miniKey?current:{key:miniKey,...next};
 }),[miniKey,baseMiniature.x,baseMiniature.y,baseMiniature.w,baseMiniature.h]);
 const miniPanBy=useCallback((x:number,y:number)=>setMiniNavigation(current=>{const active=current?.key===miniKey?current:{zoom:1,pan:{x:0,y:0}};return{key:miniKey,zoom:active.zoom,pan:{x:active.pan.x+x,y:active.pan.y+y}};}),[miniKey]);
 useEffect(()=>setMiniNavigation(null),[playerFloor.id]);
 const viewport=floorViewport(floor,frame.player,large.width,large.height,true,zoom,pan);
 useEffect(()=>{const listener=(event:KeyboardEvent)=>{if(event.code!=="KeyM"||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;const el=event.target as HTMLElement|null;if(el?.closest("textarea,select,[contenteditable=true],input:not([type=checkbox]):not([type=button]):not([type=range])"))return;if(document.querySelector('[role="dialog"][data-state="open"]:not([data-station-map-dialog])'))return;event.preventDefault();setOpen(v=>!v);};window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);},[]);
 const reset=()=>{setManual(null);setZoom(1);setPan({x:0,y:0});};
 const toggleRoute=(value:boolean)=>{setRoute(value);saveRoutePreference(value);};
 return <section className={styles.card} aria-label={replay?"回放小地图":"车站小地图"} data-minimap>
  <header className={styles.heading}><span>{playerFloor.label}</span><div><button aria-label={wholeMini?"切换到附近视图":"切换到全层视图"} title={wholeMini?"查看角色附近":"完整显示当前楼层"} onClick={()=>{setMiniMode(wholeMini?"nearby":"whole");resetMini();}}>{wholeMini?"全层":"附近"}</button><button aria-label={collapsed?"展开小地图":"收起小地图"} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?"展开":"收起"}</button><button ref={trigger} aria-label="打开整站地图" title="整站地图（M）" onClick={()=>{reset();setOpen(true);}}>⛶</button></div></header>
  <div ref={size.ref} data-map-mode={wholeMini?"whole":"nearby"} title="滚轮缩放 · 拖动平移 · 双击复位" onDoubleClick={resetMini} className={`${styles.map} ${collapsed?styles.collapsed:""}`}>
   {!collapsed&&<StationMap atlas={atlas} floor={playerFloor} view={miniature} frame={frame} showRoute={route} width={size.width} height={size.height} onZoom={miniZoomBy} onPan={miniPanBy}/>}
  </div>
  {!collapsed&&<footer className={styles.footer}><p>{frame.transition?`${frame.transition.label} · ${Math.round(frame.transition.progress*100)}%`:frame.target?`目标：${frame.target.label}`:replay?"按记录位置回放":"当前位置"}</p><div className={styles.miniControls}><label><input type="checkbox" checked={route} onChange={e=>toggleRoute(e.target.checked)}/>{replay?"显示已走轨迹":"显示行动路线"}</label><div><output aria-label="小地图缩放比例">{Math.round(navigation.zoom*100)}%</output><button aria-label="复位小地图" title="恢复默认取景" onClick={resetMini}>↺</button></div></div></footer>}
  <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal>
   <Dialog.Overlay className={styles.overlay}/>
   <Dialog.Content data-station-map-dialog className={styles.dialog} onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}>
    <header className={styles.dialogHeading}><div><Dialog.Title>{atlas.name} · 整站地图</Dialog.Title><Dialog.Description>{replay?"按报告中的地图与历史轨迹展示。":"拖动查看，滚轮缩放；地图展开期间沿用当前计时与暂停状态。"}</Dialog.Description></div><Dialog.Close asChild><button aria-label="关闭整站地图">×</button></Dialog.Close></header>
    <div className={styles.toolbar}><label>查看楼层 <select aria-label="查看楼层" value={floor.id} onChange={e=>{setManual(e.target.value);setZoom(1);setPan({x:0,y:0});}}>{atlas.floors.map(f=><option key={f.id} value={f.id}>{f.label}{f.id===playerFloor.id?" · 主角在此":""}</option>)}</select></label><button onClick={reset}>回到主角</button><div className={styles.zoom}><button aria-label="缩小地图" onClick={()=>setZoom(v=>zoomLimit(v/1.3))}>−</button><output>{Math.round(zoom*100)}%</output><button aria-label="放大地图" onClick={()=>setZoom(v=>zoomLimit(v*1.3))}>＋</button><button aria-label="向左平移地图" onClick={()=>setPan(p=>({...p,x:p.x-viewport.w*.2}))}>←</button><button aria-label="向右平移地图" onClick={()=>setPan(p=>({...p,x:p.x+viewport.w*.2}))}>→</button><button aria-label="向上平移地图" onClick={()=>setPan(p=>({...p,y:p.y-viewport.h*.2}))}>↑</button><button aria-label="向下平移地图" onClick={()=>setPan(p=>({...p,y:p.y+viewport.h*.2}))}>↓</button></div></div>
    <p className={styles.location}>{floor.id===playerFloor.id?`主角位于 ${playerFloor.label}`:`正在查看 ${floor.label} · 主角位于 ${playerFloor.label}`}{frame.transition?` · ${frame.transition.label}`:""}</p>
    <div ref={large.ref} className={styles.largeMap}><StationMap atlas={atlas} floor={floor} view={viewport} frame={frame} showRoute={route} expanded width={large.width} height={large.height} onPan={panBy} onZoom={zoomBy}/></div>
    <footer className={styles.legend}><span>➤ 主角</span><span>━ {replay?"已走轨迹":"正在执行的路线"}</span><span>● 当前可见人物</span><label><input type="checkbox" checked={route} onChange={e=>toggleRoute(e.target.checked)}/>{replay?"显示已走轨迹":"显示行动路线"}</label><span>方向固定 · M / Esc 关闭</span></footer>
   </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
 </section>;
}
