import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, RepeatWrapping, type DirectionalLight, type PointLight } from "three";
import type { GameSession } from "../gameSession";
import { createGeneratedPalette } from "./generatedSurfaces";
import { createControlRoomSuite, disposeControlAsset } from "./controlRoomModels";
import { CONTROL_ROOM_LIGHTING, stationLightBlend } from "./controlRoomLighting";
import { controlRoomState } from "./controlRoomLayout";
import { LOUNGE } from "./loungeLayout";
import { Sign } from "./Sign";
import { MeshReflectorMaterial } from "@react-three/drei/core/MeshReflectorMaterial";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
export type RoomAction="world"|"character"|"guidance"|"settings";
/** Fixed lounge remains mounted. Static map previews have their own UI lifecycle. */
export function ControlRoom({session,standard,active=true}:{session:GameSession;standard:boolean;active?:boolean}){
 const palette=useMemo(()=>createGeneratedPalette(),[]);
 const models=useMemo(()=>createControlRoomSuite(palette,false),[palette]);
 // 地面平铺细颗粒PBR纹理，克隆后独立释放，不修改共享站厅贴图。
 const floorMaps=useMemo(()=>[palette.stone.map,palette.stone.normalMap,palette.stone.roughnessMap].map(source=>{const texture=source?.clone();if(texture){texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(32,20);texture.needsUpdate=true;}return texture;}),[palette]);
 useEffect(()=>()=>{floorMaps.forEach(texture=>texture?.dispose());},[floorMaps]);
 const keyTarget=useMemo(()=>{const t=new Object3D();t.position.set(...LOUNGE.actor);t.position.y=1;return t;},[]);
 const keyLight=useRef<DirectionalLight>(null),fillLights=useRef<(PointLight|null)[]>([]);
 useEffect(()=>()=>{disposeControlAsset(models);palette.dispose();},[models,palette]);
 useFrame(()=>{const state=controlRoomState(session),amount=1-stationLightBlend(state);
  if(keyLight.current){keyLight.current.intensity=CONTROL_ROOM_LIGHTING.key*amount;keyLight.current.shadow.autoUpdate=amount>.001;}
  fillLights.current.forEach((light,index)=>{if(light)light.intensity=CONTROL_ROOM_LIGHTING.points[index]*amount;});
  for(const side of [-1,1]){const leaf=models.getObjectByName(`door-leaf-${side}`);if(leaf)leaf.visible=false;}
  const brand=models.getObjectByName("lounge-brand");if(brand)brand.visible=state.stage!=="lobby";
 });
 return <group name="departure-control-room"><primitive object={models} dispose={null}/>
  <Sign text="入口 →" position={[-3.16,2.7,2.1]} width={1.8} facing="west" plain/>
  {standard&&active&&<mesh rotation={[-Math.PI/2,0,0]} position={[-11,.006,5.3]} receiveShadow>
    <planeGeometry args={[16,10]}/>
    <MeshReflectorMaterial mirror={0} resolution={512} blur={[180,80]} mixBlur={1} mixStrength={.8} roughness={.4} metalness={.05} color="#e0d4c0" map={floorMaps[0]} normalMap={floorMaps[1]} roughnessMap={floorMaps[2]} normalScale={palette.stone.normalScale} depthScale={.5} minDepthThreshold={.4} maxDepthThreshold={1.4}/>
  </mesh>}
  {standard&&active&&<ContactShadows position={[-7,.015,3]} scale={[8,6]} resolution={512} opacity={.55} blur={2.5} far={2} color="#534535"/>}
  <primitive object={keyTarget}/>
  <directionalLight ref={keyLight} name="control-room-key" target={keyTarget} position={[-8.2,2.9,5.8]} intensity={CONTROL_ROOM_LIGHTING.key} color="#fff3e6" castShadow={standard} shadow-mapSize={[1024,1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} shadow-camera-near={.1} shadow-camera-far={14} shadow-normalBias={.025}/>
  <pointLight ref={light=>{fillLights.current[0]=light;}} position={[-6.09,2.46,.8]} intensity={6} distance={12} color="#ffcb80"/>
  <pointLight ref={light=>{fillLights.current[1]=light;}} position={[-9.2,2.45,2.8]} intensity={3} distance={7} color="#fff2df"/>
  <pointLight ref={light=>{fillLights.current[2]=light;}} position={[-1.8,2.4,2]} intensity={12} distance={7} color="#ffc077"/>
  </group>;
}
