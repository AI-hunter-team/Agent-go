import type { StationLayoutType,WorldDefinition } from "../shared/world";
import type { Rect } from "./geometry";
import { rectangularUnion,withoutRooms,footprintWalls,cutWallApertures,coversRect } from "../shared/stationFootprint";
import { createProportionedStation } from "./proportionedStation";
import { serializableWorld,hydrateWorld } from "./worldDefinition";
import { buildEntrances } from "./entranceGeometry";
import { Rng } from "./rng";
const intersects=(a:Rect,b:Rect,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w>b.x-pad&&a.y<b.y+b.h+pad&&a.y+a.h>b.y-pad;
export const LAYOUT_TYPES:readonly StationLayoutType[]=["dual-ended","offset-entry","open-hall"];
export const LAYOUT_LABELS:Record<StationLayoutType,string>={"dual-ended":"双端站厅","offset-entry":"偏置入口","open-hall":"开阔站厅"};

const bases=new Map<number,WorldDefinition>();
function baseStation(length:number,cars:number){let d=bases.get(length);if(!d){d=createProportionedStation(1,length,cars);bases.set(length,d);}return d;}
/** Architectural relations vary; the service and gameplay parameters are inherited unchanged. */
export function buildingCandidate(seed:number,length:number,cars:number,type:StationLayoutType,attempt:number):WorldDefinition{
 const d=serializableWorld(baseStation(length,cars)),l=d.layout,rng=new Rng(seed).fork(`v3-building:${attempt}`);
 d.seed=seed;
 const shift=rng.pick([-.5,0,.5]),spacing=rng.pick([9,12]),offset=rng.pick([0,1.5]);
 for(const c of d.connectors!){c.from.x+=shift;c.to.x+=shift;c.approach.x+=shift;c.opening.x+=shift;c.queueAnchor.x=c.from.x;c.arrivalArea!.x+=shift;}
 l.STAIRS_TOP=d.connectors![0].from;l.STAIRS_BOTTOM=d.connectors![0].to;l.ESCALATOR_TOP=d.connectors![1].from;l.ESCALATOR_BOTTOM=d.connectors![1].to;l.ESCALATOR_APPROACH=d.connectors![1].approach;
 l.openings=d.connectors!.map(c=>c.opening);l.openingBlocks=l.openings.map(r=>({...r,x:r.x+.9,w:r.w-.9}));
 for(const n of l.NAV_NODES){const c=d.connectors!.find(c=>c.node===n.id);if(c)n.pos={...c.approach};if(n.id==="STAIRS_TOP")n.pos=l.STAIRS_TOP;if(n.id==="ESCALATOR_TOP")n.pos=l.ESCALATOR_APPROACH;if(n.id==="PLATFORM")n.pos=l.STAIRS_BOTTOM;}
 const rooms:Rect[]=[{x:0,y:0,w:9,h:4.5},{x:length-9,y:25.5,w:9,h:4.5}];
 const roomWidth=rng.pick([6,7.5,9]),roomX=Math.max(42,Math.min(length-36,length/2-roomWidth/2));
 if(length>=102)rooms.push({x:roomX,y:0,w:roomWidth,h:type==="offset-entry"?7:4.5});
 if(type==="open-hall"&&length>=126)rooms.push({x:length/2+12,y:25.5,w:6,h:4.5});
 let footprint:Rect[];
 if(type==="open-hall")footprint=[{x:0,y:0,w:length,h:30}];
 else {
  const central={x:21,y:type==="dual-ended"?4.5:7,w:length-33,h:type==="dual-ended"?21:18.5};
  const west=type==="dual-ended"?[{x:0,y:0,w:24,h:30}]:[{x:0,y:12,w:5,h:6},{x:4,y:4.5,w:5,h:21},{x:8,y:0,w:16,h:30}];
  footprint=[...west,central,{x:length-15,y:0,w:15,h:30},...d.connectors!.filter(c=>c.kind==="stairs").map(c=>({x:c.from.x-4.5,y:central.y,w:19,h:30-central.y})),...rooms];
 }
 footprint=rectangularUnion(footprint);
 const platformRoom:Rect={x:0,y:11,w:3,h:8,floorId:"platform"},publicUpper=withoutRooms(footprint,rooms),publicLower=withoutRooms([{x:0,y:8,w:length,h:14}],[platformRoom]);
 const voids=withoutRooms([{x:0,y:0,w:length,h:30}],footprint);
 // Keep all public navigation IDs and entry feet inside the actual union.
 for(const id of ["ENTRANCE","ENTRANCE_B"]){const n=l.NAV_NODES.find(n=>n.id===id)!;if(type!=="offset-entry")n.pos.y+=rng.pick([-.5,0,.5]);}
 l.ENTRANCE=l.NAV_NODES.find(n=>n.id==="ENTRANCE")!.pos;d.entrances=buildEntrances(l);
 if(type==="offset-entry"){const notice=d.details.find(v=>v.family==="entrance")!;notice.pos.x=9.8;notice.body!.x=8.5;}
 d.details=d.details.filter(v=>v.body?.floorId==="platform"||coversRect(v.body??{x:v.pos.x-.1,y:v.pos.y-.1,w:.2,h:.2},publicUpper));
 l.ITEM_SPOTS=l.ITEM_SPOTS.filter(v=>coversRect({x:v.pos.x-.6,y:v.pos.y-.6,w:1.2,h:1.2},publicUpper));
 const upperColumns:Rect[]=[{x:5.55,y:23.55,w:.9,h:.9},{x:17.55,y:14.55,w:.9,h:.9},{x:length-6.45,y:23.55,w:.9,h:.9}];
 for(let x=30+offset;x<length-18;x+=spacing)for(const y of (type==="open-hall"?[6,15,24]:[6,24]))upperColumns.push({x:x-.45,y:y-.45,w:.9,h:.9});
 const protectedRects=d.connectors!.flatMap(c=>[c.opening,{x:c.from.x-4,y:c.from.y-1.5,w:5,h:14}]);
 l.PILLARS=upperColumns.filter(r=>coversRect(r,publicUpper)&&!protectedRects.some(p=>intersects(r,p,.6))&&!d.details.some(v=>v.body&&v.pos.floorId!=="platform"&&intersects(r,v.body,.5)));
 for(let x=6;x<length-3;x+=12){const r={x:x-.45,y:14.55,w:.9,h:.9,floorId:"platform"};if(!d.connectors!.some(c=>intersects(r,c.arrivalArea!,.48)))l.PILLARS.push(r);}
 l.solids=[...rooms,...voids,platformRoom,...d.details.flatMap(v=>v.body?[v.body]:[])];
 l.SIGHT_OCCLUDERS=[...l.PILLARS,...rooms,...voids,...d.details.flatMap(v=>v.blocksSight&&v.body?[v.body]:[])];
 const areas=[...publicUpper.map((bounds,i)=>({id:`public-${i}`,floorId:"concourse" as const,bounds})),...publicLower.map((bounds,i)=>({id:`island-${i}`,floorId:"platform" as const,bounds}))];
 d.architecture={...d.architecture!,layoutType:type,columnGrid:{spacing,offset},areas,
  walls:cutWallApertures(footprintWalls(footprint,"concourse",3.6),d.entrances),
  volumes:[...rooms.map((bounds,i)=>({id:`equipment-${i}`,floorId:"concourse" as const,kind:"room" as const,bounds,height:3.6})),{id:"platform-equipment",floorId:"platform",kind:"room",bounds:platformRoom,height:3.4},...l.PILLARS.map((bounds,i)=>({id:`column-${i}`,floorId:(bounds.floorId??"concourse") as "concourse"|"platform",kind:"column" as const,bounds,height:bounds.floorId==="platform"?3.4:3.6}))]};
 d.name=`青禾站 · ${LAYOUT_LABELS[type]} · ${length}米`;
 d.archetype=type==="dual-ended"?"dual":type==="offset-entry"?"side":"central";
 d.generation={attempts:attempt+1,fallback:false,reasons:[],emptyRouteSeconds:0,requestedLayout:type,actualLayout:type};
 return hydrateWorld(d);
}
