import type { WorldDefinition } from "../shared/world";
import type { Vec } from "../shared/types";
import type { Rect } from "../sim/geometry";
import type { Engine } from "../sim/engine";
import { playerCanSee } from "../sim/observation";

export interface MapPoint { x:number; y:number; floorId:string }
export interface MapShape { id:string; bounds:Rect; kind:"floor"|"paid"|"wall"|"pillar"|"detail"|"track" }
export interface MapStroke { id:string; points:readonly {x:number;y:number}[]; width:number }
export interface MapMarker extends MapPoint { id:string; label:string; kind:"tvm"|"security"|"gate"|"stairs"|"escalator"|"entrance"|"service" }
export interface MapFloor { id:string; label:string; elevation:number; bounds:Rect; shapes:readonly MapShape[]; strokes:readonly MapStroke[]; markers:readonly MapMarker[] }
export interface MapConnection { id:string; label:string; kind:"stairs"|"escalator"|"entrance"; from:MapPoint; to:MapPoint }
/** Renderer contract independent of the current two-floor generator and its FloorId union. */
export interface StationAtlas { key:string; name:string; floors:readonly MapFloor[]; connections:readonly MapConnection[] }
export interface RouteSegment { floorId:string; points:readonly MapPoint[] }
export interface MapFrame {
  player:MapPoint & {yaw:number}; route:readonly RouteSegment[]; target:(MapPoint & {label:string})|null;
  transition?:{label:string;toFloor:string;progress:number};
  people:readonly (MapPoint & {id:string;guard:boolean})[];
  facilities:readonly {id:string;status:string}[];
}
const cache=new WeakMap<WorldDefinition,StationAtlas>();
const point=(v:Vec,fallback:string):MapPoint=>({x:v.x,y:v.y,floorId:v.floorId??fallback});
const labels:Record<string,string>={concourse:"B1 站厅",platform:"B2 站台"};
export function fitBounds(rects:readonly Rect[],padding=3):Rect {
  if(!rects.length)return{x:0,y:0,w:20,h:20};
  const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
  return{x:x-padding,y:y-padding,w:Math.max(1,Math.max(...rects.map(r=>r.x+r.w))-x)+padding*2,h:Math.max(1,Math.max(...rects.map(r=>r.y+r.h))-y)+padding*2};
}
export function stationAtlas(world:WorldDefinition):StationAtlas {
  const old=cache.get(world);if(old)return old;
  const l=world.layout,legacy=world.generatorVersion==="legacy-v0";
  const floors:MapFloor[]=world.floors.filter(f=>!legacy||f.id==="concourse").map(f=>({id:f.id,label:legacy?"旧版车站":labels[f.id]??f.id,elevation:f.elevation,bounds:{...f.bounds},shapes:[],strokes:[],markers:[]}));
  const get=(id:string)=>floors.find(f=>f.id===id);
  const addShape=(id:string,shape:MapShape)=>{const f=get(id);if(f)f.shapes=[...f.shapes,shape];};
  const addMarker=(marker:MapMarker)=>{const f=get(marker.floorId);if(f)f.markers=[...f.markers,marker];};
  const connections:MapConnection[]=[];
  for(const f of floors)addShape(f.id,{id:`envelope:${f.id}`,kind:"floor",bounds:f.bounds});
  for(const [i,r] of world.regions.entries())addShape(r.floorId,{id:`region:${i}`,bounds:r.bounds,kind:r.kind==="landing"?"paid":"floor"});
  const upper=get("concourse")??floors[0];
  if(upper){
    for(const [i,bounds] of [...l.SECURITY_BARRIERS,...l.GATE_BARRIERS].entries())addShape(upper.id,{id:`boundary:${i}`,kind:"wall",bounds});
    for(const [i,bounds] of l.PILLARS.entries())addShape(upper.id,{id:`pillar:${i}`,kind:"pillar",bounds});
  }
  for(const d of world.details)if(d.body)addShape(d.pos.floorId??upper.id,{id:d.id,kind:"detail",bounds:d.body});
  for(const f of l.FACILITIES)addMarker({...point(f.pos,upper.id),id:f.id,label:f.label,kind:f.kind});
  for(const a of l.ATTRACTIONS)addMarker({...point(a.pos,upper.id),id:a.id,label:a.label,kind:"service"});
  if(!legacy){
    const platform=get("platform");
    if(platform){const axis=l.platformAxis??{direction:"x",center:l.HEIGHT/2,halfWidth:7},vertical=axis.direction==="y",length=vertical?l.HEIGHT:l.WIDTH;
      const body=vertical?{x:axis.center-7,y:0,w:14,h:length}:{x:0,y:axis.center-7,w:length,h:14};
      platform.shapes=platform.shapes.filter(s=>s.id!==`envelope:${platform.id}`);
      platform.shapes=[{id:`envelope:${platform.id}`,kind:"floor",bounds:body},...platform.shapes];
      platform.bounds=body;
      for(const side of [-1,1])addShape(platform.id,{id:`track:${side}`,kind:"track",bounds:vertical?{x:axis.center+side*8.7-1.65,y:0,w:3.3,h:length}:{x:0,y:axis.center+side*8.7-1.65,w:length,h:3.3}});
      platform.bounds=fitBounds([platform.bounds,...platform.shapes.map(s=>s.bounds)],0);
    }
  }
  for(const kind of ["stairs","escalator"] as const){
    const from=point(kind==="stairs"?l.STAIRS_TOP:l.ESCALATOR_TOP,upper.id),to=point(kind==="stairs"?l.STAIRS_BOTTOM:l.ESCALATOR_BOTTOM,legacy?upper.id:"platform");
    connections.push({id:kind,label:kind==="stairs"?"楼梯":"扶梯",kind,from,to});
    for(const p of [from,to])addMarker({...p,id:`${kind}:${p.floorId}:${p.x}`,label:kind==="stairs"?"楼梯":"扶梯",kind});
  }
  for(const e of world.entrances??[]){
    const id=`entry:${e.id}`,destination=e.bottom.floorId??upper.id;
    floors.push({id,label:`${e.id}口通道`,elevation:e.top.elevation,bounds:e.bounds,shapes:[],markers:[],strokes:[{id:`entry:${e.id}`,points:[e.source,e.top,e.foot,e.bottom],width:e.width}]});
    const f=get(destination);if(f){f.strokes=[...f.strokes,{id:`entry:${e.id}`,points:[e.source,e.top,e.foot,e.bottom],width:e.width}];f.bounds=fitBounds([f.bounds,e.bounds],0);}
    connections.push({id:`entrance:${e.id}`,label:`${e.id}口入站楼梯`,kind:"entrance",from:point(e.top,id),to:point(e.bottom,destination)});
    addMarker({...point(e.top,id),id:`entry:${e.id}`,kind:"entrance",label:`${e.id}口`});
    addMarker({...point(e.bottom,destination),id:`entry:${e.id}:exit`,kind:"entrance",label:`${e.id}口`});
  }
  const atlas:StationAtlas={key:`${world.generatorVersion}:${world.layoutHash}`,name:world.name,floors,connections};cache.set(world,atlas);return atlas;
}
/** Never draws a line between overlapping positions on different floors. */
export function splitRoute(points:readonly MapPoint[]):RouteSegment[]{
  const segments:{floorId:string;points:MapPoint[]}[]=[];
  for(const p of points){let last=segments.at(-1);if(!last||last.floorId!==p.floorId){last={floorId:p.floorId,points:[]};segments.push(last);}last.points.push(p);}
  return segments;
}
export function captureMapFrame(engine:Engine):MapFrame {
  const w=engine.world,p=engine.player,a=p.activity,atlas=stationAtlas(w.definition),legacy=w.definition.generatorVersion==="legacy-v0";
  let floorId=p.pos.floorId??"concourse",transition:MapFrame["transition"],route:RouteSegment[]=[],target:MapFrame["target"]=null;
  if(a.kind==="stairs"||a.kind==="escalator"){
    const kind=a.kind==="stairs"?(a.route??"stairs"):"escalator",connection=atlas.connections.find(c=>c.id===kind)!;
    floorId=connection.from.floorId;const progress=Math.max(0,Math.min(1,1-a.remaining/(a.duration??(kind==="stairs"?6:10))));
    transition={label:`${atlas.floors.find(f=>f.id===floorId)?.label} → ${atlas.floors.find(f=>f.id===connection.to.floorId)?.label}`,toFloor:connection.to.floorId,progress};
    route=[{floorId,points:[point(p.pos,floorId),connection.to].map(v=>({...v,floorId}))}];
    target={...connection.to,label:connection.label+"出口"};
  }else if(a.kind==="entering"){
    const e=w.definition.entrances?.find(e=>e.id===a.entranceId);
    if(e){floorId=`entry:${e.id}`;const bottom=point(e.bottom,"concourse");transition={label:`${e.id}口 → ${atlas.floors.find(f=>f.id===bottom.floorId)?.label}`,toFloor:bottom.floorId,progress:a.progress};
      const ahead=(e.foot.x-p.pos.x)*e.inward.x+(e.foot.y-p.pos.y)*e.inward.y>0;
      route=[{floorId,points:[p.pos,...(ahead?[e.foot]:[]),e.bottom].map(v=>({...point(v,floorId),floorId}))}];target={...bottom,label:"站厅入口"};}
  }else if(a.kind==="to_escalator"){
    // Transit moves toward its live queue slot; Activity.path is an initial, unconsumed path.
    const index=w.transit.queue.indexOf(p.id);
    if(index>=0){const end=point(w.transit.slot(index),floorId);route=splitRoute([point(p.pos,floorId),end]);target={...end,label:"扶梯队尾"};}
  }else if(a.kind==="walking"||a.kind==="to_queue"){
    const points=[point(p.pos,floorId),...a.path.map(v=>point(v,floorId))];route=splitRoute(points);
    const end=points.at(-1);if(end&&points.length>1)target={...end,label:a.kind==="walking"?a.label:w.facility(a.facility)?.def.label??a.facility};
  }else if(a.kind==="queued"||a.kind==="service"){
    const f=w.facility(a.facility);if(f)target={...point(f.def.pos,floorId),label:f.def.label};
  }else if(a.kind==="creative"){
    const end=point(a.dest,floorId);route=splitRoute([point(p.pos,floorId),end]);target={...end,label:"当前动作落点"};
  }
  if(!atlas.floors.some(f=>f.id===floorId))floorId=legacy?atlas.floors[0].id:"concourse";
  const visible=(v:Vec)=>playerCanSee(p.pos,v,w.lightAt,w.layout);
  const heading=route.find(s=>s.floorId===floorId)?.points.find(v=>Math.hypot(v.x-p.pos.x,v.y-p.pos.y)>.01)??(target?.floorId===floorId?target:null);
  const yaw=heading?Math.atan2(heading.x-p.pos.x,heading.y-p.pos.y):Math.PI/2-p.facing;
  return{player:{...point(p.pos,floorId),floorId,yaw},route,target,transition,
    people:[...w.persons.values()].filter(v=>!v.isPlayer&&visible(v.pos)).map(v=>({...point(v.pos,"concourse"),id:v.id,guard:false})).concat(engine.guards.guards.filter(g=>visible(g.pos)).map(g=>({...point(g.pos,"concourse"),id:g.def.id,guard:true}))),
    facilities:[...w.facilities.values()].filter(f=>visible(f.def.pos)).map(f=>({id:f.def.id,status:f.status}))};
}
export function floorViewport(floor:MapFloor,player:MapPoint,width:number,height:number,whole:boolean,zoom=1,pan={x:0,y:0},paddingPx=0):Rect {
  const aspect=Math.max(.1,width/Math.max(1,height)),bounds=fitBounds([floor.bounds]);
  const inset=Math.min(Math.max(0,paddingPx),Math.min(width,height)*.2);
  const fitW=Math.max(bounds.w*width/Math.max(1,width-inset*2),bounds.h*width/Math.max(1,height-inset*2)),fitH=fitW/aspect;
  const span=whole?fitW:Math.min(fitW,48*aspect),w=span/zoom,h=(whole?fitH:span/aspect)/zoom;
  const center=whole||fitW<=48*aspect?{x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2}:player;
  const clamp=(v:number,min:number,max:number)=>min>max?(min+max)/2:Math.max(min,Math.min(max,v));
  const cx=whole?center.x:clamp(center.x,bounds.x+w/2,bounds.x+bounds.w-w/2),cy=whole?center.y:clamp(center.y,bounds.y+h/2,bounds.y+bounds.h-h/2);
  return{x:cx+pan.x-w/2,y:cy+pan.y-h/2,w,h};
}
export function visibleMarkers(markers:readonly MapMarker[],view:Rect,pixelWidth:number,expanded:boolean):{marker:MapMarker;count:number}[]{
  const inside=markers.filter(m=>m.x>=view.x&&m.x<=view.x+view.w&&m.y>=view.y&&m.y<=view.y+view.h),cell=view.w/Math.max(1,pixelWidth)*24;
  if(expanded&&view.w/pixelWidth<.12)return inside.map(marker=>({marker,count:1}));
  const groups=new Map<string,{marker:MapMarker;count:number}>();
  for(const marker of inside){const key=`${marker.kind}:${Math.floor(marker.x/cell)}:${Math.floor(marker.y/cell)}`,group=groups.get(key);if(group)group.count++;else groups.set(key,{marker,count:1});}
  return [...groups.values()];
}
export function routeVisible(frame:MapFrame,floorId:string){return frame.route.filter(s=>s.floorId===floorId&&s.points.length>1);}
export function edgeTarget(target:MapPoint,view:Rect):{x:number;y:number;angle:number}|null{
  if(target.x>=view.x&&target.x<=view.x+view.w&&target.y>=view.y&&target.y<=view.y+view.h)return null;
  const cx=view.x+view.w/2,cy=view.y+view.h/2,dx=target.x-cx,dy=target.y-cy,t=Math.min(view.w*.43/Math.max(.0001,Math.abs(dx)),view.h*.4/Math.max(.0001,Math.abs(dy)));
  return{x:cx+dx*t,y:cy+dy*t,angle:Math.atan2(dy,dx)*180/Math.PI};
}

