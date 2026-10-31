import { stationSwitch } from "../../sim/stationSwitch";
import { EntrancePassages } from "./EntrancePassages";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Group, Mesh, type MeshStandardMaterial } from "three";
import type { GameSession } from "../gameSession";
import type { StationKit } from "./stationAssets";
import { batchStation, disposeBatches } from "./stationAssets";
import type { Placement } from "./stationLayout";
import { devicePosition } from "./stationLayout";
import { makeMaterials, setFacilityState, setGateProgress } from "../../assets/station-kit/index";
import { box, materials } from "./resources";
import { Sign } from "./Sign";
import { generatedStationPlacements } from "./generatedPlacements";
import type { DetailPlacement, WorldDefinition } from "../../shared/world";
import { createGeneratedPalette, type GeneratedPalette, type SurfaceName } from "./generatedSurfaces";
import { createGeneratedPlatform, stairFlight } from "./generatedArchitecture";
import { createGeneratedProp } from "./generatedProps";
import { disposeSurfaceGeometry, metreUV, SurfaceBuilder } from "./surfaceGeometry";

const PaletteContext = createContext<GeneratedPalette | null>(null);
const colorSurface: Record<keyof typeof materials, SurfaceName> = { chalk: "wall", white: "paint", ink: "rubber", line: "concrete", ochre: "tactile", sage: "sage", blue: "jade", brick: "red", grey: "steel", screen: "screen" };
function Block({at,size,color="chalk"}:{at:[number,number,number];size:[number,number,number];color?:keyof typeof materials}) {
  const p = useContext(PaletteContext)!, material = p[colorSurface[color]], [x,y,z] = size;
  const geometry = useMemo(() => metreUV(new BoxGeometry(x,y,z), Number(material.userData.metres ?? 1)), [x,y,z,material]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} position={at} castShadow receiveShadow dispose={null}/>;
}
function FallbackPart({p}:{p:Placement}) {
  const sizes:Record<string,[number,number,number]>={"wall-straight":[3,3.5,.4],"ceiling-fascia":[3,2.5,.4],pillar:[2,5.95,2],"ceiling-panel":[3,.12,3],"light-strip":[2.2,.05,.2],"metal-straight":[p.railLength??3,1.1,.1]};
  const floor=p.id.startsWith("floor"),size=floor?[3,.12,3]:sizes[p.id];if(!size)return null;
  return <group position={p.position} rotation={[0,p.yaw,0]}><Block at={[0,floor?-.06:size[1]*p.scale[1]/2,0]} size={[size[0]*p.scale[0],size[1]*p.scale[1],size[2]*p.scale[2]]} color={floor?"sage":"grey"}/></group>;
}
function Detail({d}:{d:DetailPlacement}) {
  const p = useContext(PaletteContext)!, root = useMemo(() => createGeneratedProp(d,p), [d,p]);
  useEffect(() => () => disposeSurfaceGeometry(root), [root]);
  const tall=d.variant===1;
  const text = d.family === "entrance" ? (tall ? "出口索引 / 今日公告" : "本站服务 / 出口信息") : d.family === "tickets" ? (tall ? "票务咨询 / 无障碍服务" : "乘客服务 / 问询") : d.family === "gates" ? (tall ? "宽通道 / 无障碍" : "检票进站 / 站台 ↓") : d.family === "connections" ? "请握紧扶手 / 站台 ↓" : d.family === "platform" ? "候车区 / 请先下后上" : d.family === "commercial" ? "饮水 / 便民服务" : d.family === "maintenance" ? "设备用房 / 非请勿入" : "安检托盘 / 请取回物品";
  const height = d.family === "entrance" ? 2.57 : d.family === "platform" ? 2.2 : d.family === "maintenance" ? 2.2 : 2.6;
  return <group position={[d.pos.x,d.pos.floorId==="platform"?-6:0,d.pos.y]} name={d.id} rotation={[0,d.yaw??0,0]}>
    <primitive object={root} dispose={null}/>
    <Sign text={text} position={[0,height,d.family === "maintenance" ? .13 : d.family === "entrance" ? .12 : .18]} width={d.family === "platform" ? 3.8 : d.family === "maintenance" ? 1.8 : 2.6} facing="south"/>
  </group>;
}
function Platform({d,p}:{d:WorldDefinition;p:GeneratedPalette}) {
  const model = useMemo(() => createGeneratedPlatform(d,p),[d,p]);
  useEffect(() => model.dispose,[model]);
  return <primitive object={model.root} dispose={null}/>;
}
function Flight({top,bottom,escalator,p}:{top:{x:number;y:number};bottom:{x:number;y:number};escalator:boolean;p:GeneratedPalette}) {
  const run=Math.hypot(bottom.x-top.x,bottom.y-top.y), angle=Math.atan2(bottom.y-top.y,bottom.x-top.x);
  const root=useMemo(() => stairFlight(p,run,6,2.4,36,escalator),[p,run,escalator]);
  useEffect(() => () => disposeSurfaceGeometry(root),[root]);
  return <group name={escalator ? "generated-escalator" : "generated-stairs"} position={[top.x,0,top.y]} rotation={[0,-angle,0]}>
    <primitive object={root} dispose={null}/>
    <Sign text={escalator ? "扶梯 ↓ 站台" : "楼梯 ↓ 站台"} position={[-.8,2.6,0]} width={3}/>
  </group>;
}
function GeneratedOutages({session}:{session:GameSession}) {
  const refs=useRef<(Mesh|null)[]>([]),d=session.engine.world.definition;
  const areas=[...d.regions,{kind:"platform" as const,floorId:"platform" as const,bounds:d.floors[1].bounds}];
  useFrame(()=>areas.forEach((area,i)=>{if(refs.current[i])refs.current[i]!.visible=(session.engine.world.outages.get(area.kind)??0)>session.engine.t;}));
  return <group>{areas.map((area,i)=><mesh key={i} ref={mesh=>{refs.current[i]=mesh;}} geometry={box} position={[area.bounds.x+area.bounds.w/2,area.floorId==="platform"?-5.96:.04,area.bounds.y+area.bounds.h/2]} scale={[area.bounds.w,.02,area.bounds.h]}><meshBasicMaterial color="#121a22" transparent opacity={.65} depthWrite={false}/></mesh>)}</group>;
}
export function GeneratedStation({session,kit,overview}:{session:GameSession;kit?:StationKit;overview:boolean}) {
  const d=session.engine.world.definition,l=d.layout,concourse=useRef<Group>(null),modelRoot=useRef<Group>(null);
  const palette = useMemo(() => createGeneratedPalette(kit),[kit]);
  useEffect(() => () => palette.dispose(),[palette]);
  const attractions = useMemo(() => l.ATTRACTIONS.filter(a=>a.body).map(a=>({id:a.id,family:a.kind === "seating" ? "platform" as const : "commercial" as const,variant:1,pos:a.pos,label:a.label,body:a.body,blocksSight:a.blocksSight,yaw:a.body!.h>a.body!.w?Math.PI/2:0})),[l]);
  const placements=useMemo(()=>generatedStationPlacements(d,overview),[d,overview]);
  const colored=useMemo(()=>{
    if(!kit)return undefined;const batch=batchStation(kit,placements),clones=new Map<MeshStandardMaterial,MeshStandardMaterial>();
    batch.traverse(node=>{if(node instanceof Mesh&&!Array.isArray(node.material)){
      const source=node.material as MeshStandardMaterial;
      if(source.name==="kit.coating.ochre"){let material=clones.get(source);if(!material){material=source.clone();material.color.set(d.theme.accent);clones.set(source,material);}node.material=material;}
    }});return {batch,clones};
  },[kit,placements,d.theme.accent]);
  const batch=colored?.batch;
  const lowerCeiling=useMemo(()=>{const builder=new SurfaceBuilder();for(const p of placements.filter(p=>p.id.startsWith("floor")))builder.box(palette.concrete,[p.scale[0]*3,.15,p.scale[2]*3],[p.position[0],-1,p.position[2]]);return builder.finish("generated-lower-ceiling");},[placements,palette]);
  useEffect(()=>()=>disposeSurfaceGeometry(lowerCeiling),[lowerCeiling]);
  const devices=useMemo(()=>kit?l.FACILITIES.map(f=>{const root=kit.models.get(f.kind==="tvm"?"ticket-machine":f.kind==="security"?"security-arch":"fare-gate")!.clone(true);root.name=f.id;root.position.set(...devicePosition(f.kind,f.pos.x,f.pos.y,f.queueDirection));root.rotation.y=Math.atan2(f.queueDirection?.x??-1,f.queueDirection?.y??0);return root;}):[],[kit,l]);
  const stateMaterials=useMemo(()=>makeMaterials(),[]);
  useEffect(()=>()=>{if(colored){disposeBatches(colored.batch);colored.clones.forEach(m=>m.dispose());}},[colored]);
  useEffect(()=>()=>{Object.values(stateMaterials).forEach(m=>m.dispose());},[stateMaterials]);
  useFrame(()=>{
    if(concourse.current)concourse.current.visible=!(session.engine.player.pos.floorId==="platform"||session.engine.player.pos.floorId?.startsWith("transit"));
    for(const root of devices){const f=session.engine.world.facility(root.name);if(f){if(root.userData.state!==f.status)setFacilityState(root,f.status,stateMaterials);if(f.def.kind==="gate")setGateProgress(root,f.serving?1:0);}}
  });
  useEffect(()=>{const target=window as typeof window&{worldgenInspect?:()=>unknown};target.worldgenInspect=()=>{const textured=new Set<string>();modelRoot.current?.traverse(n=>{if(n instanceof Mesh){for(const m of Array.isArray(n.material)?n.material:[n.material])if((m as MeshStandardMaterial).map)textured.add(m.name);}});const trains=modelRoot.current?.getObjectByName("generated-metro-trains");return {assets:{texturedMaterials:[...textured].sort(),trains:trains?.userData},version:d.generatorVersion,hash:d.layoutHash,archetype:d.archetype,name:d.name,devices:l.FACILITIES.length,details:d.details.length,floor:session.engine.player.pos.floorId??"concourse",entrances:d.entrances?.length??0,entry:session.engine.player.activity.kind==="entering"?session.engine.player.activity.progress:null,position:{...session.engine.player.pos},attempts:d.generation.attempts};};return()=>{delete target.worldgenInspect;};},[d,l,session]);
  const side=l.platformAxis?.direction==="y", length=side?l.HEIGHT:l.WIDTH,center=l.platformAxis?.center??l.HEIGHT/2;
  return <PaletteContext.Provider value={palette}><group ref={modelRoot} name="generated-station" userData={{hash:d.layoutHash}}>
    <GeneratedOutages session={session}/>
    <group ref={concourse}>
      <group name="blackout-switch" position={[stationSwitch(d).position.x, 1.1, stationSwitch(d).position.y]}>
        <Block at={[0, 0, 0]} size={[.45, 1.2, .3]} color="ink"/>
        <Block at={[0, .05, 0]} size={[.15, .28, .34]} color={session.presentation.current.blackout.active ? "brick" : "grey"}/>
      </group>
      <EntrancePassages session={session} overview={overview} palette={palette}/>
      {batch?<primitive object={batch} dispose={null}/>:placements.map((p,i)=><FallbackPart key={i} p={p}/>)}
      {devices.map(root=><primitive key={root.name} object={root} dispose={null}/>)}
      {!kit&&l.FACILITIES.map(f=><Block key={f.id} at={[f.pos.x,1,f.pos.y]} size={[.5,2,1]} color={f.kind==="gate"?"ochre":"grey"}/>)}

      {attractions.map(a=><Detail key={a.id} d={a}/>)}
      {l.FACILITIES.map(f=><Sign key={`label-${f.id}`} text={f.id} position={[f.pos.x,2.8,f.pos.y]} width={1.5} facing={d.archetype==="side"?"south":"west"}/>)}
      {l.NAV_NODES.filter(n=>["ENTRANCE","GATE_C","LANDING_C"].includes(n.id)).map(n=><Sign key={n.id} text={n.id==="ENTRANCE"?`${d.name} / 售票与安检 →`:n.id==="GATE_C"?"检票进站 →":"楼梯 / 扶梯 ↓  同一站台"} position={[n.pos.x,3,n.pos.y]} width={5} facing={d.archetype==="side"?"south":"west"}/>)}
      {d.details.filter(v=>v.family==="maintenance"&&v.body).map(v=><Block key={`room-${v.id}`} at={[v.body!.x+v.body!.w/2,3,v.body!.y+v.body!.h/2]} size={[v.body!.w,6,v.body!.h]} color="chalk"/>)}
      {d.details.filter(v=>v.pos.floorId!=="platform").map(v=><Detail key={v.id} d={v}/>)}
    </group>
    <Platform d={d} p={palette}/>
    <group position={side?[center,-6,0]:[0,-6,center]} rotation={[0,side?-Math.PI/2:0,0]}>
      <Sign text={`${d.name} / 1号站台 ← → 2号站台`} position={[length/2,2.4,0]} width={7} facing="south"/>
      <pointLight position={[length/2,3,0]} intensity={150} distance={length} color="#ffedce"/>
    </group>
    <primitive object={lowerCeiling} visible={!overview} dispose={null}/>
    {d.details.filter(v=>v.pos.floorId==="platform").map(v=><Detail key={v.id} d={v}/>)}
    <Flight top={l.STAIRS_TOP} bottom={l.STAIRS_BOTTOM} escalator={false} p={palette}/>
    <Flight top={l.ESCALATOR_TOP} bottom={l.ESCALATOR_BOTTOM} escalator p={palette}/>
  </group></PaletteContext.Provider>;
}
