import { coversRect } from "../shared/stationFootprint";
import type { WorldDefinition, FloorId } from "../shared/world";
import { propDefinition, type PropPlacement, type PropCluster } from "../shared/stationProps";
import type { Rect } from "./geometry";
import { facilitySolids } from "./facilityGeometry";
import { ESCALATOR_CAPACITY, QUEUE_SPACING } from "./layout";
import { Rng } from "./rng";

const overlap=(a:Rect,b:Rect,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w>b.x-pad&&a.y<b.y+b.h+pad&&a.y+a.h>b.y-pad;
const sameFloor=(r:Rect,floor:FloorId)=>(r.floorId??"concourse")===floor;

/** Architecture-aware placement. Installation geometry and appearance have independent streams. */
export function populateArchitecturalProps(d:WorldDefinition,appearanceSeed=d.seed):PropPlacement[]{
 const l=d.layout,props:PropPlacement[]=[],layout=new Rng(d.seed).fork("v3-prop-layout"),decor=new Rng(appearanceSeed).fork("v3-prop-appearance");
 const occupied=[...l.PILLARS,...(l.solids??[]),...l.ATTRACTIONS.flatMap(a=>a.body?[a.body]:[]),...l.FACILITIES.flatMap(f=>facilitySolids(f.kind,f.pos,f.queueDirection))];
 const reserved:Rect[]=[...l.NAV_NODES.map(n=>({x:n.pos.x-1.2,y:n.pos.y-1.2,w:2.4,h:2.4,floorId:n.pos.floorId})),...l.ITEM_SPOTS.map(n=>({x:n.pos.x-1,y:n.pos.y-1,w:2,h:2,floorId:n.pos.floorId})),...(l.openings??[]).map(r=>({...r,x:r.x-.7,y:r.y-.7,w:r.w+1.4,h:r.h+1.4})),...l.FACILITIES.flatMap(f=>Array.from({length:7},(_,i)=>({x:f.head.x+(f.queueDirection?.x??-1)*i*1.1-.8,y:f.head.y+(f.queueDirection?.y??0)*i*1.1-.8,w:1.6,h:1.6,floorId:f.head.floorId}))),...l.FACILITIES.flatMap(f=>f.exit?[{x:f.exit.x-.8,y:f.exit.y-.8,w:1.6,h:1.6,floorId:f.exit.floorId}]:[])];
 for(const c of d.connectors??[]){
  if(c.arrivalArea)reserved.push(c.arrivalArea);
  reserved.push({x:c.to.x-1.5,y:c.to.y-1.5,w:3,h:3,floorId:c.to.floorId});
  if(c.kind!=="escalator")continue;
  const dx=Math.sign(c.to.x-c.from.x),space=Math.max(1,QUEUE_SPACING),bend=c.queueTurnAfter??4;
  for(let i=0;i<ESCALATOR_CAPACITY;i++)reserved.push({x:c.from.x-dx*Math.min(i,bend)*space-.65,y:c.from.y+dx*Math.max(0,i-bend)*space-.65,w:1.3,h:1.3,floorId:"concourse"});
 }
 const publicPoint=(x:number,y:number,floor:FloorId)=>d.architecture!.areas.some(a=>a.floorId===floor&&x>=a.bounds.x&&x<=a.bounds.x+a.bounds.w&&y>=a.bounds.y&&y<=a.bounds.y+a.bounds.h);
 const wallSpot=(x:number,north:boolean)=>{
  if(!d.architecture?.walls)return {x,z:north?.2:l.HEIGHT-.2};
  const rows=d.architecture.walls.filter(w=>w.side===(north?"north":"south")&&w.to.x-w.from.x>2.5);
  const row=rows.sort((a,b)=>Math.abs(x-Math.max(a.from.x+1,Math.min(a.to.x-1,x)))-Math.abs(x-Math.max(b.from.x+1,Math.min(b.to.x-1,x))))[0];
  return row?{x:Math.max(row.from.x+1,Math.min(row.to.x-1,x)),z:row.from.y+(north?.2:-.2)}:{x,z:north?.2:l.HEIGHT-.2};
 };
 const add=(assetId:string,x:number,z:number,yaw=0,cluster:PropCluster="entrance",floor:FloorId="concourse",elevation=0)=>{
  const a=propDefinition(assetId),storey=d.floors.find(f=>f.id===floor)!,clearance=storey.ceiling-storey.elevation;
  if(elevation<0||elevation+a.size[1]>clearance-.02)return false;
  const side=Math.abs(Math.sin(yaw))>.7,w=side?a.size[2]:a.size[0],h=side?a.size[0]:a.size[2],front={x:Math.sin(yaw),y:Math.cos(yaw)};
  const rect:Rect={x:x-w/2,y:z-h/2,w,h,floorId:floor};
  const useSpace=a.solid?{x:rect.x+Math.min(0,front.x*a.useDepth),y:rect.y+Math.min(0,front.y*a.useDepth),w:w+Math.abs(front.x)*a.useDepth,h:h+Math.abs(front.y)*a.useDepth,floorId:floor}:null;
  if(!publicPoint(x,z,floor))return false;
  if(d.architecture?.layoutType&&a.solid&&!coversRect(useSpace??rect,d.architecture.areas.filter(v=>v.floorId===floor).map(v=>v.bounds)))return false;
  if(a.solid){
   if(![[rect.x,rect.y],[rect.x+w,rect.y],[rect.x,rect.y+h],[rect.x+w,rect.y+h]].every(([cx,cy])=>publicPoint(cx,cy,floor)))return false;
   if([...occupied,...reserved].some(r=>sameFloor(r,floor)&&overlap(useSpace??rect,r,.25)))return false;
   if(props.some(p=>p.body&&p.pos.floorId===floor&&overlap(useSpace??rect,p.useSpace??p.body,.25)))return false;
  }else if(a.mount==="ceiling"&&(l.openings??[]).some(r=>floor==="concourse"&&overlap(rect,r,.25)))return false;
  props.push({id:`v3-${cluster}-${assetId}-${props.length}`,assetId,variant:decor.pick([0,1]),pos:{x,y:z,floorId:floor},elevation,yaw,cluster,body:a.solid?rect:null,useSpace});
  return true;
 };
 const wall=(id:string,x:number,north:boolean,cluster:PropCluster="maintenance",elevation=0)=>{
  const spot=wallSpot(x,north),z=spot.z,a=propDefinition(id);x=spot.x;
  if((d.entrances??[]).some(e=>Math.abs(e.foot.y-z)<2&&Math.abs(e.foot.x-x)<e.width/2+a.size[0]/2+.3))return false;
  return add(id,x,z,north?0:Math.PI,cluster,"concourse",elevation);
 };
 const edge=(id:string,count:number,cluster:PropCluster)=>{
  const a=propDefinition(id),points=[];let placed=0;
  for(let x=3;x<l.WIDTH-3;x+=2.5)for(const north of [true,false])points.push({x,north});
  const centre=cluster==="entrance"?10:cluster==="convenience"?18:cluster==="rest"?44:60;
  points.sort((a,b)=>Math.abs(a.x-centre)-Math.abs(b.x-centre)||(a.north===b.north?0:a.north?-1:1));
  for(const c of points){const spot=wallSpot(c.x,c.north),z=d.architecture?.layoutType?spot.z+(c.north?1:-1)*(.2+a.size[2]/2):c.north?.4+a.size[2]/2:l.HEIGHT-.4-a.size[2]/2;
   if(add(id,spot.x,z,c.north?0:Math.PI,cluster)&&++placed>=count)break;
  }
 };
 edge("bin-double",2,"entrance");edge(layout.pick(["plant-round","plant-square","plant-box"]),2,"rest");
 edge("bench-metal",1,"rest");edge("vending",1,"convenience");edge("charging",1,"convenience");
 edge(layout.pick(["photo-booth","flower-cabinet","toy-cabinet"]),1,"convenience");
 edge("staff-chair",1,"security");edge("storage-cabinet",1,"security");edge("cleaning-cart",1,"maintenance");
 edge("mop-bucket",1,"maintenance");edge("wet-sign",1,"maintenance");
 for(const [i,id] of ["station-map","fare-map","lightbox","aed","fire-cabinet","access-panel"].entries())wall(id,12+i*7,i%2===0,i<3?"entrance":"maintenance",id==="aed"?1.1:id==="access-panel"?1: id==="fire-cabinet"?.7:1.05);
 for(const v of d.architecture!.volumes.filter(v=>v.kind==="room")){
  const east=v.bounds.x===0,x=east?v.bounds.x+v.bounds.w+.08:v.bounds.x-.08;
  add("equipment-door",x,v.bounds.y+v.bounds.h/2,east?Math.PI/2:-Math.PI/2,"maintenance");
 }
 if(d.architecture?.layoutType){
  const scale=1+Math.floor((l.WIDTH-78)/48);
  edge("bench-sage",scale,"rest");edge("charging",scale,"convenience");edge("bin-double",scale,"rest");
 }
 const upper=d.floors.find(f=>f.id==="concourse")!,height=upper.ceiling-upper.elevation;
 for(let x=12;x<l.WIDTH-3;x+=12){
  wall("vent",x,true,"maintenance",height-.45);wall("speaker",x,false,"maintenance",height-.4);
  add("cctv",x,1,0,"maintenance","concourse",height-.4);
  for(const z of [6,24]){add("ceiling-light",x,z,0,"maintenance","concourse",height-.25);add("smoke-detector",x+2,z,0,"maintenance","concourse",height-.15);}
 }
 for(const x of (d.train?[10,l.WIDTH-18]:[10,60])){add("bin-double",x,15,0,"platform","platform");add("bench-metal",x+3,15,0,"platform","platform");add("platform-display",x,15,0,"platform","platform",2.6);add("help-panel",x,21.78,Math.PI,"platform","platform",1.2);}
 for(const e of d.entrances??[])add("drain",e.bottom.x,e.bottom.y,Math.atan2(e.inward.x,e.inward.y),"entrance");
 return props;
}
