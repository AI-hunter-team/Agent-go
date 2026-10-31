import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type DirectionalLight, type PointLight } from "three";
import type { GameSession } from "../gameSession";
import { createGeneratedPalette } from "./generatedSurfaces";
import { createControlRoomSuite, disposeControlAsset } from "./controlRoomModels";
import { CONTROL_ROOM_LIGHTING, stationLightBlend } from "./controlRoomLighting";
import { controlRoomState } from "./controlRoomLayout";
import { LOUNGE } from "./loungeLayout";
import { Sign } from "./Sign";
export type RoomAction="world"|"character"|"guidance"|"settings";
/** Fixed lounge remains mounted. Static map previews have their own UI lifecycle. */
export function ControlRoom({session,standard}:{session:GameSession;standard:boolean}){
 const palette=useMemo(()=>createGeneratedPalette(),[]);
 const models=useMemo(()=>createControlRoomSuite(palette,false),[palette]);
 const keyTarget=useMemo(()=>{const t=new Object3D();t.position.set(...LOUNGE.actor);t.position.y=1;return t;},[]);
 const keyLight=useRef<DirectionalLight>(null),fillLights=useRef<(PointLight|null)[]>([]);
 useEffect(()=>()=>{disposeControlAsset(models);palette.dispose();},[models,palette]);
 useFrame(()=>{const state=controlRoomState(session),amount=1-stationLightBlend(state);
  if(keyLight.current){keyLight.current.intensity=CONTROL_ROOM_LIGHTING.key*amount;keyLight.current.shadow.autoUpdate=amount>.001;}
  fillLights.current.forEach((light,index)=>{if(light)light.intensity=CONTROL_ROOM_LIGHTING.points[index]*amount;});
  for(const side of [-1,1]){const leaf=models.getObjectByName(`door-leaf-${side}`);if(leaf)leaf.position.z=side*(.52+state.door*1.04);}
 });
 return <group name="departure-control-room"><primitive object={models} dispose={null}/>
  <Sign text="入口 →" position={[-3.15,2.84,3.5]} width={1.3} facing="west"/>
  <primitive object={keyTarget}/>
  <directionalLight ref={keyLight} name="control-room-key" target={keyTarget} position={[-8.2,2.9,5.8]} intensity={CONTROL_ROOM_LIGHTING.key} color="#fff3e6" castShadow={standard} shadow-mapSize={[1024,1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} shadow-camera-near={.1} shadow-camera-far={14} shadow-normalBias={.025}/>
  <pointLight ref={light=>{fillLights.current[0]=light;}} position={[-5.95,2.3,.8]} intensity={6} distance={12} color="#fff0e5"/>
  <pointLight ref={light=>{fillLights.current[1]=light;}} position={[-9.2,2.45,1.1]} intensity={3} distance={7} color="#dce8ee"/>
  <pointLight ref={light=>{fillLights.current[2]=light;}} position={[-1.5,2.5,3.5]} intensity={8} distance={7} color="#fff0df"/>
  </group>;
}