/** Old reports contain past samples, not a snapshot of the then-planned future path. */
export function replayMapFrame(atlas:StationAtlas,frame:import("../replay/trajectory").ReplayFrame):MapFrame {
 const resolve=(v:Vec):MapPoint=>{
  const connection=atlas.connections.find(c=>`transit:${c.id}`===v.floorId);
  return{...point(v,atlas.floors[0].id),floorId:connection?.from.floorId??(atlas.floors.some(f=>f.id===v.floorId)?v.floorId!:atlas.floors[0].id)};
 };
 const position=resolve(frame.position??{x:0,y:0}),last=frame.trail.at(-2),yaw=last?Math.atan2(position.x-last.x,position.y-last.y):0;
 return{player:{...position,yaw},route:splitRoute(frame.trail.map(resolve)),target:null,people:[],facilities:[]};
}

export type MiniMapMode="auto"|"whole"|"nearby";
/** Current compact stations fit in full; much larger floors retain a readable local view. */
export function miniMapShowsWhole(floor:MapFloor,mode:MiniMapMode):boolean {
 return mode==="whole"||(mode==="auto"&&Math.max(floor.bounds.w,floor.bounds.h)<=160);
}
export function miniMapViewport(floor:MapFloor,player:MapPoint,width:number,height:number,mode:MiniMapMode="auto"):Rect {
 const whole=miniMapShowsWhole(floor,mode);
 return floorViewport(floor,player,width,height,whole,1,{x:0,y:0},whole?18:0);
}

export interface MapNavigation { zoom:number; pan:{x:number;y:number} }
export function mapViewportAtZoom(base:Rect,navigation:MapNavigation):Rect {
 const w=base.w/navigation.zoom,h=base.h/navigation.zoom;
 return{x:base.x+base.w/2+navigation.pan.x-w/2,y:base.y+base.h/2+navigation.pan.y-h/2,w,h};
}
/** Keep the world point beneath the pointer at the same pixel while zooming. */
export function zoomMapViewport(base:Rect,current:MapNavigation,factor:number,anchor?:{x:number;y:number}):MapNavigation {
 if(!Number.isFinite(factor)||factor<=0)return current;
 const zoom=Math.max(.65,Math.min(12,current.zoom*factor));if(zoom===current.zoom)return current;
 const cx=base.x+base.w/2,cy=base.y+base.h/2,point=anchor??{x:cx+current.pan.x,y:cy+current.pan.y},ratio=current.zoom/zoom;
 return{zoom,pan:{x:point.x+(cx+current.pan.x-point.x)*ratio-cx,y:point.y+(cy+current.pan.y-point.y)*ratio-cy}};
}
