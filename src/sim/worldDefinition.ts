import { createWorldV2 } from "./worldV2";
import { buildEntrances, entranceLength } from "./entranceGeometry";
import { createMovement } from "./movement";
import { stationSwitch } from "./stationSwitch";
import { generatedTrainDoors } from "../shared/generatedTrain";
import { createNavigation } from "./nav";
import * as legacy from "./layout";
import type { WorldDefinition, StationLayout, WorldDescriptor, PublicStationMap, DetailPlacement } from "../shared/world";
import type { Vec, FacilityKind } from "../shared/types";
import { GUARDS, SECURITY_STAFF_BALANCED, SECURITY_STAFF_VISION } from "./scenario";
import { Rng } from "./rng";
import type { Rect } from "./geometry";

const contains = (r: Rect, p: Vec) => p.x >= r.x && p.x <= r.x+r.w && p.y >= r.y && p.y <= r.y+r.h;
export function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); } return value; }
export function layoutHash(value: unknown): string { const text=JSON.stringify(value); let h=2166136261; for(let i=0;i<text.length;i++) h=Math.imul(h^text.charCodeAt(i),16777619); return (h>>>0).toString(16).padStart(8,"0"); }
export function legacyWorld(seed=1): WorldDefinition {
  const layout = Object.fromEntries(Object.entries(legacy).filter(([key]) => /^[A-Z_]+$/.test(key) || key === "zoneOf" || key === "atRailing")) as unknown as StationLayout;
  return {generatorVersion:"legacy-v0",layoutHash:"legacy-v0",seed,archetype:"legacy",name:"旧版站厅",regions:[],theme:{accent:"#b9a36b",wall:"#dedbd0",floor:"#a0b3a5",variant:0},floors:[{id:"concourse",elevation:0,ceiling:6,bounds:{x:0,y:0,w:90,h:30}},{id:"platform",elevation:-2,ceiling:6,bounds:{x:72,y:0,w:18,h:30}}],layout,guards:[...GUARDS,...SECURITY_STAFF_BALANCED],details:[],generation:{attempts:1,fallback:false,reasons:[],emptyRouteSeconds:0}};
}
function barriers(x:number, height:number, ys:number[], gap:number):Rect[] {
  const result:Rect[]=[]; let start=0;
  for(const y of [...ys].sort((a,b)=>a-b)){ if(y-gap>start)result.push({x:x-.12,y:start,w:.24,h:y-gap-start}); start=y+gap; }
  if(start<height)result.push({x:x-.12,y:start,w:.24,h:height-start}); return result;
}
function candidate(seed:number, attempt:number, appearanceSeed=seed):WorldDefinition {
  const rng=new Rng(seed).fork(`layout:${attempt}`), decor=new Rng(appearanceSeed).fork("appearance");
  const archetype=rng.pick(["central","side","dual"] as const), width=rng.pick([66,72,78]), height=rng.pick(archetype==="side"?[48,54]:[30,36]);
  const variation=new Rng(seed).fork("geometry"), connectionOffset=variation.pick([-1.5,0,1.5]), entryY=variation.pick([7,10,13]), connectionY=variation.pick([-1.5,0,1.5]);
  const sx=18, gx=30, paidEnd=archetype === "dual" ? width-15 : width-9;
  const p=(x:number,y:number,floorId:"concourse"|"platform"="concourse"):Vec=>({x,y,floorId});
  const top=p(36+connectionOffset,height/2-5+connectionY), bottom=p(48+connectionOffset,height/2-5+connectionY,"platform"), escalator=p(36+connectionOffset,height/2+5+connectionY), escalatorBottom=p(48+connectionOffset,height/2+5+connectionY,"platform");
  const facilities:legacy.FacilityDef[]=[];
  const make=(id:string,kind:FacilityKind,x:number,y:number,forward=1)=>{
    const tvm=kind==="tvm", direction=tvm?{x:0,y:1}:{x:-forward,y:0};
    facilities.push({id,kind,ingress:"A",label:`${id} ${kind==="tvm"?"自动售票机":kind==="security"?"安检通道":"进站闸机"}`,pos:p(x,y),head:p(tvm?x:x-forward*.9,tvm?y+1.1:y),exit:tvm?null:p(x+forward*1.5,y),queueDirection:direction});
  };
  const nt=rng.pick([3,4,5]), ns=rng.pick([3,4]), ng=rng.pick([4,5,6,7,8]);
  for(let i=0;i<nt;i++)make(`TVM-${i+1}`,"tvm",5+i*2.2,3);
  for(let i=0;i<ns;i++)make(`S${i+1}`,"security",sx,4+(height-8)*i/(ns-1));
  for(let i=0;i<ng;i++)make(`G${i+1}`,"gate",gx,3+(height-6)*i/(ng-1));
  // The second group feeds the same paid core from the opposite entrance.
  if(archetype==="dual") {
    for(let i=0;i<Math.floor(nt/2);i++){const f=facilities[i];f.ingress="B";f.pos=p(width-6-i*2.2,3);f.head=p(f.pos.x,4.1);}
    const s=facilities.find(f=>f.id===`S${ns}`)!;s.ingress="B";s.pos=p(width-7,height/2);s.head=p(width-6.1,height/2);s.exit=p(width-8.5,height/2);s.queueDirection={x:1,y:0};
    const right=facilities.filter(f=>f.kind==="gate").slice(-2);right.forEach((f,i)=>{f.ingress="B";f.pos=p(paidEnd,height/2-4+i*8);f.head=p(paidEnd+.9,f.pos.y);f.exit=p(paidEnd-1.5,f.pos.y);f.queueDirection={x:1,y:0};});
  }
  const securityBarriers=barriers(sx,height,facilities.filter(f=>f.kind==="security"&&f.pos.x===sx).map(f=>f.pos.y),1.3);
  const gateBarriers=barriers(gx,height,facilities.filter(f=>f.kind==="gate"&&f.pos.x===gx).map(f=>f.pos.y),.62);
  const move:Rect[]=[{x:sx-.15,y:-1,w:.3,h:height+2},{x:gx-.15,y:-1,w:.3,h:height+2}];
  if(archetype==="dual") {
    move.push({x:paidEnd-.15,y:-1,w:.3,h:height+2},{x:width-7-.15,y:-1,w:.3,h:height+2});
    gateBarriers.push(...barriers(paidEnd,height,facilities.filter(f=>f.kind==="gate"&&f.pos.x===paidEnd).map(f=>f.pos.y),.62));
    securityBarriers.push(...barriers(width-7,height,[height/2],1.3));
  }
  if(archetype!=="dual") {
    move.push({x:paidEnd-.15,y:-1,w:.3,h:height+2});
    gateBarriers.push(...barriers(paidEnd,height,[height/2],.8));
  }
  const pillars:Rect[]=[];
  for(let x=12;x<width-4;x+=12)for(const y of [1.5,height-3])pillars.push({x,y,w:1.2,h:1.5});
  const attractions:legacy.AttractionDef[]=[
    {id:"INFO",kind:"information",label:"线路与方向信息",pos:p(24,height/2),approach:p(23,height/2),body:null,blocksSight:false,cue:"公开地图标明全部设施、楼梯与扶梯；实时队伍以现场观察为准。"},
    {id:"SEATS",kind:"seating",label:"站厅等候座椅",pos:p(23,height-2),approach:p(23,height-4),body:{x:21.5,y:height-2.8,w:3,h:1},blocksSight:false,cue:"这里有人稍作停留、等候同行者。"},
    {id:"TOYS",kind:"toys",label:"自助商品机",pos:p(23,2),approach:p(23,4),body:{x:21.5,y:1,w:3,h:1.5},blocksSight:true,cue:"靠墙设置的小型自助商品机。"},
  ];
  const openings:Rect[]=[{x:top.x-.1,y:top.y-1.3,w:13.3,h:2.6},{x:escalator.x-.1,y:escalator.y-1.3,w:13.3,h:2.6}];
  const nodes:legacy.NavNode[]=[{id:"ENTRANCE",label:"入口A",pos:p(2,entryY)},{id:"ENTRANCE_B",label:"入口B",pos:archetype==="dual"?p(width-2,height/2):p(10,height-2)},
    ...["HALL_W","TICKETS_C","HALL_N","HALL_C","HALL_S"].map((id,i)=>({id,label:"售票与安检区",pos:p(id==="TICKETS_C"?10:13, id==="TICKETS_C"?8:i===2?5:i===4?height-5:height/2)})),
    ...["CONC_N","CONC_C","CONC_S","GATE_N","GATE_C","GATE_S"].map((id,i)=>({id,label:"安检后闸机前",pos:p(26,i%3===0?5:i%3===2?height-5:height/2)})),
    {id:"LANDING_C",label:"付费区楼扶梯导向",pos:p(33,height/2)}, {id:"STAIRS_TOP",label:"楼梯下行入口",pos:top},{id:"ESCALATOR_TOP",label:"扶梯入口侧边",pos:p(escalator.x,escalator.y-1.2)}, {id:"PLATFORM",label:"下层岛式站台",pos:bottom},
    ...attractions.map(a=>({id:a.id,label:a.label,pos:a.approach}))];
  const itemSpots=facilities.filter(f=>f.kind==="security").map(f=>({id:`confiscated-${f.id}`,label:"安检保管处",pos:p(f.exit!.x,f.pos.y+1.5),stock:[],takeSeconds:1.5}));
  const spots:typeof legacy.ITEM_SPOTS=[...itemSpots,{id:"convenience",label:"售票区便民架",pos:p(4,height-3),stock:["newspaper","snack","water_bottle"],takeSeconds:1.5},{id:"vending",label:"安检后饮水架",pos:p(23,height-4),stock:["water_bottle"],takeSeconds:1.5},{id:"lost-property",label:"座椅旁失物",pos:p(25,height-4),stock:["umbrella"],takeSeconds:1.5}];
  const details:DetailPlacement[]=[];
  const families=["entrance","tickets","security","gates","connections","platform","commercial","maintenance"] as const;
  const points=[p(3,height-4),p(10,2),p(20,2),p(32,2),p(37,1),p(24,height/2,"platform"),p(26,2),p(width-6,height-6)];
  for(let i=0;i<families.length;i++)details.push({id:`detail-${families[i]}`,family:families[i],variant:decor.pick([0,1]),pos:points[i],label:["入口公告与站名","售票服务窗口","安检托盘与工作台","宽通道与闸机导向","楼扶梯安全提示","候车座椅与站名牌","售水机与充电设备","设备房与消防设施"][i],body:null,blocksSight:false});
  for(const detail of details) {
    const sizes:Record<DetailPlacement["family"],[number,number]>={entrance:[2.6,.15],tickets:[3,.6],security:[2,.8],gates:[.15,.15],connections:[.8,.2],platform:[3,.8],commercial:[1.6,1],maintenance:[2.2,.3]};
    const [w,h]=sizes[detail.family];detail.body={x:detail.pos.x-w/2,y:detail.pos.y-h/2,w,h,floorId:detail.pos.floorId};detail.blocksSight=["tickets","commercial","maintenance"].includes(detail.family);
  }
  const room=details.find(d=>d.family==="maintenance")!;room.body={x:width-12,y:height-6,w:12,h:6,floorId:"concourse"};room.yaw=Math.PI;
  const railY=(facilities.filter(f=>f.kind==="security"&&f.pos.x===sx)[0].pos.y+facilities.filter(f=>f.kind==="security"&&f.pos.x===sx)[1].pos.y)/2;
  const layout:StationLayout={...legacy,WIDTH:width,HEIGHT:height,SECURITY_X:sx,GATE_X:gx,STAIRS_X:36,PLATFORM_X:48,STAIRS_TOP:top,STAIRS_BOTTOM:bottom,ESCALATOR_TOP:escalator,ESCALATOR_APPROACH:p(escalator.x,escalator.y-1.2),ESCALATOR_BOTTOM:escalatorBottom,ENTRANCE:nodes[0].pos,FACILITIES:facilities,PILLARS:pillars,ATTRACTIONS:attractions,SECURITY_BARRIERS:securityBarriers,GATE_BARRIERS:gateBarriers,SIGHT_OCCLUDERS:[...pillars,...attractions.flatMap(a=>a.blocksSight&&a.body?[a.body]:[])],MOVE_BLOCKERS:move,NAV_NODES:nodes,ITEM_SPOTS:spots,RAILING_X:sx,RAILING_SEGMENTS:[{minY:railY-1,maxY:railY+1}],RAILING_APPROACHES:[{id:"RAIL_N",label:"安检低栏杆前",pos:p(sx-.7,railY)}],openings,openingBlocks:openings.map(r=>({...r,x:r.x+.9,w:r.w-.9}))};
  layout.zoneOf=(v)=>v.floorId==="platform"?"platform":v.floorId?.startsWith("transit")?"stairs":v.x>paidEnd?(archetype==="dual"&&v.x<width-7?"concourse":"hall"):v.x<sx?"hall":v.x<gx?"concourse":"landing";
  layout.NAV_NODES.push(...layout.RAILING_APPROACHES);
  layout.atRailing=v=>layout.zoneOf(v)==="hall"&&Math.abs(v.x-sx)<=1.8&&Math.abs(v.y-railY)<=1;
  // The side service band runs across a broader hall; its stairs cross the platform axis.
  if(archetype==="side") rotateLayout(layout,details);
  const platformDetail=details.find(d=>d.family==="platform")!;
  if(archetype==="side"){platformDetail.pos={...layout.STAIRS_BOTTOM,x:12,y:42+connectionOffset};platformDetail.yaw=0;platformDetail.body={x:10.5,y:41.6+connectionOffset,w:3,h:.8,floorId:"platform"};}
  layout.solids=details.flatMap(d=>d.body?[d.body]:[]);
  layout.SIGHT_OCCLUDERS.push(...details.flatMap(d=>d.blocksSight&&d.body?[d.body]:[]));
  const center=archetype==="side"?(layout.STAIRS_TOP.y+layout.STAIRS_BOTTOM.y)/2:layout.HEIGHT/2;
  layout.platformAxis={direction:"x",center,halfWidth:7};
  layout.MOVE_BLOCKERS.push(...[{x:0,y:0,w:layout.WIDTH,h:center-7},{x:0,y:center+7,w:layout.WIDTH,h:layout.HEIGHT-center-7}].map(r=>({...r,floorId:"platform"})));
  const securityLanes = layout.FACILITIES.filter(f => f.kind === "security");
  // Match the balanced mainline: staff monitor the two outer lanes while the
  // middle lane still provides normal service without its own stationary guard.
  const staffedLanes = [securityLanes[0], securityLanes[securityLanes.length - 1]];
  const guards: import("./scenario").GuardDef[]=staffedLanes.map(f=>({id:`security-${f.id}`,label:`${f.id}安检员`,role:"security_staff" as const,route:[{...f.exit!,x:f.exit!.x+(f.queueDirection?.y??0)*2.2,y:f.exit!.y-(f.queueDirection?.x??-1)*2.2}],facing:Math.atan2(f.queueDirection?.y??0,f.queueDirection?.x??-1),speed:.9,pauseSeconds:0,sightRange:SECURITY_STAFF_VISION.range,sightFovDeg:SECURITY_STAFF_VISION.fovDeg}));
  guards.push(...[{id:"guard-A",label:"付费区巡视",role:"guard" as const,route:[{...layout.STAIRS_TOP,y:layout.STAIRS_TOP.y-2},{...layout.STAIRS_TOP,x:layout.STAIRS_TOP.x-2,y:layout.STAIRS_TOP.y-2}],facing:Math.PI,speed:.9,pauseSeconds:2}]);
  const floors:WorldDefinition["floors"]=[{id:"concourse",elevation:0,ceiling:6,bounds:{x:0,y:0,w:layout.WIDTH,h:layout.HEIGHT}},{id:"platform",elevation:-6,ceiling:-1,bounds:{x:0,y:0,w:layout.WIDTH,h:layout.HEIGHT}}];
  const regions:WorldDefinition["regions"]=[{kind:"hall",bounds:{x:0,y:0,w:sx,h:height},floorId:"concourse"},{kind:"concourse",bounds:{x:sx,y:0,w:gx-sx,h:height},floorId:"concourse"},{kind:"landing",bounds:{x:gx,y:0,w:paidEnd-gx,h:height},floorId:"concourse"},{kind:"hall",bounds:{x:archetype==="dual"?width-7:paidEnd,y:0,w:archetype==="dual"?7:width-paidEnd,h:height},floorId:"concourse"}];
  if(archetype==="dual")regions.push({kind:"concourse",bounds:{x:paidEnd,y:0,w:width-7-paidEnd,h:height},floorId:"concourse"});
  if(archetype==="side")for(const region of regions){const r=region.bounds;region.bounds={x:height-r.y-r.h,y:r.x,w:r.h,h:r.w};}
  bindLayout(layout,regions);
  const entrances=buildEntrances(layout);
  const hash=layoutHash({archetype,layout,details,entrances,theme:appearanceSeed});
  return {generatorVersion:"metro-v1",layoutHash:hash,seed,archetype,regions,entrances,name:`${["青禾","云桥","南园","新城"][seed%4]}站`,theme:{accent:decor.pick(["#9cae99","#b49a65","#779caa"]),wall:"#e6e2d7",floor:"#b6c0b6",variant:decor.pick([0,1])},floors,layout,guards,details,generation:{attempts:attempt+1,fallback:false,reasons:[],emptyRouteSeconds:0}};
}
function rotateLayout(l:StationLayout,details:DetailPlacement[]) {
  const oldH=l.HEIGHT, rotate=(p:Vec):Vec=>({...p,x:oldH-p.y,y:p.x});
  const rect=(r:Rect):Rect=>({...r,x:oldH-r.y-r.h,y:r.x,w:r.h,h:r.w});
  const zone=l.zoneOf,rail=l.atRailing;
  for(const k of ["ENTRANCE","STAIRS_TOP","STAIRS_BOTTOM","ESCALATOR_TOP","ESCALATOR_BOTTOM","ESCALATOR_APPROACH"] as const)l[k]=rotate(l[k]);
  for(const f of l.FACILITIES){f.pos=rotate(f.pos);f.head=rotate(f.head);if(f.exit)f.exit=rotate(f.exit);if(f.queueDirection)f.queueDirection={x:-f.queueDirection.y,y:f.queueDirection.x};}
  for(const n of l.NAV_NODES)n.pos=rotate(n.pos);
  for(const s of l.ITEM_SPOTS)s.pos=rotate(s.pos);
  for(const a of l.ATTRACTIONS){a.pos=rotate(a.pos);a.approach=rotate(a.approach);if(a.body)a.body=rect(a.body);}
  for(const k of ["PILLARS","MOVE_BLOCKERS","SIGHT_OCCLUDERS","SECURITY_BARRIERS","GATE_BARRIERS","openings","openingBlocks"] as const)l[k]=l[k]?.map(rect) as Rect[];
  for(const d of details){d.yaw=(d.yaw??0)-Math.PI/2;d.pos=rotate(d.pos);if(d.body)d.body=rect(d.body);}
  [l.WIDTH,l.HEIGHT]=[l.HEIGHT,l.WIDTH];
  l.zoneOf=p=>zone({...p,x:p.y,y:oldH-p.x});l.atRailing=p=>rail({...p,x:p.y,y:oldH-p.x});
}
export function validateWorld(def:WorldDefinition):string[] {
  const errors:string[]=[],l=def.layout;
  for(const [kind,min,max] of [["tvm",3,5],["security",3,4],["gate",4,8]] as const){const n=l.FACILITIES.filter(f=>f.kind===kind).length;if(n<min||n>max)errors.push(`${kind} count`);}
  if(new Set(l.FACILITIES.map(f=>f.id)).size!==l.FACILITIES.length)errors.push("duplicate facility");
  for(const v of [...l.NAV_NODES.map(n=>n.pos),...l.FACILITIES.flatMap(f=>[f.pos,f.head,...(f.exit?[f.exit]:[])])])if(!Number.isFinite(v.x)||!Number.isFinite(v.y)||!contains(def.floors[0].bounds,v))errors.push("outside bounds");
  for(const f of l.FACILITIES)if(l.zoneOf(f.head)!==(f.kind==="tvm"||f.kind==="security"?"hall":"concourse"))errors.push(`wrong side ${f.id}`);
  const tvm=l.FACILITIES.filter(f=>f.kind==="tvm"&&l.zoneOf(f.head)==="hall").sort((a,b)=>Math.hypot(a.head.x-l.ENTRANCE.x,a.head.y-l.ENTRANCE.y)-Math.hypot(b.head.x-l.ENTRANCE.x,b.head.y-l.ENTRANCE.y))[0]!, s=l.FACILITIES.find(f=>f.kind==="security")!,g=l.FACILITIES.find(f=>f.kind==="gate")!;
  const spatial=createMovement(l),nav=createNavigation(l,spatial);
  const legs=[[l.ENTRANCE,tvm.head],[tvm.head,s.head],[s.exit!,g.head],[g.exit!,l.STAIRS_TOP]];
  for(const ingress of ["A","B"]) {
    const group=l.FACILITIES.filter(f=>f.ingress===ingress);if(!group.length)continue;
    const entry=l.NAV_NODES.find(n=>n.id===(ingress==="A"?"ENTRANCE":"ENTRANCE_B"))!.pos;
    const security=group.find(f=>f.kind==="security")!;
    for(const f of group){const from=f.kind==="gate"?security.exit!:entry;if(!nav.findPath(from,f.head,.48))errors.push(`unreachable ${f.id}`);if(f.kind==="gate"&&(!nav.findPath(f.exit!,l.STAIRS_TOP,.48)||!nav.findPath(f.exit!,l.ESCALATOR_APPROACH,.48)))errors.push(`connector unreachable ${f.id}`);}
  }
  for(const opening of l.openings??[])for(const point of [{x:opening.x,y:opening.y},{x:opening.x+opening.w,y:opening.y+opening.h}])if(!contains(def.floors[0].bounds,point)||l.zoneOf(point)!=="landing")errors.push("opening outside paid floor");
  if(def.connectors){
    for(const c of def.connectors){
      for(const f of l.FACILITIES.filter(f=>f.kind==="gate"))if(!nav.findPath(f.exit!,c.approach,.48))errors.push(`connector unreachable ${c.id} from ${f.id}`);
      if(!spatial.clearOfScenery(c.to,c.to,.48)||c.to.floorId!=="platform"||c.from.floorId!=="concourse")errors.push(`invalid connector ${c.id}`);
      for(const door of generatedTrainDoors(def))if(nav.findPath(c.to,door.pos,.48))break;
      if(!generatedTrainDoors(def).some(door=>nav.findPath(c.to,door.pos,.48)))errors.push(`connector cannot reach train ${c.id}`);
    }
  }
  let walking=0;
  for(const [from,to] of legs){const path=nav.findPath(from,to,.48);if(!path){errors.push("legal route disconnected");continue;}walking+=nav.pathLength(from,path);}
  for(const f of l.FACILITIES){
    for(let i=0;i<4;i++){const q=f.queueDirection??{x:-1,y:0},slot={...f.head,x:f.head.x+q.x*i*.98,y:f.head.y+q.y*i*.98};if(!spatial.clearOfScenery(slot,slot,.48))errors.push(`queue blocked ${f.id}`);}
    const q=f.queueDirection??{x:-1,y:0},exit=f.exit??{...f.head,x:f.head.x+q.y*1.3,y:f.head.y-q.x*1.3};
    if(!spatial.clearServiceExit(f.head,exit,.32))errors.push(`service exit blocked ${f.id}`);
  }
  for(const entry of def.entrances??[]){if(l.zoneOf(entry.bottom)!=="hall"||!spatial.clearOfScenery(entry.bottom,entry.bottom,.48)||entry.top.elevation<=entry.bottom.elevation)errors.push(`invalid entrance ${entry.id}`);}
  // Include the real platform approach and controlled doorway path in the
  // empty-route budget now that winning requires boarding the train.
  let boarding = Infinity;
  for (const door of generatedTrainDoors(def)) {
    const path = nav.findPath(l.STAIRS_BOTTOM, door.pos, .32);
    if (!path) continue;
    let distance = nav.pathLength(l.STAIRS_BOTTOM, path), from = door.pos;
    for (const point of door.boardingPath) { distance += Math.hypot(point.x - from.x, point.y - from.y); from = point; }
    boarding = Math.min(boarding, distance / 1.4);
  }
  if (!Number.isFinite(boarding)) errors.push("train doors unreachable");
  const cost=(def.entrances?.length?entranceLength(def.entrances[0])/1.4:0)+walking/1.4+9+8*1.4+2+2.5+6+boarding;
  if(!Object.isFrozen(def.generation))def.generation.emptyRouteSeconds=cost;if(cost>90)errors.push("empty route exceeds 90s");
  return errors;
}
export function generateWorld(seed:number, options:{appearanceSeed?:number; generatorVersion?:"metro-v1"|"metro-v2"}={}):WorldDefinition {
  if(!Number.isInteger(seed)||seed<1||seed>4294967295)throw new RangeError("世界种子须为1–4294967295的整数");
  if(options.generatorVersion==="metro-v2")return createWorldV2(seed);
  const reasons:string[]=[];
  for(let i=0;i<20;i++){const d=candidate(seed,i,options.appearanceSeed);const errors=validateWorld(d);if(!errors.length){d.generation.reasons=reasons;return deepFreeze(d);}reasons.push(...errors);}
  const d=candidate(1,0,options.appearanceSeed);d.seed=seed;d.generation={...d.generation,attempts:20,fallback:true,reasons};if(validateWorld(d).length)throw new Error("世界样板无效");return deepFreeze(d);
}
function bindLayout(layout:StationLayout,regions:WorldDefinition["regions"]) {
  layout.zoneOf=p=>p.floorId==="platform"?"platform":p.floorId?.startsWith("transit")?"stairs":regions.find(r=>contains(r.bounds,p))?.kind??"hall";
  layout.atRailing=p=>layout.zoneOf(p)==="hall"&&layout.RAILING_APPROACHES.some(n=>Math.hypot(p.x-n.pos.x,p.y-n.pos.y)<=1.8);
}
export function hydrateWorld(d:WorldDefinition):WorldDefinition {
  if(d.generatorVersion==="legacy-v0")return legacyWorld(d.seed);
  const result={...d,layout:{...d.layout}};
  bindLayout(result.layout,result.regions);
  return deepFreeze(result);
}

