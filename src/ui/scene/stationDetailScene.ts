import { Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import type { WorldDefinition } from '../../shared/world';
import { propDefinition } from '../../shared/stationProps';
import { createDetailAsset, detailMaterials } from '../../assets/station-detail/models';
import { propGraphic } from '../../assets/station-detail/graphics';
import { generatedTrainDoors } from '../../shared/generatedTrain';
import { SurfaceBuilder, disposeSurfaceGeometry } from './surfaceGeometry';
import type { GeneratedPalette } from './generatedSurfaces';
import type { StationKit } from './stationAssets';
/** The train is present: leave its matching platform screen doors open for boarding. */
export function openScreenDoor(model:Object3D){
 for(const side of [-1,1]){const leaf=model.getObjectByName(`screen_sliding_leaf_${side}`);if(leaf)leaf.position.x+=side*.8;}
}
export function stationDetailScene(d:WorldDefinition,p:GeneratedPalette,kit?:StationKit,standard=true){
 const root=new Group(),upper=new Group(),lower=new Group(),extra=detailMaterials(p),cleanup:(()=>void)[]=[],builders={concourse:new SurfaceBuilder(),platform:new SurfaceBuilder(),leaves:new SurfaceBuilder()};
 root.name='station-detail-scene';upper.name='detail-concourse';lower.name='detail-platform';root.add(upper,lower);
 const add=(id:string,variant:number,at:[number,number,number],yaw:number,floor:'concourse'|'platform',label?:string)=>{
   const source=kit?.models.get('detail-'+id+'-'+variant);const model=source?source.clone(true):createDetailAsset(id,variant,p,extra,true);
   if(id==='screen-door')openScreenDoor(model);
   model.position.set(...at);model.rotation.y=yaw;model.updateMatrixWorld(true);model.traverse(n=>{if(n instanceof Mesh&&n.material instanceof MeshStandardMaterial){
    let parent:Object3D|null=n,leaf=0;while(parent&&parent!==model){if(parent.name.startsWith("screen_sliding_leaf_")){leaf=Number(parent.name.split("_").at(-1));break;}parent=parent.parent;}
    const geometry=n.geometry.clone();
    if(id==="screen-door"&&leaf){const travel=Array.from({length:geometry.getAttribute("position").count},()=>[Math.cos(yaw)*leaf*.8,0,-Math.sin(yaw)*leaf*.8]).flat();geometry.setAttribute("doorTravel",new Float32BufferAttribute(travel,3));builders.leaves.add(n.material,geometry,n.matrixWorld);}
    else builders[floor].add(n.material,geometry,n.matrixWorld);
   }});
   if(!source)disposeSurfaceGeometry(model);
   const graphic=propGraphic(id,variant,d,label);if(graphic){const a=propDefinition(id),panel=graphic.mesh;let y=a.size[1]*.75,w=Math.min(a.size[0]*.85,1.4);
     if(id==='screen-door'){w=.38;y=2.86;}
     if(['lightbox','notice-board','station-map','fare-map','platform-display'].includes(id)){w=a.size[0]-.1;y=a.size[1]/2;}
     panel.scale.set(w,w,1);panel.position.copy(new Vector3(0,y,a.size[2]/2+.015).applyMatrix4(model.matrixWorld));panel.rotation.y=yaw;(floor==='concourse'?upper:lower).add(panel);cleanup.push(graphic.dispose);if(label)panel.userData.label=label;
   }
 };
 for(const a of d.props??[]){
  if(!standard&&["cctv","smoke-detector","speaker","mop-bucket","wet-sign","access-panel","drain"].includes(a.assetId))continue;
  const floor=a.pos.floorId==='platform'?'platform':'concourse';
  add(a.assetId,a.variant,[a.pos.x,(floor==='platform'?-6:0)+a.elevation,a.pos.y],a.yaw,floor);
  if(d.architecture&&propDefinition(a.assetId).mount==='ceiling'){
   const storey=d.floors.find(f=>f.id===floor)!,top=storey.elevation+a.elevation+propDefinition(a.assetId).size[1];
   if(storey.ceiling-top>.025)builders[floor].bar(p.steel,[a.pos.x,top,a.pos.y],[a.pos.x,storey.ceiling-.02,a.pos.y],.012);
  }
 }
 if(d.generatorVersion==='metro-v2'||d.generatorVersion==='metro-v3'){
   const l=d.layout,centre=l.platformAxis!.center,doors=generatedTrainDoors(d);
   for(const direction of [-1,1]){
     const sorted=doors.filter(door=>door.side===direction).map(door=>door.pos.x).filter(x=>x>.8&&x<l.WIDTH-.8).sort((a,b)=>a-b),b=builders.platform,z=centre+direction*6.83;
     let previous=0;
     for(const [i,x]of sorted.entries()){
       if(x-.8>previous)b.box(p.glass,[x-.8-previous,2.7,.02],[(previous+x-.8)/2,-4.65,z]);
       add('screen-door',i%2,[x,-6,z],direction===1?Math.PI:0,'platform',d.generatorVersion==='metro-v3'?doors.find(door=>door.side===direction&&door.pos.x===x)!.id.split('_').slice(-2).join('-'):String(i+1).padStart(2,'0'));add('queue-mark',0,[x,-5.985,z-direction*.85],direction===1?Math.PI:0,'platform');previous=x+.8;
     }
     if(previous<l.WIDTH)b.box(p.glass,[l.WIDTH-previous,2.7,.02],[(previous+l.WIDTH)/2,-4.65,z]);
     b.box(p.steel,[l.WIDTH,.2,.15],[l.WIDTH/2,-3.1,z]);
   }
 }
 const a=builders.concourse.finish('detail-static-concourse'),b=builders.platform.finish('detail-static-platform'),leaves=builders.leaves.finish('screen-door-leaves');upper.add(a);lower.add(b,leaves);a.traverse(n=>{if(n instanceof Mesh)n.castShadow=false;});b.traverse(n=>{if(n instanceof Mesh)n.castShadow=false;});
 const closed=new Map<Mesh,Float32Array>();leaves.traverse(n=>{if(n instanceof Mesh){const pos=n.geometry.getAttribute("position"),travel=n.geometry.getAttribute("doorTravel"),base=new Float32Array(pos.array);for(let i=0;i<pos.count;i++){base[i*3]-=travel.getX(i);base[i*3+2]-=travel.getZ(i);}closed.set(n,base);}});
 return {root,upper,lower,leaves,setDoorProgress(value:number){const progress=Math.max(0,Math.min(1,value));for(const [mesh,base] of closed){const pos=mesh.geometry.getAttribute("position"),travel=mesh.geometry.getAttribute("doorTravel");for(let i=0;i<pos.count;i++)pos.setXYZ(i,base[i*3]+travel.getX(i)*progress,base[i*3+1],base[i*3+2]+travel.getZ(i)*progress);pos.needsUpdate=true;}},dispose(){closed.clear();disposeSurfaceGeometry(leaves);disposeSurfaceGeometry(a);disposeSurfaceGeometry(b);cleanup.forEach(fn=>fn());Object.values(extra).forEach(m=>m.dispose());}};
}
