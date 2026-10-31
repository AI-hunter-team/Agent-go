import type { Vec } from "../shared/types";
import type { Rect } from "./geometry";
import type { StationConnector, WorldDefinition } from "../shared/world";
import { generateWorld, hydrateWorld, layoutHash, validateWorld } from "./worldDefinition";
import { buildEntrances } from "./entranceGeometry";
const p=(x:number,y:number,floorId="concourse"):Vec=>({x,y,floorId});
function fence(x:number,ys:number[],gap:number):Rect[]{
 const out:Rect[]=[];let start=0;
 for(const y of ys.sort((a,b)=>a-b)){if(y-gap>start)out.push({x:x-.12,y:start,w:.24,h:y-gap-start});start=y+gap;}
 if(start<30)out.push({x:x-.12,y:start,w:.24,h:30-start});return out;
}
/** Current longitudinal sample; dimensions are selected before architecture, operations or decoration. */
export function createProportionedStation(seed:number,length:number,carCount:number):WorldDefinition {
 if(!Number.isInteger(seed)||seed<1||seed>4294967295)throw new RangeError("世界种子须为1–4294967295的整数");
 const d=JSON.parse(JSON.stringify(generateWorld(1,{version:"metro-v1"}))) as WorldDefinition,l=d.layout;
 d.generatorVersion="metro-v3";d.seed=seed;d.name=`青禾站 · ${length}米站`;d.archetype="dual";d.train={carCount};
 l.WIDTH=length;l.HEIGHT=30;l.SECURITY_X=14;l.GATE_X=21;l.ENTRANCE=p(2,15);
 const connectors:StationConnector[]=[];
 for(const [groupId,x,dir] of [["A",27,1],["B",length-27,1]] as const)for(const [kind,y] of [["stairs",12],["escalator",18]] as const){
  const from=p(x,y),to=p(x+dir*12,y,"platform");
  connectors.push({id:`${groupId}:${kind}`,groupId,kind,from,to,approach:kind==="stairs"?from:p(x-dir*.25,y-1.15),node:`${groupId}_${kind.toUpperCase()}`,width:2.4,
   opening:{x:Math.min(x,to.x)-.1-(dir<0?1.2:0),y:y-1.3,w:13.3,h:2.6},queueAnchor:from,queueTurnAfter:3,arrivalArea:{x:to.x-.6,y:10.2,w:5.4,h:9.6,floorId:"platform"},travelSeconds:kind==="stairs"?6:10});
 }
 d.connectors=connectors;
 [l.STAIRS_TOP,l.STAIRS_BOTTOM,l.ESCALATOR_TOP,l.ESCALATOR_BOTTOM,l.ESCALATOR_APPROACH]=[connectors[0].from,connectors[0].to,connectors[1].from,connectors[1].to,connectors[1].approach];
 l.openings=connectors.map(c=>c.opening);
 l.openingBlocks=connectors.map(c=>({...c.opening,...(c.from.x<c.to.x?{x:c.opening.x+.9,w:c.opening.w-.9}:{w:c.opening.w-.9})}));
 l.FACILITIES=[];
 const device=(id:string,kind:"tvm"|"security"|"gate",x:number,y:number,ingress:"A"|"B",forward=1)=>{
  const q=kind==="tvm"?{x:0,y:1}:{x:-forward,y:0};
  l.FACILITIES.push({id,kind,ingress,label:`${id} ${kind==="tvm"?"自动售票机":kind==="security"?"安检通道":"进站闸机"}`,pos:p(x,y),head:p(kind==="tvm"?x:x-forward*.9,kind==="tvm"?y+1.1:y),exit:kind==="tvm"?null:p(x+forward*1.5,y),queueDirection:q});
 };
 for(const [i,x] of [5,7.2,length-4,length-2].entries())device(`TVM-${i+1}`,"tvm",x,5,i<2?"A":"B");
 device("S1","security",14,9,"A");device("S2","security",14,22,"A");device("S3","security",length-7,15,"B",-1);
 for(const [i,y] of [5,10,21,26].entries())device(`G${i+1}`,"gate",21,y,"A");
 device("G5","gate",length-12,10,"B",-1);device("G6","gate",length-12,22,"B",-1);
 l.SECURITY_BARRIERS=[...fence(14,[9,22],1.3),...fence(length-7,[15],1.3)];
 l.GATE_BARRIERS=[...fence(21,[5,10,21,26],.62),...fence(length-12,[10,22],.62)];
 const columnPoints=[[6,24],[18,15],[length-6,24]];
 for(let x=30;x<length-18;x+=12)for(const y of [6,24])columnPoints.push([x,y]);
 l.PILLARS=columnPoints.map(([x,y])=>({x:x-.45,y:y-.45,w:.9,h:.9}));
 const rooms=[{x:0,y:0,w:9,h:4.5},{x:length-9,y:25.5,w:9,h:4.5}];
 l.solids=[...rooms];l.MOVE_BLOCKERS=[14,21,length-12,length-7].map(x=>({x:x-.15,y:-1,w:.3,h:32}));
 l.MOVE_BLOCKERS.push(...[{x:0,y:0,w:length,h:8},{x:0,y:22,w:length,h:8}].map(r=>({...r,floorId:"platform"})));
 l.platformAxis={direction:"x",center:15,halfWidth:7};
 l.ATTRACTIONS=[{id:"INFO",kind:"information",label:"站厅线路图",pos:p(18,2),approach:p(18,4),body:null,blocksSight:false,cue:"两组楼扶梯通往同一站台，跟随导向即可。"}];
 l.ITEM_SPOTS=[{id:"convenience",label:"入口便民架",pos:p(4,25),stock:["newspaper","snack","water_bottle"],takeSeconds:1.5},...l.FACILITIES.filter(f=>f.kind==="security").map(f=>({id:`confiscated-${f.id}`,label:"安检保管处",pos:p(f.exit!.x,f.pos.y+1.5),stock:[],takeSeconds:1.5}))];
 l.RAILING_APPROACHES=[{id:"RAIL_N",label:"安检低栏杆前",pos:p(13.3,15.5)}];l.RAILING_X=14;l.RAILING_SEGMENTS=[{minY:14.5,maxY:16.5}];
 l.NAV_NODES=[{id:"ENTRANCE",label:"入口A",pos:l.ENTRANCE},{id:"ENTRANCE_B",label:"入口B",pos:p(length-2,15)},
 {id:"TICKETS_C",label:"售票区",pos:p(7,11)},{id:"HALL_N",label:"北安检",pos:p(10,9)},{id:"HALL_S",label:"南安检",pos:p(10,22)},{id:"HALL_C",label:"A口安检前",pos:p(10,15)},{id:"CONC_C",label:"安检后",pos:p(18,15)},{id:"GATE_C",label:"进站闸机",pos:p(20,15)},
 {id:"LANDING_C",label:"楼扶梯分配区",pos:p(24,15)},...connectors.map(c=>({id:c.node,label:`${c.groupId}组${c.kind==="stairs"?"楼梯":"扶梯"}`,pos:c.approach})),
 {id:"STAIRS_TOP",label:"A组楼梯",pos:l.STAIRS_TOP},{id:"ESCALATOR_TOP",label:"A组扶梯",pos:l.ESCALATOR_APPROACH},{id:"PLATFORM",label:"岛式站台",pos:l.STAIRS_BOTTOM},...l.RAILING_APPROACHES];
 d.regions=[{kind:"hall",floorId:"concourse",bounds:{x:0,y:0,w:14,h:30}},{kind:"concourse",floorId:"concourse",bounds:{x:14,y:0,w:7,h:30}},{kind:"landing",floorId:"concourse",bounds:{x:21,y:0,w:length-33,h:30}},{kind:"concourse",floorId:"concourse",bounds:{x:length-12,y:0,w:5,h:30}},{kind:"hall",floorId:"concourse",bounds:{x:length-7,y:0,w:7,h:30}}];
 d.floors=[{id:"concourse",elevation:0,ceiling:3.6,bounds:{x:0,y:0,w:length,h:30}},{id:"platform",elevation:-6,ceiling:-2.6,bounds:{x:0,y:8,w:length,h:14}}];
 d.details=[{id:"entrance-A",family:"entrance",variant:0,pos:p(2,26),label:"入口公告",body:{x:.7,y:25.9,w:2.6,h:.15},blocksSight:false},{id:"tickets-A",family:"tickets",variant:0,pos:p(10.8,1),label:"客服中心",body:{x:9.3,y:.7,w:3,h:.6},blocksSight:true},{id:"tickets-B",family:"tickets",variant:0,pos:p(length-10.7,1),label:"客服中心",body:{x:length-12.2,y:.7,w:3,h:.6},blocksSight:true},{id:"seats",family:"platform",variant:1,pos:p(length/2+12,15,"platform"),label:"候车座椅",body:{x:length/2+10.5,y:14.6,w:3,h:.8,floorId:"platform"},blocksSight:false}];
 d.details.push(...l.FACILITIES.filter(f=>f.kind==="security").map(f=>{const x=f.pos.x+(f.ingress==="B"?-1.8:1.8),y=f.pos.y+(f.pos.y<15?2.8:-2.8);return {id:`work-${f.id}`,family:"security" as const,variant:0,pos:p(x,y),label:"安检检查桌与托盘",body:{x:x-1,y:y-.4,w:2,h:.8},blocksSight:false};}));
 for(let x=6;x<length-3;x+=12){
  const r={x:x-.45,y:14.55,w:.9,h:.9,floorId:"platform"};
  if(!connectors.some(c=>{const a=c.arrivalArea!;return r.x<a.x+a.w+.48&&r.x+r.w>a.x-.48&&r.y<a.y+a.h+.48&&r.y+r.h>a.y-.48;}))l.PILLARS.push(r);
 }
 l.SIGHT_OCCLUDERS=[...l.PILLARS,...rooms,...d.details.flatMap(d=>d.blocksSight&&d.body?[d.body]:[])];l.solids.push(...d.details.flatMap(d=>d.body?[d.body]:[]));
 d.architecture={areas:[{id:"central-floor",floorId:"concourse",bounds:{x:0,y:4.5,w:length,h:21}},{id:"north-floor",floorId:"concourse",bounds:{x:9,y:0,w:length-9,h:4.5}},{id:"south-floor",floorId:"concourse",bounds:{x:0,y:25.5,w:length-9,h:4.5}},{id:"island",floorId:"platform",bounds:{x:0,y:8,w:length,h:14}}],
 volumes:[...rooms.map((bounds,i)=>({id:`equipment-${i}`,kind:"room" as const,floorId:"concourse" as const,bounds,height:3.6})),...l.PILLARS.map((bounds,i)=>({id:`column-${i}`,kind:"column" as const,floorId:(bounds.floorId??"concourse") as "concourse"|"platform",bounds,height:bounds.floorId==="platform"?3.4:3.6}))],
 groups:[...(["tickets","security","gates"] as const).map(kind=>({id:kind,kind,members:l.FACILITIES.filter(f=>f.kind===(kind==="tickets"?"tvm":kind==="gates"?"gate":kind)).map(f=>f.id)})),...(["A","B"] as const).map(id=>({id:`connection-${id}`,kind:"connections" as const,members:connectors.filter(c=>c.groupId===id).map(c=>c.id)}))],
 views:[{id:"gate",eye:[16,1.65,8],target:[32,1.4,13.4]},{id:"descent",eye:[24,1.65,14],target:[34,-.8,13]},{id:"platform",eye:[12,-4.35,19.5],target:[length-14,-4.45,20.5]}]};
 d.entrances=buildEntrances(l);
 d.guards=d.guards.map(g=>{const f=l.FACILITIES.find(f=>g.id===`security-${f.id}`);return {...g,route:f?[p(f.exit!.x,f.pos.y+(f.pos.y<15?-2.3:2.3))]:[p(24,25),p(length-26,25)]};});
 d.generation={attempts:1,fallback:false,reasons:[],emptyRouteSeconds:0};d.layoutHash=layoutHash({version:"v3-proportions-base",seed,train:d.train,architecture:d.architecture,connectors,layout:l});
 l.zoneOf=v=>v.floorId==="platform"?"platform":v.floorId?.startsWith("transit")?"stairs":d.regions.find(r=>v.x>=r.bounds.x&&v.x<=r.bounds.x+r.bounds.w&&v.y>=r.bounds.y&&v.y<=r.bounds.y+r.bounds.h)?.kind??"hall";
 l.atRailing=v=>l.zoneOf(v)==="hall"&&l.RAILING_APPROACHES.some(n=>Math.hypot(v.x-n.pos.x,v.y-n.pos.y)<=1.8);
 const errors=validateWorld(d);if(errors.length)throw new Error(`站长样板无效: ${errors.join(", ")}`);
 return hydrateWorld(d);
}