export function descriptor(d:WorldDefinition):WorldDescriptor{return {generatorVersion:d.generatorVersion,layoutHash:d.layoutHash};}
export function publicMap(d:WorldDefinition):PublicStationMap{return {...descriptor(d),name:d.name,...(d.entrances?{entrances:d.entrances}:{}),floors:d.floors,regions:d.regions,itemSpots:d.layout.ITEM_SPOTS.map(({id,label,pos})=>({id,label,pos})),attractions:d.layout.ATTRACTIONS.map(({id,label,pos})=>({id,label,pos})),nodes:d.generatorVersion !== "legacy-v0" ? [...d.layout.NAV_NODES, { id: "BLACKOUT_SWITCH", label: "墙边电闸接近点", pos: stationSwitch(d).approach }, ...generatedTrainDoors(d).map(({ id, label, pos }) => ({ id, label, pos }))] : d.layout.NAV_NODES,facilities:d.layout.FACILITIES.map(({id,kind,label,pos})=>({id,kind,label,pos})),routes:d.connectors?d.connectors.map(c=>({id:c.kind,connectorId:c.id,node:c.node,position:c.approach,travelSeconds:c.travelSeconds})):[{id:"stairs",node:"STAIRS_TOP",position:d.layout.STAIRS_TOP,travelSeconds:6},{id:"escalator",node:"ESCALATOR_TOP",position:d.layout.ESCALATOR_APPROACH,travelSeconds:10}]};}

export const serializableWorld=(d:WorldDefinition):WorldDefinition=>JSON.parse(JSON.stringify(d)) as WorldDefinition;
