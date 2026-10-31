import { LOUNGE_JOIN } from "./loungeLayout";
import { connectorSlabBoxes } from "../../shared/connectorGeometry";
import { subtractRect } from "../../shared/stationFootprint";
import { propDefinition } from "../../shared/stationProps";
import type { WorldDefinition } from "../../shared/world";
import { ATTRACTIONS, FACILITIES, GATE_BARRIERS, HEIGHT, PILLARS, SECURITY_BARRIERS, WIDTH } from "../../sim/layout";
import { facilitySolids } from "../../sim/facilityGeometry";
import { STATION_CEILING, stationRailingPlacements } from "./stationLayout";
import { FRAME_HEIGHT } from "../../assets/station-kit/dimensions";

export interface Point3 { x: number; y: number; z: number }
interface CameraBox { low: Point3; high: Point3 }
const bounds = (x: number, y: number, z: number, w: number, h: number, d: number): CameraBox => ({ low: { x, y, z }, high: { x: x + w, y: y + h, z: z + d } });
const CAMERA_BOXES: CameraBox[] = [
  ...PILLARS.map((r) => bounds(r.x, -0.15, r.y, r.w, FRAME_HEIGHT + 0.15, r.h)),
  ...[...SECURITY_BARRIERS, ...GATE_BARRIERS].map((r) => bounds(r.x + r.w / 2 - 0.08, 0, r.y, 0.16, 1.1, r.h)),
  ...FACILITIES.flatMap((def) => facilitySolids(def.kind, def.pos, def.queueDirection).map((r, index) => bounds(r.x, 0, r.y, r.w, def.kind === "security" ? index === 0 ? 0.58 : 2.5 : def.kind === "tvm" ? 1.8 : 1.1, r.h))),
  ...ATTRACTIONS.flatMap((a) => a.body ? [bounds(a.body.x, 0, a.body.y, a.body.w, a.kind === "toys" ? 2.7 : a.kind === "advert" ? 3.1 : a.kind === "flowers" ? 1.9 : 1.5, a.body.h)] : []),
  bounds(0, -2.2, -0.41, WIDTH, STATION_CEILING + 2.2, 0.4), bounds(0, -2.2, HEIGHT + 0.01, WIDTH, STATION_CEILING + 2.2, 0.4),
  bounds(0, STATION_CEILING, 0, WIDTH, 0.12, HEIGHT),
  ...stationRailingPlacements().filter((p) => p.id.startsWith("glass-")).flatMap((p) => {
    const length = p.railLength! - 0.16;
    if (!p.slope) return [bounds(p.position[0] - 0.08, 0, p.position[2] - length / 2, 0.16, 1.1, length)];
    const count = p.railSteps || 20;
    return Array.from({ length: count }, (_, i) => bounds(p.position[0] - length / 2 + i * length / count, p.slope! * (i + 1) / count, p.position[2] - 0.08, length / count, 1.1 + Math.abs(p.slope!) / count, 0.16));
  }),
];
/** Cut the hall's outer walls at the same doorway used by each entry passage. */
function generatedEnvelope(d: WorldDefinition): CameraBox[] {
  const l=d.layout, out:CameraBox[]=[];
  if(d.architecture?.walls)for(const w of d.architecture.walls){const horizontal=w.from.y===w.to.y,len=Math.hypot(w.to.x-w.from.x,w.to.y-w.from.y);out.push(horizontal?bounds(w.from.x,0,w.from.y-.15,len,w.height,.3):bounds(w.from.x-.15,0,w.from.y,.3,w.height,len));}
  for(const edge of d.architecture?.walls?[]:[{axis:"x",at:0,length:l.HEIGHT},{axis:"x",at:l.WIDTH,length:l.HEIGHT},{axis:"z",at:0,length:l.WIDTH},{axis:"z",at:l.HEIGHT,length:l.WIDTH}]) {
    const add=(start:number,length:number,base:number,height:number)=>out.push(edge.axis==="x"?bounds(edge.at-.15,base,start,.3,height,length):bounds(start,base,edge.at-.15,length,height,.3));
    add(0,edge.length,-6,6);add(0,edge.length,2.8,3.2);
    const doors=(d.entrances??[]).filter(e=>Math.abs((edge.axis==="x"?e.foot.x:e.foot.y)-edge.at)<.01).map(e=>({start:(edge.axis==="x"?e.foot.y:e.foot.x)-e.width/2,end:(edge.axis==="x"?e.foot.y:e.foot.x)+e.width/2})).sort((a,b)=>a.start-b.start);
    let start=0;
    for(const door of doors){if(door.start>start)add(start,door.start-start,0,2.8);start=Math.max(start,door.end);}
    if(start<edge.length)add(start,edge.length-start,0,2.8);
  }
  for(const e of d.entrances??[]) {
    const block=(x:number,z:number,base:number,height:number,width:number,depth:number)=>{
      const cx=e.top.x+e.inward.x*x-e.inward.y*z,cz=e.top.y+e.inward.y*x+e.inward.x*z;
      const w=Math.abs(e.inward.x)*width+Math.abs(e.inward.y)*depth, h=Math.abs(e.inward.y)*width+Math.abs(e.inward.x)*depth;
      out.push(bounds(cx-w/2,base,cz-h/2,w,height,h));
    };
    for(let x=-4.25;x<8;x+=.5){const floor=x<0?4:x>6?0:4*(1-x/6);for(const side of [-1,1]){if(e.id==="A"&&side===-1&&x< -LOUNGE_JOIN.nearZ)continue;block(x,side*(e.width/2+.09),floor,2.8,.5,.18);}block(x,0,floor+2.8,.15,.5,e.width+.36);}
    block(-4.5,0,4,2.8,.15,e.width);
  }
  return out;
}
const generatedBoxes=new WeakMap<import("../../shared/world").WorldDefinition,CameraBox[]>();
/** Height-aware clipping: transparent low railings do not behave like full-height walls. */
export function cameraFraction(target: Point3, desired: Point3, definition?:import("../../shared/world").WorldDefinition): number {
  const delta = { x: desired.x - target.x, y: desired.y - target.y, z: desired.z - target.z };
  let nearest = 1;
  const l=definition?.layout;
  let boxes=definition && definition.generatorVersion !== "legacy-v0" ? generatedBoxes.get(definition):undefined;
  if(!boxes){boxes=definition && definition.generatorVersion !== "legacy-v0"&&l ? [
    ...l.PILLARS.map(r=>bounds(r.x,r.floorId==="platform"?-6:0,r.y,r.w,definition.architecture?3.6:6,r.h)),
    ...(definition.architecture?.areas.filter(a=>a.floorId==="concourse").flatMap(a=>{let pieces=[a.bounds];for(const h of l.openings??[])pieces=pieces.flatMap(r=>subtractRect(r,h));return pieces.map(r=>bounds(r.x,-.24,r.y,r.w,.24,r.h));})??[]),
    ...(definition.architecture?.volumes.filter(v=>v.kind==="room").map(v=>bounds(v.bounds.x,v.floorId==="platform"?-6:0,v.bounds.y,v.bounds.w,v.height,v.bounds.h))??[]),
    ...[...l.SECURITY_BARRIERS,...l.GATE_BARRIERS].map(r=>bounds(r.x,0,r.y,r.w,1.1,r.h)),
    ...l.FACILITIES.flatMap(f=>facilitySolids(f.kind,f.pos,f.queueDirection).map(r=>bounds(r.x,0,r.y,r.w,f.kind==="tvm"?1.8:f.kind==="security"?2.5:1.1,r.h))),
    ...(definition.props??[]).flatMap(p=>p.body?[bounds(p.body.x,p.pos.floorId==='platform'?-6:0,p.body.y,p.body.w,propDefinition(p.assetId).size[1],p.body.h)]:[]),
    ...definition.details.flatMap(d=>d.body?[bounds(d.body.x,d.pos.floorId==="platform"?-6:0,d.body.y,d.body.w,2.5,d.body.h)]:[]),
    ...connectorSlabBoxes(definition.connectors),
    ...generatedEnvelope(definition),
    bounds(0,definition.architecture?3.6:6,0,l.WIDTH,.2,l.HEIGHT),
  ]:CAMERA_BOXES;
  if(definition&&definition.generatorVersion!=="legacy-v0")generatedBoxes.set(definition,boxes);}
  for (const box of boxes) {
    const low = { x: box.low.x - 0.12, y: box.low.y - 0.08, z: box.low.z - 0.12 };
    const high = { x: box.high.x + 0.12, y: box.high.y + 0.08, z: box.high.z + 0.12 };
    let enter = 0, exit = 1;
    for (const axis of ["x", "y", "z"] as const) {
      if (Math.abs(delta[axis]) < 1e-9) {
        if (target[axis] < low[axis] || target[axis] > high[axis]) { exit = -1; break; }
      } else {
        const a = (low[axis] - target[axis]) / delta[axis], b = (high[axis] - target[axis]) / delta[axis];
        enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit && enter > 0) nearest = Math.min(nearest, Math.max(0.05, enter - 0.04));
  }
  return nearest;
}
