import type { StationConnector } from "./world";
import type { Rect } from "../sim/geometry";
export const CONNECTOR_STEPS=36,CONNECTOR_SLAB_DEPTH=.26;
/** The lower floor must not route a standing passenger through the inclined slab. */
export function platformClearanceBlocks(connectors:readonly StationConnector[]=[]):{id:string;bounds:Rect}[]{
 return connectors.map(c=>{const dx=c.to.x-c.from.x,dy=c.to.y-c.from.y,run=Math.hypot(dx,dy),ux=dx/run,uy=dy/run;
  const start=run*(1-(1.9+CONNECTOR_SLAB_DEPTH)/6);
  // Leave the flush last tread and a body-safe exit at the exact connector endpoint.
  const end=run-(run/CONNECTOR_STEPS+.32-.015),half=c.width/2+.04;
  const a={x:c.from.x+ux*start,y:c.from.y+uy*start},b={x:c.from.x+ux*end,y:c.from.y+uy*end};
  return {id:`clearance:${c.id}`,bounds:{x:Math.min(a.x,b.x)-Math.abs(uy)*half,y:Math.min(a.y,b.y)-Math.abs(ux)*half,w:Math.abs(b.x-a.x)+Math.abs(uy)*half*2,h:Math.abs(b.y-a.y)+Math.abs(ux)*half*2,floorId:c.to.floorId??"platform"}};
 });
}
/** Conservative thin boxes around the actual stepped slab, for camera collision. */
export function connectorSlabBoxes(connectors:readonly StationConnector[]=[]){
 return connectors.flatMap(c=>{const dx=(c.to.x-c.from.x)/CONNECTOR_STEPS,dy=(c.to.y-c.from.y)/CONNECTOR_STEPS,run=Math.hypot(dx,dy),ux=dx/run,uy=dy/run;
  return Array.from({length:CONNECTOR_STEPS},(_,i)=>{const x=c.from.x+dx*i,y=c.from.y+dy*i,half=c.width/2,low=-6*(i+1)/CONNECTOR_STEPS-CONNECTOR_SLAB_DEPTH,high=-6*(i+1)/CONNECTOR_STEPS;
   return {low:{x:Math.min(x,x+dx)-Math.abs(uy)*half,y:low,z:Math.min(y,y+dy)-Math.abs(ux)*half},high:{x:Math.max(x,x+dx)+Math.abs(uy)*half,y:high,z:Math.max(y,y+dy)+Math.abs(ux)*half}};
  });
 });
}
