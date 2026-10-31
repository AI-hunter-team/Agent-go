import { memo, useEffect, useMemo, useRef, type PointerEvent } from "react";
import type { Rect } from "../sim/geometry";
import { edgeTarget, routeVisible, visibleMarkers, type MapFloor, type MapFrame, type MapMarker, type StationAtlas } from "./stationMap";
const colors={floor:"#eeeade",paid:"#d5e1d7",wall:"#6d8177",pillar:"#a4b0a4",detail:"#c1cbb9",track:"#718078"};
const trace=(points:readonly {x:number;y:number}[])=>points.map((p,i)=>`${i?"L":"M"}${p.x} ${p.y}`).join(" ");
const FloorBase=memo(function FloorBase({floor,atlas}:{floor:MapFloor;atlas:StationAtlas}){
 return <g data-map-layer="static">
  {floor.shapes.map(s=><rect key={s.id} x={s.bounds.x} y={s.bounds.y} width={s.bounds.w} height={s.bounds.h} fill={colors[s.kind]} stroke={s.kind==="floor"?"#a4b1a4":"none"} strokeWidth=".15"/>)}
  {floor.strokes.map(s=><path key={s.id} d={trace(s.points)} fill="none" stroke="#e7e3d5" strokeWidth={s.width} strokeLinecap="square"/>)}
  {atlas.connections.filter(c=>c.kind!=="entrance"&&(c.from.floorId===floor.id||c.to.floorId===floor.id)).map(c=><g key={c.id}><path d={trace([c.from,c.to])} stroke={c.kind==="stairs"?"#c8cbbb":"#9fbcaf"} strokeWidth="2.2"/>{Array.from({length:9},(_,i)=>{const t=(i+.5)/9,x=c.from.x+(c.to.x-c.from.x)*t,y=c.from.y+(c.to.y-c.from.y)*t,angle=Math.atan2(c.to.y-c.from.y,c.to.x-c.from.x);return <path key={i} d={`M${x-Math.sin(angle)} ${y+Math.cos(angle)}L${x+Math.sin(angle)} ${y-Math.cos(angle)}`} stroke="#718b7a" strokeWidth=".12"/>;})}</g>)}
 </g>;
});
function Icon({kind}:{kind:MapMarker["kind"]}){
 if(kind==="stairs")return <path d="M-5 4h3v-3h3v-3h4"/>;
 if(kind==="escalator")return <><path d="M-5 4h3l5-8h3M-5 1h2l5-8"/><path d="M-3-5v-1"/></>;
 if(kind==="gate")return <><path d="M-4-5v10M4-5v10M-2 0h4m-2-2 2 2-2 2"/></>;
 if(kind==="tvm")return <><rect x="-4" y="-5" width="8" height="10" rx="1"/><path d="M-2-2h4M-2 2h1m2 0h1"/></>;
 if(kind==="security")return <><path d="M-5 5V-5H5V5M-2 0h4M0-2v4"/></>;
 if(kind==="entrance")return <path d="M-4 5V-5H4V5M-2 0h6m-2-2 2 2-2 2"/>;
 return <><circle r="4"/><path d="M0-2v4M0-4v.5"/></>;
}
export interface StationMapProps {
 atlas:StationAtlas; floor:MapFloor; view:Rect; frame?:MapFrame; showRoute?:boolean; expanded?:boolean;
 width?:number; height?:number; onPan?:(dx:number,dy:number)=>void; onZoom?:(factor:number,anchor?:{x:number;y:number})=>void;
}
export const StationMap=memo(function StationMap({atlas,floor,view,frame,showRoute=true,expanded=false,width=240,height=180,onPan,onZoom}:StationMapProps){
 const svg=useRef<SVGSVGElement>(null),drag=useRef<{id:number;x:number;y:number}|null>(null);
 const scale=Math.max(view.w/width,view.h/height),markers=useMemo(()=>visibleMarkers(floor.markers,view,width,expanded),[floor,view,width,expanded]);
 const markerScale=scale*(expanded?1:.68);
 const target=showRoute&&frame?.target?.floorId===floor.id?frame.target:null,edge=target?edgeTarget(target,view):null;
 const move=(e:PointerEvent<SVGSVGElement>)=>{const d=drag.current,rect=svg.current?.getBoundingClientRect();if(!d||!rect||d.id!==e.pointerId)return;onPan?.(-(e.clientX-d.x)/rect.width*view.w,-(e.clientY-d.y)/rect.height*view.h);d.x=e.clientX;d.y=e.clientY;};
 const stop=(e:PointerEvent<SVGSVGElement>)=>{if(drag.current?.id===e.pointerId)drag.current=null;};
 useEffect(()=>{const element=svg.current;if(!element||!onZoom)return;const wheel=(event:WheelEvent)=>{event.preventDefault();const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1),matrix=element.getScreenCTM();const anchor=matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()):undefined;onZoom(Math.exp(-Math.max(-800,Math.min(800,pixels))*.0015),anchor);};element.addEventListener("wheel",wheel,{passive:false});return()=>element.removeEventListener("wheel",wheel);},[onZoom]);
 return <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="img" aria-label={`${atlas.name} · ${floor.label}${expanded?"，可拖动与缩放":"小地图"}`} data-map-floor={floor.id} data-map-key={atlas.key}
  onPointerDown={e=>{if(!onPan||e.button!==0)return;svg.current?.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};}} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={()=>{drag.current=null;}} style={{display:"block",background:"#f4f1e6",touchAction:onPan?"none":"auto",cursor:onPan?"grab":undefined}}>
  <FloorBase floor={floor} atlas={atlas}/>
  {showRoute&&frame&&<g data-map-layer="route">{routeVisible(frame,floor.id).map((s,i)=><path key={i} d={trace(s.points)} fill="none" stroke="#218778" strokeWidth={2.6*scale} strokeLinecap="round" strokeLinejoin="round"/> )}</g>}
  <g data-map-layer="facilities">{markers.map(({marker:m,count})=>{const status=frame?.facilities.find(f=>f.id===m.id)?.status,broken=status&&status!=="open";return <g key={m.id} data-map-marker data-marker-size={expanded?18:12.24} transform={`translate(${m.x} ${m.y}) scale(${markerScale})`}><title>{`${m.label}${count>1?`等 ${count} 处`:""}${broken?" · 已观察到停用":""}`}</title><rect x="-9" y="-9" width="18" height="18" rx="5" fill={broken?"#a0503e":"#fffdf2"} stroke={broken?"#a0503e":"#8ba196"}/><g fill="none" stroke={broken?"#fff":"#385f54"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><Icon kind={m.kind}/></g>{count>1&&<g><circle cx="9" cy="-8" r="6" fill="#466e5d"/><text x="9" y="-5" textAnchor="middle" fill="white" fontSize="8">{count}</text></g>}{expanded&&scale<.2&&<text x="0" y="20" fontSize="10" textAnchor="middle" fill="#36584b" paintOrder="stroke" stroke="#f4f1e6" strokeWidth="3">{m.label}</text>}</g>;})}</g>
  {frame&&<g data-map-layer="observed">{frame.people.filter(p=>p.floorId===floor.id).map(p=><g key={p.id}><title>{p.guard?"可见工作人员":"可见乘客"}</title><circle cx={p.x} cy={p.y} r={(p.guard?3:2)*scale} fill={p.guard?"#c68a40":"#8c9e90"}/></g>)}</g>}
  {target&&!edge&&<g data-map-layer="target" transform={`translate(${target.x} ${target.y}) scale(${scale})`}><title>{target.label}</title><circle r="12" fill="none" stroke="#218778" strokeWidth="2"/><circle r="2" fill="#218778"/></g>}
  {edge&&<g data-map-layer="edge-target" transform={`translate(${edge.x} ${edge.y}) rotate(${edge.angle}) scale(${scale})`}><title>{`${target?.label}在地图范围外`}</title><circle r="10" fill="#fffdf2" stroke="#218778"/><path d="M-4-4 3 0-4 4" fill="none" stroke="#218778" strokeWidth="2"/></g>}
  {frame?.player.floorId===floor.id&&<g data-map-layer="player" transform={`translate(${frame.player.x} ${frame.player.y}) rotate(${-frame.player.yaw*180/Math.PI}) scale(${scale})`}><title>主角当前位置</title><circle r="10" fill="#fffdf2" fillOpacity=".85"/><path d="M0 8-5-6 0-3 5-6Z" fill="#166957" stroke="white" strokeWidth="1.5"/></g>}
 </svg>;
});
