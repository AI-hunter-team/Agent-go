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
/** Fixed M1 specimen. Random archetypes are gated on visual acceptance. */
export function createWorldV2(seed:number):WorldDefinition {
 if(!Number.isInteger(seed)||seed<1||seed>4294967295)throw new RangeError("世界种子须为1–4294967295的整数");
 const d=JSON.parse(JSON.stringify(generateWorld(1,{version:"metro-v1"}))) as WorldDefinition,l=d.layout;
 d.generatorVersion="metro-v2";d.seed=seed;d.name="青禾站 · 建筑样板";d.archetype="dual";
 l.WIDTH=72;l.HEIGHT=30;l.SECURITY_X=14;l.GATE_X=22;l.ENTRANCE=p(2,15);
 const connectors:StationConnector[]=[];
 for(const [groupId,x,dir] of [["A",27,1],["B",55,-1]] as const)for(const [kind,y] of [["stairs",12],["escalator",18]] as const){
  const from=p(x,y),to=p(x+dir*12,y,"platform");
  connectors.push({id:`${groupId}:${kind}`,groupId,kind,from,to,approach:kind==="stairs"?from:p(x-dir*.25,y-1.2),node:`${groupId}_${kind.toUpperCase()}`,width:2.4,
   opening:{x:Math.min(x,to.x)-.1-(dir<0?1.2:0),y:y-1.3,w:13.3,h:2.6},queueAnchor:from,travelSeconds:kind==="stairs"?6:10});
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
 for(const [i,x] of [5,7.2,68,70].entries())device(`TVM-${i+1}`,"tvm",x,5,i<2?"A":"B");
 device("S1","security",14,9,"A");device("S2","security",14,22,"A");device("S3","security",65,15,"B",-1);
 for(const [i,y] of [5,10,21,26].entries())device(`G${i+1}`,"gate",22,y,"A");
 device("G5","gate",60,10,"B",-1);device("G6","gate",60,22,"B",-1);
 l.SECURITY_BARRIERS=[...fence(14,[9,22],1.3),...fence(65,[15],1.3)];
 l.GATE_BARRIERS=[...fence(22,[5,10,21,26],.62),...fence(60,[10,22],.62)];
 l.PILLARS=[[6,24],[18,15],[42,6],[42,24],[66,24]].map(([x,y])=>({x:x-.45,y:y-.45,w:.9,h:.9}));
 const rooms=[{x:0,y:0,w:9,h:4.5},{x:63,y:25.5,w:9,h:4.5}];
 l.solids=[...rooms];l.MOVE_BLOCKERS=[14,22,60,65].map(x=>({x:x-.15,y:-1,w:.3,h:32}));
 l.MOVE_BLOCKERS.push(...[{x:0,y:0,w:72,h:8},{x:0,y:22,w:72,h:8}].map(r=>({...r,floorId:"platform"})));
 l.platformAxis={direction:"x",center:15,halfWidth:7};
 l.ATTRACTIONS=[{id:"INFO",kind:"information",label:"站厅线路图",pos:p(18,2),approach:p(18,4),body:null,blocksSight:false,cue:"两组楼扶梯通往同一站台，跟随导向即可。"}];
 l.ITEM_SPOTS=[{id:"convenience",label:"入口便民架",pos:p(4,25),stock:["newspaper","snack","water_bottle"],takeSeconds:1.5},...l.FACILITIES.filter(f=>f.kind==="security").map(f=>({id:`confiscated-${f.id}`,label:"安检保管处",pos:p(f.exit!.x,f.pos.y+1.5),stock:[],takeSeconds:1.5}))];
 l.RAILING_APPROACHES=[{id:"RAIL_N",label:"安检低栏杆前",pos:p(13.3,15.5)}];l.RAILING_X=14;l.RAILING_SEGMENTS=[{minY:14.5,maxY:16.5}];
 l.NAV_NODES=[{id:"ENTRANCE",label:"入口A",pos:l.ENTRANCE},{id:"ENTRANCE_B",label:"入口B",pos:p(70,15)},
 {id:"TICKETS_C",label:"售票区",pos:p(7,11)},{id:"HALL_N",label:"北安检",pos:p(10,9)},{id:"HALL_S",label:"南安检",pos:p(10,22)},{id:"HALL_C",label:"A口安检前",pos:p(10,15)},{id:"CONC_C",label:"安检后",pos:p(18,15)},{id:"GATE_C",label:"进站闸机",pos:p(20,15)},
 {id:"LANDING_C",label:"楼扶梯分配区",pos:p(24,15)},...connectors.map(c=>({id:c.node,label:`${c.groupId}组${c.kind==="stairs"?"楼梯":"扶梯"}`,pos:c.approach})),
 {id:"STAIRS_TOP",label:"A组楼梯",pos:l.STAIRS_TOP},{id:"ESCALATOR_TOP",label:"A组扶梯",pos:l.ESCALATOR_APPROACH},{id:"PLATFORM",label:"岛式站台",pos:l.STAIRS_BOTTOM},...l.RAILING_APPROACHES];
 d.regions=[{kind:"hall",floorId:"concourse",bounds:{x:0,y:0,w:14,h:30}},{kind:"concourse",floorId:"concourse",bounds:{x:14,y:0,w:8,h:30}},{kind:"landing",floorId:"concourse",bounds:{x:22,y:0,w:38,h:30}},{kind:"concourse",floorId:"concourse",bounds:{x:60,y:0,w:5,h:30}},{kind:"hall",floorId:"concourse",bounds:{x:65,y:0,w:7,h:30}}];
 d.floors=[{id:"concourse",elevation:0,ceiling:3.6,bounds:{x:0,y:0,w:72,h:30}},{id:"platform",elevation:-6,ceiling:-2.6,bounds:{x:0,y:8,w:72,h:14}}];
 d.details=[{id:"entrance-A",family:"entrance",variant:0,pos:p(2,26),label:"入口公告",body:{x:.7,y:25.9,w:2.6,h:.15},blocksSight:false},{id:"tickets-A",family:"tickets",variant:0,pos:p(10.8,1),label:"客服中心",body:{x:9.3,y:.7,w:3,h:.6},blocksSight:true},{id:"tickets-B",family:"tickets",variant:0,pos:p(61.3,1),label:"客服中心",body:{x:59.8,y:.7,w:3,h:.6},blocksSight:true},{id:"seats",family:"platform",variant:1,pos:p(36,15,"platform"),label:"候车座椅",body:{x:34.5,y:14.6,w:3,h:.8,floorId:"platform"},blocksSight:false}];
 d.details.push(...l.FACILITIES.filter(f=>f.kind==="security").map(f=>{const x=f.pos.x+(f.ingress==="B"?-1.8:1.8),y=f.pos.y+(f.pos.y<15?2.8:-2.8);return {id:`work-${f.id}`,family:"security" as const,variant:0,pos:p(x,y),label:"安检检查桌与托盘",body:{x:x-1,y:y-.4,w:2,h:.8},blocksSight:false};}));
 l.PILLARS.push(...[6,18,54,66].map(x=>({x:x-.45,y:14.55,w:.9,h:.9,floorId:"platform"})));
 l.SIGHT_OCCLUDERS=[...l.PILLARS,...rooms,...d.details.flatMap(d=>d.blocksSight&&d.body?[d.body]:[])];l.solids.push(...d.details.flatMap(d=>d.body?[d.body]:[]));
 d.architecture={areas:[{id:"central-floor",floorId:"concourse",bounds:{x:0,y:4.5,w:72,h:21}},{id:"north-floor",floorId:"concourse",bounds:{x:9,y:0,w:63,h:4.5}},{id:"south-floor",floorId:"concourse",bounds:{x:0,y:25.5,w:63,h:4.5}},{id:"island",floorId:"platform",bounds:{x:0,y:8,w:72,h:14}}],
 volumes:[...rooms.map((bounds,i)=>({id:`equipment-${i}`,kind:"room" as const,floorId:"concourse" as const,bounds,height:3.6})),...l.PILLARS.map((bounds,i)=>({id:`column-${i}`,kind:"column" as const,floorId:(bounds.floorId??"concourse") as "concourse"|"platform",bounds,height:bounds.floorId==="platform"?3.4:3.6}))],
 groups:[...(["tickets","security","gates"] as const).map(kind=>({id:kind,kind,members:l.FACILITIES.filter(f=>f.kind===(kind==="tickets"?"tvm":kind==="gates"?"gate":kind)).map(f=>f.id)})),...(["A","B"] as const).map(id=>({id:`connection-${id}`,kind:"connections" as const,members:connectors.filter(c=>c.groupId===id).map(c=>c.id)}))],
 views:[{id:"gate",eye:[17,1.65,12],target:[27,1.4,15]},{id:"descent",eye:[24,1.65,14],target:[34,-.8,13]},{id:"platform",eye:[12,-4.35,19.5],target:[58,-4.45,20.5]}]};
 d.entrances=buildEntrances(l);
 d.guards=d.guards.map(g=>{const f=l.FACILITIES.find(f=>g.id===`security-${f.id}`);return {...g,route:f?[p(f.exit!.x,f.pos.y+(f.pos.y<15?-2.3:2.3))]:[p(24,25),p(46,25)]};});
 d.generation={attempts:1,fallback:false,reasons:[],emptyRouteSeconds:0};d.layoutHash=layoutHash({version:d.generatorVersion,seed,architecture:d.architecture,connectors,layout:l});
 l.zoneOf=v=>v.floorId==="platform"?"platform":v.floorId?.startsWith("transit")?"stairs":d.regions.find(r=>v.x>=r.bounds.x&&v.x<=r.bounds.x+r.bounds.w&&v.y>=r.bounds.y&&v.y<=r.bounds.y+r.bounds.h)?.kind??"hall";
 l.atRailing=v=>l.zoneOf(v)==="hall"&&l.RAILING_APPROACHES.some(n=>Math.hypot(v.x-n.pos.x,v.y-n.pos.y)<=1.8);
 const errors=validateWorld(d);if(errors.length)throw new Error(`V2样板无效: ${errors.join(", ")}`);
 return hydrateWorld(d);
}
