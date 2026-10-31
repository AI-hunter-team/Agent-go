import type {Engine} from "../sim/engine";
import {personRadius} from "../sim/movement";
import {CONNECTOR_STEPS,CONNECTOR_SLAB_DEPTH} from "../shared/connectorGeometry";
type Issue={kind:string;id:string;t:number;pos:unknown;connector?:string};
const audits=new WeakMap<Engine,{checks:number;issues:Issue[];keys:Set<string>}>();
export function occupancySummary(e:Engine){const a=audits.get(e);return {checks:a?.checks??0,issues:a?.issues??[]};}
/** Read after each actual physics step; boarding uses its explicit door portal instead of floor bounds. */
export function instrumentOccupancy(e:Engine){
 const a={checks:0,issues:[] as Issue[],keys:new Set<string>()};audits.set(e,a);const step=e.step.bind(e);
 e.step=()=>{step();for(const p of e.world.persons.values()){
  if(!["concourse","platform"].includes(p.pos.floorId??"concourse")||p.onTrain||["boarding","entering"].includes(p.activity.kind))continue;a.checks++;
  const add=(kind:string,connector?:string)=>{const key=`${kind}:${p.id}:${connector??""}`;if(a.keys.has(key))return;a.keys.add(key);a.issues.push({kind,id:p.id,t:e.t,pos:{...p.pos},...(connector?{connector}:{})});};
  if(!e.world.spatial.clearOfScenery(p.pos,p.pos,personRadius(p.kind)))add("scenery");
  if(p.pos.floorId==="platform")for(const c of e.world.definition.connectors??[]){const dx=c.to.x-c.from.x,dy=c.to.y-c.from.y,run=Math.hypot(dx,dy),along=((p.pos.x-c.from.x)*dx+(p.pos.y-c.from.y)*dy)/run,across=Math.abs(((p.pos.x-c.from.x)*dy-(p.pos.y-c.from.y)*dx)/run),top=-6*Math.ceil(along/(run/CONNECTOR_STEPS))/CONNECTOR_STEPS,under=-6*along/run-CONNECTOR_SLAB_DEPTH;
   if(along>0&&along<run&&across<c.width/2&&top>-5.95&&under<-4.3)add("slab",c.id);
  }
 }};
}
