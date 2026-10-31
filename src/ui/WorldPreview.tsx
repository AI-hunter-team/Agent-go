import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ACESFilmicToneMapping, Box3, PerspectiveCamera, PMREMGenerator, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { WorldDefinition } from "../shared/world";
import { assembledRoom, framedPose, localStationKit } from "../showroom/models";
import { loadStationKit, type StationKit } from "./scene/stationAssets";
import { createGeneratedPalette } from "./scene/generatedSurfaces";
import { WorldPlan } from "./WorldPlan";

interface Props {world:WorldDefinition;reset:number;reducedMotion:boolean;quality:"standard"|"low";turn:number;onUnavailable:(reason:string)=>void;}
function Contents({world,kit,reset,turn,reducedMotion,onUnavailable,quality}:{world:WorldDefinition;kit?:StationKit;reset:number;turn:number;reducedMotion:boolean;onUnavailable:Props["onUnavailable"];quality:Props["quality"]}){
  const {camera,size,gl,scene,invalidate}=useThree(),controls=useRef<OrbitControlsImpl>(null);
  const previousTurn=useRef(turn);
  const palette=useMemo(()=>createGeneratedPalette(kit),[kit]);
  const fallback=useMemo(()=>kit?null:localStationKit(palette),[kit,palette]);
  const model=useMemo(()=>{const value=assembledRoom(kit??fallback!,palette,world,quality==="standard");value.setView("overview",false,true);return value;},[world,kit,fallback,palette,quality]);
  const pose=useMemo(()=>{model.root.updateMatrixWorld(true);return framedPose(new Box3().setFromObject(model.root),size.width/Math.max(1,size.height),43,new Vector3(.6,.85,1.25));},[model,size.width,size.height]);
  useEffect(()=>()=>model.dispose(),[model]);
  useEffect(()=>()=>fallback?.dispose(),[fallback]);
  useEffect(()=>()=>palette.dispose(),[palette]);
  useLayoutEffect(()=>{
    if(camera instanceof PerspectiveCamera){camera.aspect=size.width/Math.max(1,size.height);camera.updateProjectionMatrix();}
    camera.position.set(...pose.eye);camera.lookAt(...pose.target);controls.current?.target.set(...pose.target);controls.current?.update();invalidate();
  },[camera,pose,reset,size.width,size.height,invalidate]);
  useEffect(()=>{
    const delta=turn-previousTurn.current;previousTurn.current=turn;
    if(delta&&controls.current){camera.position.sub(controls.current.target).applyAxisAngle(new Vector3(0,1,0),delta*Math.PI/4).add(controls.current.target);controls.current.update();invalidate();}
  },[turn,camera,invalidate]);
  useEffect(()=>{
    if(new URLSearchParams(location.search).get("debug")!=="1")return;
    const inspect=()=>({hash:world.layoutHash,seed:world.seed,camera:camera.position.toArray(),geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,drawCalls:gl.info.render.calls});
    const target=window as typeof window&{worldPreviewInspect?:typeof inspect};target.worldPreviewInspect=inspect;
    return()=>{if(target.worldPreviewInspect===inspect)delete target.worldPreviewInspect;};
  },[world,camera,gl]);
  useEffect(()=>{
    const pmrem=new PMREMGenerator(gl),source=new RoomEnvironment(),environment=pmrem.fromScene(source,.04);source.dispose();pmrem.dispose();
    scene.environment=environment.texture;scene.environmentIntensity=.4;invalidate();
    return()=>{if(scene.environment===environment.texture)scene.environment=null;environment.dispose();};
  },[gl,scene,invalidate]);
  useEffect(()=>{
    const lost=(event:Event)=>{event.preventDefault();onUnavailable("三维画面已中断，已切换到同一张地图的平面预览。");};
    gl.domElement.addEventListener("webglcontextlost",lost);return()=>gl.domElement.removeEventListener("webglcontextlost",lost);
  },[gl,onUnavailable]);
  return <>
    <color attach="background" args={["#e8e8df"]}/>
    <hemisphereLight args={["#fff6df","#819488",.8]}/>
    <directionalLight color="#fff2d9" intensity={1.3} position={[-12,55,42]} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80} shadow-camera-far={180} shadow-normalBias={.035}/>
    <directionalLight color="#e2edf0" intensity={.4} position={[70,28,-20]}/>
    <mesh position={[world.layout.WIDTH/2,-7.66,world.layout.HEIGHT/2]} receiveShadow><boxGeometry args={[world.layout.WIDTH+68,.1,120]}/><meshStandardMaterial color="#eeede4" roughness={.96}/></mesh>
    <primitive object={model.root} dispose={null}/>
    <OrbitControls ref={controls} makeDefault target={pose.target} enableDamping={!reducedMotion} dampingFactor={.09} minDistance={2} maxDistance={230} maxPolarAngle={Math.PI*.49}/>
  </>;
}
export default memo(function WorldPreview({world,reset,reducedMotion,quality,turn,onUnavailable}:Props){
  const [kit,setKit]=useState<StationKit|undefined>(),[state,setState]=useState<"loading"|"formal"|"local">("loading");
  useEffect(()=>{let active=true;loadStationKit().then(value=>{if(active){setKit(value);setState("formal");}}).catch(()=>{if(active)setState("local");});return()=>{active=false;};},[]);
  if(state==="loading")return <div style={{width:"100%",height:"100%",position:"relative"}}><WorldPlan world={world} floor="concourse"/><span style={{position:"absolute",bottom:20,left:20,fontSize:12,color:"#6d806e"}}>正在载入三维预览…</span></div>;
  return <><Canvas key={quality} frameloop="demand" shadows={quality==="standard"} dpr={quality==="low"?1:[1,1.5]} camera={{fov:43,near:.1,far:700}} gl={{antialias:quality==="standard",toneMapping:ACESFilmicToneMapping,toneMappingExposure:1.02}} fallback={<WorldPlan world={world} floor="concourse"/>} aria-label={`${world.name}的三维地图预览`}>
    <Contents world={world} kit={kit} reset={reset} turn={turn} reducedMotion={reducedMotion} quality={quality} onUnavailable={onUnavailable}/>
  </Canvas>{state==="local"&&<span style={{position:"absolute",bottom:14,left:18,fontSize:11,color:"#6d806e"}}>使用本地模型预览</span>}</>;
});
