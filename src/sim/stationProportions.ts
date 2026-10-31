import { platformClearanceBlocks } from "../shared/connectorGeometry";
import type { WorldDefinition } from "../shared/world";
import type { Rect } from "./geometry";
import { ESCALATOR_REACH,ESCALATOR_CAPACITY,QUEUE_SPACING } from "./layout";
import type { Vec } from "../shared/types";
import { createMovement } from "./movement";
import { createNavigation } from "./nav";
import { entranceLength } from "./entranceGeometry";
import { generatedTrainDoors } from "../shared/generatedTrain";
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

/** New arrival aprons are an explicit geometric contract; historical worlds are not reinterpreted. */
export function validateStationProportions(d:WorldDefinition):string[]{
 const all=(d.connectors??[]).filter(c=>c.arrivalArea);
 const groups=[...new Set(all.map(c=>c.groupId))].map(id=>all.find(c=>c.groupId===id)!);
 if(!groups.length)return [];
 const spatial=createMovement(d.layout,platformClearanceBlocks(d.connectors).map(v=>v.bounds)),errors:string[]=[],floor=d.floors.find(f=>f.id==="platform")!;
 for(const c of all){const a=c.arrivalArea!;
  if(c.kind==="escalator"){
   const bend=c.queueTurnAfter??4,len=Math.hypot(c.to.x-c.from.x,c.to.y-c.from.y),dx=(c.to.x-c.from.x)/len,dy=(c.to.y-c.from.y)/len,spacing=Math.max(1,QUEUE_SPACING);
   if(!Number.isInteger(bend)||bend<0)errors.push(`invalid queue bend ${c.id}`);
   for(let i=0;i<ESCALATOR_CAPACITY;i++){
    const straight=Math.min(i,bend)*spacing,turn=Math.max(0,i-bend)*spacing;
    const slot={...c.from,x:c.from.x-dx*straight-dy*turn,y:c.from.y-dy*straight+dx*turn};
    if(!spatial.clearOfScenery(slot,slot,.48))errors.push(`queue footprint blocked ${c.id}`);
   }
  }
  if(c.kind==="escalator"&&Math.hypot(c.approach.x-c.from.x,c.approach.y-c.from.y)+.2>ESCALATOR_REACH)errors.push(`approach outside admission reach ${c.id}`);
  if(c.to.x<a.x||c.to.x>a.x+a.w||c.to.y<a.y||c.to.y>a.y+a.h)errors.push(`arrival misses connector ${c.id}`);
  if(JSON.stringify(a)!==JSON.stringify(groups.find(g=>g.groupId===c.groupId)!.arrivalArea))errors.push(`inconsistent group apron ${c.groupId}`);
  if(a.floorId!=="platform"||a.x<floor.bounds.x||a.y<floor.bounds.y||a.x+a.w>floor.bounds.x+floor.bounds.w||a.y+a.h>floor.bounds.y+floor.bounds.h)errors.push(`arrival outside platform ${c.groupId}`);
  for(const r of [...d.layout.PILLARS,...(d.layout.solids??[])])if((r.floorId??"concourse")==="platform"&&overlaps(a,r))errors.push(`arrival blocked ${c.groupId}`);
  for(const p of d.props??[])if(p.pos.floorId==="platform"&&p.useSpace&&overlaps(a,p.useSpace))errors.push(`arrival use space blocked ${c.groupId}`);
 }
 for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
  if(all.filter(c=>c.groupId===groups[i].groupId).some(a=>all.filter(c=>c.groupId===groups[j].groupId).some(b=>Math.hypot(a.to.x-b.to.x,a.to.y-b.to.y)<24-1e-6))||overlaps(groups[i].arrivalArea!,groups[j].arrivalArea!))errors.push(`connection groups too close ${groups[i].groupId}/${groups[j].groupId}`);
 }
 return [...new Set(errors)];
}

/** Minimum complete legal itinerary per entrance, with unchanged conservative service allowances. */
export function stationEntryBudgets(d:WorldDefinition):Record<string,number>{
 const l=d.layout,nav=createNavigation(l,createMovement(l,platformClearanceBlocks(d.connectors).map(v=>v.bounds))),doors=generatedTrainDoors(d);
 const walk=(a:Vec,b:Vec)=>{const path=nav.findPath(a,b,.48);return path?nav.pathLength(a,path)/1.4:Infinity;};
 const board=(from:Vec)=>Math.min(...doors.map(door=>{let total=walk(from,door.pos),previous=door.pos;for(const point of door.boardingPath){total+=Math.hypot(point.x-previous.x,point.y-previous.y)/1.4;previous=point;}return total;}));
 const boarding=new Map(d.connectors!.map(c=>[c.id,board(c.to)]));
 const result:Record<string,number>={};
 for(const e of d.entrances??[]){const facilities=l.FACILITIES.filter(f=>f.ingress===e.id),tvms=facilities.filter(f=>f.kind==="tvm"),security=facilities.filter(f=>f.kind==="security"),gates=facilities.filter(f=>f.kind==="gate");
  let best=Infinity;
  for(const t of tvms)for(const s of security)for(const g of gates){
   const services=entranceLength(e)/1.4+walk(e.bottom,t.head)+walk(t.head,s.head)+walk(s.exit!,g.head)+9+8*1.4+2+2.5;
   for(const c of d.connectors!)best=Math.min(best,services+walk(g.exit!,c.approach)+c.travelSeconds+boarding.get(c.id)!);
  }
  result[e.id]=best;
 }
 return result;
}
