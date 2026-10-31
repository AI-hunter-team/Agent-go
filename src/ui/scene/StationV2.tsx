import { serviceBankSigns,stationNamePositions,stationLightPositions } from "./stationWayfinding";
import { stationDetailScene } from "./stationDetailScene";
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { GameSession } from "../gameSession";
import type { StationKit } from "./stationAssets";
import { createGeneratedPalette } from "./generatedSurfaces";
import { createStationV2Architecture } from "./stationV2Architecture";
import { createGeneratedProp } from "./generatedProps";
import { disposeSurfaceGeometry } from "./surfaceGeometry";
import { devicePosition } from "./stationLayout";
import { makeMaterials, setFacilityState, setGateProgress } from "../../assets/station-kit/index";
import { EntrancePassages } from "./EntrancePassages";
import { Sign } from "./Sign";
export function StationV2({session,kit,overview,standard=true}:{session:GameSession;kit?:StationKit;overview:boolean;standard?:boolean}){
 const d=session.engine.world.definition;
 const palette=useMemo(()=>{const p=createGeneratedPalette(kit);p.stone.roughness=.4;p.paint.roughness=.55;p.steel.roughness=.28;p.glass.opacity=.3;return p;},[kit]);
 useEffect(()=>()=>palette.dispose(),[palette]);
 const building=useMemo(()=>createStationV2Architecture(d,palette,standard),[d,palette,standard]);
 useEffect(()=>()=>building.dispose(),[building]);
 useEffect(()=>{building.ceiling.visible=!overview;building.deck.visible=!overview;},[building,overview]);
 const devices=useMemo(()=>kit?d.layout.FACILITIES.map(f=>{const root=kit.models.get(f.kind==="tvm"?"ticket-machine":f.kind==="security"?"security-arch":"fare-gate")!.clone(true);root.name=f.id;root.position.set(...devicePosition(f.kind,f.pos.x,f.pos.y,f.queueDirection));root.rotation.y=Math.atan2(f.queueDirection?.x??-1,f.queueDirection?.y??0);return root;}):[],[kit,d]);
 const detailScene=useMemo(()=>d.props?stationDetailScene(d,palette,kit,standard):null,[d,palette,kit,standard]);
 useEffect(()=>()=>detailScene?.dispose(),[detailScene]);
 const states=useMemo(()=>makeMaterials(),[]);useEffect(()=>()=>{Object.values(states).forEach(m=>m.dispose());},[states]);
 const props=useMemo(()=>d.details.map(detail=>{const root=createGeneratedProp(detail,palette);root.position.set(detail.pos.x,detail.pos.floorId==="platform"?-6:0,detail.pos.y);return root;}),[d,palette]);
 useEffect(()=>()=>props.forEach(disposeSurfaceGeometry),[props]);
 useFrame(()=>{for(const root of devices){const f=session.engine.world.facility(root.name);if(f){if(root.userData.state!==f.status)setFacilityState(root,f.status,states);if(f.def.kind==="gate")setGateProgress(root,f.serving?1:0);}}});
 return <group name="generated-station" userData={{hash:d.layoutHash}}>
  <primitive object={building.root} dispose={null}/>
  {detailScene&&<primitive object={detailScene.root} dispose={null}/>}
  <EntrancePassages session={session} overview={overview} palette={palette}/>
  {devices.map(root=><primitive key={root.name} object={root} dispose={null}/>)}
  {!kit&&d.layout.FACILITIES.map(f=><mesh key={f.id} position={[f.pos.x,.8,f.pos.y]} material={palette.steel}><boxGeometry args={[.6,1.6,.8]}/></mesh>)}
  {props.map((root,i)=><primitive key={d.details[i].id} object={root} dispose={null}/>)}
  {serviceBankSigns(d).map(s=><Sign key={s.id} text={s.text} position={[s.x,2.8,15]} width={4} facing={s.west?"west":"east"}/>)}
  {d.connectors!.map(c=><Sign key={c.id} text={`${c.groupId}  ${c.kind==="stairs"?"楼梯":"扶梯"}  ↓ 站台`} position={[c.from.x,2.7,c.from.y]} width={2.8} facing={c.to.x>c.from.x?"west":"east"}/>)}
  {stationNamePositions(d).flatMap(x=>[-1,1].map(side=><Sign key={`${x}:${side}`} text="青禾站  /  QINGHE" position={[x,-3.3,15+side*6.65]} width={4} facing={side===1?"north":"south"}/>))}
  {stationLightPositions(d).filter((_,i)=>standard||i%2===0).flatMap(x=>[0,-6].map(y=><pointLight key={`${x}:${y}`} position={[x,y+(y===0?3.25:3.05),15]} intensity={session.presentation.current.blackout.active?2:58} distance={16} decay={2} color="#fff5e6"/>))}
 </group>;
}
