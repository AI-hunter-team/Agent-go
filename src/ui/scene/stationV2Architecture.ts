import { Group } from "three";
import { facilitySolids } from "../../sim/facilityGeometry";
import { stationSwitch } from "../../sim/stationSwitch";
import type { WorldDefinition } from "../../shared/world";
import type { Rect } from "../../sim/geometry";
import { generatedTrainDoors } from "../../shared/generatedTrain";
import { SurfaceBuilder, disposeSurfaceGeometry } from "./surfaceGeometry";
import { createGeneratedPlatform, stairFlight } from "./generatedArchitecture";
import type { GeneratedPalette } from "./generatedSurfaces";
function subtract(r:Rect,h:Rect):Rect[]{
 const x0=Math.max(r.x,h.x),x1=Math.min(r.x+r.w,h.x+h.w),y0=Math.max(r.y,h.y),y1=Math.min(r.y+r.h,h.y+h.h);
 if(x0>=x1||y0>=y1)return[r];
 return[{x:r.x,y:r.y,w:x0-r.x,h:r.h},{x:x1,y:r.y,w:r.x+r.w-x1,h:r.h},{x:x0,y:r.y,w:x1-x0,h:y0-r.y},{x:x0,y:y1,w:x1-x0,h:r.y+r.h-y1}].filter(v=>v.w>.001&&v.h>.001);
}
/** Shared specimen geometry; opaque slabs, openings and guardrails follow the simulated connectors. */
export function createStationV2Architecture(d:WorldDefinition,p:GeneratedPalette){
 const root=new Group(),slabs=new SurfaceBuilder(),walls=new SurfaceBuilder(),roof=new SurfaceBuilder(),edge=new SurfaceBuilder(),trim=new SurfaceBuilder();
 root.name="station-v2-architecture";
 for(const a of d.architecture!.areas.filter(a=>a.floorId==="concourse")){
  let pieces=[a.bounds];for(const hole of d.layout.openings??[])pieces=pieces.flatMap(r=>subtract(r,hole));
  for(const r of pieces){
   slabs.box(p.stone,[r.w,.24,r.h],[r.x+r.w/2,-.12,r.y+r.h/2]);
   roof.box(p.concrete,[r.w,.12,r.h],[r.x+r.w/2,-2.55,r.y+r.h/2]);
  }
 }
 // Segmented facade: entrance apertures have the same positions as the navigation envelope.
 for(const horizontal of [true,false])for(const at of horizontal?[0,30]:[0,72]){
  const length=horizontal?72:30;
  const doors=(d.entrances??[]).filter(e=>Math.abs((horizontal?e.foot.y:e.foot.x)-at)<.01).map(e=>({a:(horizontal?e.foot.x:e.foot.y)-e.width/2,b:(horizontal?e.foot.x:e.foot.y)+e.width/2})).sort((a,b)=>a.a-b.a);
  let begin=0;const spans:{a:number;b:number}[]=[];for(const door of doors){spans.push({a:begin,b:door.a});begin=door.b;}spans.push({a:begin,b:length});
  for(const s of spans){if(s.b<=s.a)continue;const len=s.b-s.a,c=(s.a+s.b)/2,x=horizontal?c:at,z=horizontal?at:c;
   walls.box(p.wall,horizontal?[len,3.6,.25]:[.25,3.6,len],[x,1.8,z]);
   walls.box(p.sage,horizontal?[len,.7,.27]:[.27,.7,len],[x,.48,z]);
   trim.box(p.dark,horizontal?[len,.13,.28]:[.28,.13,len],[x,.065,z]);
   for(let h=.8;h<3.6;h+=.8)trim.box(p.steel,horizontal?[len,.012,.265]:[.265,.012,len],[x,h,z]);
  }
 }
 for(const v of d.architecture!.volumes){const r=v.bounds,base=v.floorId==="platform"?-6:0;
  walls.box(v.kind==="column"?p.paint:p.wall,[r.w,v.height,r.h],[r.x+r.w/2,base+v.height/2,r.y+r.h/2]);
  trim.box(p.dark,[r.w+.025,.13,r.h+.025],[r.x+r.w/2,base+.065,r.y+r.h/2]);
  for(let y=.8;y<v.height;y+=.8)trim.box(p.steel,[r.w+.015,.008,r.h+.015],[r.x+r.w/2,base+y,r.y+r.h/2]);
 }
 // Conveyors share their physical footprint with local avoidance and baggage handling.
 for(const f of d.layout.FACILITIES.filter(f=>f.kind==="security")){
  const r=facilitySolids(f.kind,f.pos,f.queueDirection)[0],x=r.x+r.w/2,z=r.y+r.h/2;
  trim.box(p.steel,[r.w,.14,r.h],[x,.43,z]);trim.box(p.rubber,[r.w-.06,.018,r.h-.06],[x,.508,z]);
  for(const side of [-1,1])trim.box(p.steel,[.07,.36,r.h*.8],[x+side*r.w*.35,.2,z]);
 }
 // Flush maintenance/fire cabinets do not occupy the circulation lane.
 for(const x of d.props?[]:[11.6,60.5]){
  trim.box(p.red,[.62,1.15,.1],[x,1.25,.08]);trim.box(p.glass,[.53,1.04,.02],[x,1.25,.14]);
  trim.box(p.steel,[1.55,2.65,.08],[x+2,1.325,.07]);trim.box(p.paint,[1.43,2.53,.02],[x+2,1.325,.12]);
  trim.bar(p.steel,[x+2.5,1.1,.15],[x+2.5,1.35,.15],.018);
 }
 const power=stationSwitch(d).position;trim.box(p.dark,[.45,1.2,.2],[power.x,1.1,power.y]);trim.box(p.red,[.12,.26,.23],[power.x-.2,1.15,power.y]);
 // Column-aligned beams, slatted ceiling and inset linear lighting.
 for(let x=0;x<72;x+=6){
  roof.box(p.paint,[.4,.22,30],[x,3.48,15]);
  for(const z of [5,15,25])roof.box(p.light,[4.6,.04,.24],[x+3,3.48,z]);
  for(const z of [8,22])roof.box(p.dark,[2.1,.035,.7],[x+3,3.53,z]);
 }
 for(let z=.15;z<30;z+=.32)roof.box(p.paint,[72,.09,.08],[36,3.59,z]);
 roof.box(p.dark,[72,.08,30],[36,3.69,15]);
 for(const r of [...d.layout.SECURITY_BARRIERS,...d.layout.GATE_BARRIERS]){
  const x=r.x+r.w/2;
  edge.bar(p.steel,[x,1.05,r.y],[x,1.05,r.y+r.h],.035);
  edge.bar(p.steel,[x,.15,r.y],[x,.15,r.y+r.h],.025);
  for(let z=r.y;z<=r.y+r.h;z+=1.2)edge.bar(p.steel,[x,0,z],[x,1.05,z],.026);
 }
 for(const c of d.connectors!){
  const h=c.opening;
  for(const z of [h.y,h.y+h.h])walls.box(p.concrete,[h.w,2.35,.1],[h.x+h.w/2,-1.415,z]);
  for(const x of [h.x,h.x+h.w])walls.box(p.concrete,[.1,2.35,h.h],[x,-1.415,h.y+h.h/2]);
  const len=Math.hypot(c.to.x-c.from.x,c.to.y-c.from.y),dx=(c.to.x-c.from.x)/len,dz=(c.to.y-c.from.y)/len;
  for(const side of [-1,1]){
   const a=[c.from.x-dz*1.3*side,0,c.from.y+dx*1.3*side] as [number,number,number];
   const b=[c.to.x+dx*1.2-dz*1.3*side,0,c.to.y+dz*1.3*side+dx*1.3*side] as [number,number,number];
   // Low glass guardrail around the upper-floor void.
   edge.bar(p.steel,[a[0],1.05,a[2]],[b[0],1.05,b[2]],.035);
   edge.box(p.glass,[Math.abs(b[0]-a[0]),.85,.035],[(a[0]+b[0])/2,.5,a[2]]);
   for(let t=0;t<=1;t+=.2)edge.bar(p.steel,[a[0]+(b[0]-a[0])*t,0,a[2]],[a[0]+(b[0]-a[0])*t,1.05,a[2]],.025);
  }
  const flight=stairFlight(p,len,6,c.width,36,c.kind==="escalator");flight.position.set(c.from.x,0,c.from.y);flight.rotation.y=-Math.atan2(dz,dx);flight.name=c.id;root.add(flight);
 }
 const platform=createGeneratedPlatform(d,p);
 root.add(platform.root);
 // Continuous platform screen-door frontage with real openings aligned to train doors.
 const doors=generatedTrainDoors(d);
 for(const side of d.props?[]:[-1,1]){
  const z=15+side*6.82;
  let start=0;
  for(const door of doors.filter(v=>v.side===side).sort((a,b)=>a.pos.x-b.pos.x)){
   const left=door.pos.x-.78,right=door.pos.x+.78;
   if(left>start){trim.box(p.glass,[left-start,2.3,.045],[(left+start)/2,-4.85,z]);trim.box(p.dark,[left-start,.12,.09],[(left+start)/2,-5.82,z]);}
   for(const x of [left,right])trim.box(p.steel,[.075,2.5,.13],[x,-4.75,z]);
   // The header number is built into the shared static batch (car-door, e.g. 1-2).
   const digits=door.id.split("_").slice(-2).join("-");
   const segments:Record<string,string>={"0":"abcedf","1":"bc","2":"abged","3":"abgcd","4":"fgbc","5":"afgcd","6":"afgecd","7":"abc","8":"abcdefg","9":"abfgcd","-":"g"};
   for(const [index,digit] of [...digits].entries())for(const seg of segments[digit]??""){
    const vertical="bcef".includes(seg),sx=seg==="b"||seg==="c"?.065:seg==="e"||seg==="f"?-.065:0,sy=seg==="a"?.13:seg==="d"?-.13:seg==="b"||seg==="f"?.065:seg==="c"||seg==="e"?-.065:0;
    trim.box(p.dark,vertical?[.018,.11,.018]:[.13,.018,.018],[door.pos.x+(index-(digits.length-1)/2)*.21+sx,-3.24+sy,z-side*.13]);
   }
   // Open leaf panels remain visible alongside the opening.
   trim.box(p.glass,[.7,2.25,.04],[left-.38,-4.85,z-.06*side]);trim.box(p.glass,[.7,2.25,.04],[right+.38,-4.85,z-.06*side]);
   trim.box(p.tactile,[1.55,.016,.12],[door.pos.x,-5.984,z-side*.6]);start=right;
  }
  if(start<72)trim.box(p.glass,[72-start,2.3,.045],[(72+start)/2,-4.85,z]);
  trim.box(p.paint,[72,.45,.24],[36,-3.27,z]);trim.box(p.jade,[72,.045,.255],[36,-3.33,z]);
 }
 // Lower ceiling repeats a shallow beam and light rhythm, without opening new holes.
 for(let x=3;x<72;x+=6){roof.box(p.paint,[.3,.18,14],[x,-2.68,15]);for(const z of [10,20])roof.box(p.light,[4.6,.04,.2],[x,-2.75,z]);}
 const deck=slabs.finish("v2-floor-slabs"),structure=walls.finish("v2-walls-columns"),ceiling=roof.finish("v2-ceilings"),rails=edge.finish("v2-guardrails"),fittings=trim.finish("v2-trim-screen-doors");
 root.add(deck,structure,ceiling,rails,fittings);
 return {root,deck,ceiling,structure,dispose(){platform.dispose();root.remove(platform.root);disposeSurfaceGeometry(root);}};
}
