import { serviceBankSigns,stationNamePositions } from "../ui/scene/stationWayfinding";
import { propDebug } from "./propDebug";
import { STATION_PROPS } from "../shared/stationProps";
import { createDetailAsset, detailMaterials } from "../assets/station-detail/models";
import { propGraphic } from "../assets/station-detail/graphics";
import { stationDetailScene } from "../ui/scene/stationDetailScene";
import { previewWorldVersion } from "../ui/worldVersion";
import { createStationV2Architecture } from "../ui/scene/stationV2Architecture";
import { Box3, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, Vector3, type Object3D } from "three";
import { createControlRoomAsset, createControlRoomSuite, disposeControlAsset, type ControlAsset } from "../ui/scene/controlRoomModels";
import { ASSETS, createAsset, makeMaterials } from "../assets/station-kit";
import { createMetroRailingAsset, makeRailingMaterials, METRO_RAILING_ASSETS } from "../assets/metro-railings";
import { batchMetroCar, createMetroCar, type MetroCarKind } from "../assets/metro-train";
import { generateWorld } from "../sim/worldDefinition";
import type { WorldDefinition } from "../shared/world";
import { batchStation, disposeBatches, type StationKit } from "../ui/scene/stationAssets";
import { devicePosition } from "../ui/scene/stationLayout";
import { generatedStationPlacements } from "../ui/scene/generatedPlacements";
import { createEntrancePassage, createGeneratedPlatform, stairFlight, texturedMetroMaterials } from "../ui/scene/generatedArchitecture";
import { createGeneratedProp } from "../ui/scene/generatedProps";
import { disposeSurfaceGeometry, SurfaceBuilder, type XYZ } from "../ui/scene/surfaceGeometry";
import type { GeneratedPalette, SurfaceName } from "../ui/scene/generatedSurfaces";
import type { Exhibit, RoomView } from "./catalog";

export interface ModelHandle { root: Group; dispose(): void; }
export interface CameraPose { eye: XYZ; target: XYZ; }
/** Fit every bounding-box corner; works for wide train cars and narrow screens alike. */
export function framedPose(bounds:Box3,aspect:number,fov=43,direction=new Vector3(1.1,.7,1.6)):CameraPose{
  const centre=bounds.getCenter(new Vector3()),forward=direction.clone().normalize(),right=new Vector3().crossVectors(new Vector3(0,1,0),forward).normalize(),up=new Vector3().crossVectors(forward,right).normalize();
  const tangent=Math.tan(fov*Math.PI/360);let distance=1;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const offset=new Vector3(x,y,z).sub(centre),depth=offset.dot(forward);
    distance=Math.max(distance,depth+Math.abs(offset.dot(up))/tangent,depth+Math.abs(offset.dot(right))/(tangent*Math.max(.1,aspect)));
  }
  return {eye:centre.clone().addScaledVector(forward,distance*1.15+1).toArray(),target:centre.toArray()};
}
export type MaterialChannel = "lit" | "normal" | "roughness";
const tag = (root: Object3D, id: string) => { root.userData.exhibit=id; return root; };

/** A local fallback uses the same source models, with the generated PBR maps. */
export function localStationKit(p: GeneratedPalette): StationKit & { dispose():void } {
  const m=makeMaterials(),rails=makeRailingMaterials();
  for(const [key,mat] of Object.entries(m)){
    const source=key==="plaster"?p.wall:key==="terrazzo"?p.stone:key==="sage"?p.sage:key==="steel"?p.steel:key==="ink"?p.rubber:p.paint;
    if(!mat.transparent&&!mat.name.includes("status")&&!mat.name.includes("screen")&&!mat.name.includes("light")){mat.map=source.map;mat.normalMap=source.normalMap;mat.roughnessMap=source.roughnessMap;}
  }
  rails.steel.map=p.steel.map;rails.steel.normalMap=p.steel.normalMap;rails.steel.roughnessMap=p.steel.roughnessMap;
  const models=new Map<string,Group>(ASSETS.map(a=>[a.id,createAsset(a.id,m)]));
  for(const a of METRO_RAILING_ASSETS)models.set(a.id,createMetroRailingAsset(a.id,rails));
  const owned=[...Object.values(m),...Object.values(rails)];
  return {models,materials:new Map(owned.map(mat=>[mat.name,mat])),dispose(){const geometries=new Set<Mesh["geometry"]>();models.forEach(root=>root.traverse(n=>{if(n instanceof Mesh)geometries.add(n.geometry);}));geometries.forEach(g=>g.dispose());owned.forEach(mat=>mat.dispose());}};
}

export function exhibitModel(entry: Exhibit, p: GeneratedPalette, kit: StationKit, variant=0): ModelHandle {
  let root:Group,dispose:()=>void;
  if(entry.kind==='prop'){
    const extra=detailMaterials(p);root=kit.models.get('detail-'+entry.ref+'-'+variant)?.clone(true)??createDetailAsset(entry.ref,variant,p,extra);
    const graphic=propGraphic(entry.ref,variant);if(graphic){const a=STATION_PROPS.find(a=>a.id===entry.ref)!;graphic.mesh.scale.setScalar(Math.min(1.4,a.size[0]*.85));graphic.mesh.position.set(0,a.size[1]*.75,a.size[2]/2+.02);root.add(graphic.mesh);}
    const debug=propDebug(entry.ref);root.add(debug.root);const borrowed=!!kit.models.get('detail-'+entry.ref+'-'+variant);dispose=()=>{debug.root.removeFromParent();debug.dispose();if(!borrowed)disposeSurfaceGeometry(root);graphic?.dispose();Object.values(extra).forEach(m=>m.dispose());};
  }else if(entry.kind==='cluster'){
    const d=generateWorld(1),sets:Record<string,[string,number,number,number][]>={
 entrance:[['station-map',-1.8,0,1],[variant?'fare-map':'notice-board',0,0,1],[variant?'bin-double':'bin-slim',1.8,.5,0],[variant?'plant-square':'plant-round',-2,.9,0]],
 convenience:[['vending',-1.7,0,0],['charging',-.7,0,0],[variant?'flower-cabinet':'locker',.6,0,0],['bin-double',2,.2,0]],
 rest:[[variant?'bench-sage':'bench-metal',0,0,0],[variant?'plant-square':'plant-round',-1.9,0,0],['plant-box',1.9,0,0],['lightbox',0,-.7,1.2]],
 security:[['security-table',0,0,0],['staff-chair',-1.2,0,0],[variant?'barrier-store':'storage-cabinet',1.5,0,0]],
 platform:[['screen-door',-1.6,-1.2,0],['screen-door',0,-1.2,0],['screen-door',1.6,-1.2,0],['queue-mark',0,-.2,.01],['platform-display',0,-1.2,2.8],[variant?'bench-sage':'bench-metal',0,1,0]],
 maintenance:[['equipment-door',0,-.5,0],[variant?'aed':'fire-cabinet',-1.3,-.5,.7],[variant?'barrier-store':'cleaning-cart',1.5,.4,0],['mop-bucket',2.2,.4,0],['wet-sign',2.5,-.3,0]]};
    const props=sets[entry.ref].map(([assetId,x,y,elevation],i)=>({id:'sample-'+i,assetId,variant,pos:{x,y,floorId:'concourse' as const},yaw:0,elevation,cluster:'rest' as const,body:null,useSpace:null}));
    const scene=stationDetailScene({...d,generatorVersion:'metro-v1',props},p,kit);root=scene.root;const b=new SurfaceBuilder();b.box(p.stone,[6,.1,4],[0,-.05,.5]);b.box(p.wall,[6,3.5,.15],[0,1.75,-.9]);const architecture=b.finish('sample-architecture');root.add(architecture);dispose=()=>{scene.dispose();disposeSurfaceGeometry(architecture);};
  }else if(entry.kind==="control"){
    root=entry.ref==="suite"?createControlRoomSuite(p):createControlRoomAsset(entry.ref as ControlAsset,p,true);dispose=()=>disposeControlAsset(root);
  }else if(entry.kind==="kit"){
    const source=kit.models.get(entry.ref);if(!source)throw new Error(`未找到素材：${entry.label}`);
    root=source.clone(true);dispose=()=>{}; // Shared geometry/materials belong to the kit loader.
  }else if(entry.kind==="train"){
    const materials=texturedMetroMaterials(p);root=batchMetroCar(createMetroCar(entry.ref as MetroCarKind,materials));
    dispose=()=>{disposeSurfaceGeometry(root);Object.values(materials).forEach(m=>m.dispose());};
  }else{
    if(entry.kind==="stairs"||entry.kind==="escalator")root=stairFlight(p,12,6,2.4,36,entry.kind==="escalator");
    else if(entry.kind==="entrance")root=createEntrancePassage(generateWorld(1).entrances![0],p,true);
    else root=createGeneratedProp({family:entry.family!,variant},p);
    dispose=()=>disposeSurfaceGeometry(root);
  }
  root.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(root),centre=bounds.getCenter(new Vector3());
  root.position.x-=centre.x;root.position.z-=centre.z;root.position.y-=bounds.min.y;
  tag(root,entry.id);root.updateMatrixWorld(true);return {root,dispose};
}

export function materialStudy(p:GeneratedPalette,key:SurfaceName,channel:MaterialChannel):ModelHandle{
  const source=p[key],map=channel==="normal"?source.normalMap:source.roughnessMap;
  const diagnostic=channel!=="lit"&&map?new MeshBasicMaterial({map,toneMapped:false}):undefined;
  const material=diagnostic??source,b=new SurfaceBuilder();
  // Boxes use the same metre projection; spheres make roughness and metal response legible.
  if(material instanceof MeshStandardMaterial){
    b.box(material,[3,.16,2.3],[0,.08,0]);b.box(material,[3,2.5,.12],[0,1.4,-1.08]);
    const sphere=new SphereGeometry(.62,40,24);sphere.translate(.55,.78,.15);b.add(material,sphere);
    const root=b.finish(`material-${key}`);return {root,dispose:()=>disposeSurfaceGeometry(root)};
  }
  const lit=materialStudy(p,key,"lit");lit.root.traverse(n=>{if(n instanceof Mesh)n.material=material;});
  return {root:lit.root,dispose:()=>{lit.dispose();diagnostic?.dispose();}};
}

function roomSign(text:string,position:XYZ,width=4,yaw=0){
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=160;
  const ctx=canvas.getContext("2d")!;ctx.fillStyle="#263d36";ctx.fillRect(0,0,1024,160);ctx.fillStyle="#faf6e8";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font='500 58px "Microsoft YaHei",sans-serif';const measured=ctx.measureText(text).width;if(measured>950)ctx.font=`500 ${58*950/measured}px "Microsoft YaHei",sans-serif`;ctx.fillText(text,512,80);
  const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;
  const material=new MeshBasicMaterial({map,side:DoubleSide,toneMapped:false}),mesh=new Mesh(new PlaneGeometry(width,width*160/1024),material);
  mesh.position.set(...position);mesh.rotation.y=yaw;
  return {mesh,dispose:()=>{mesh.geometry.dispose();material.dispose();map.dispose();}};
}

export function assembledRoom(kit:StationKit,p:GeneratedPalette,d:WorldDefinition=generateWorld(1,{version:previewWorldVersion()}),standard=true){
  if(d.architecture){
    const model=createStationV2Architecture(d,p,standard),devices:Group[]=[],owned:Group[]=[],signs:ReturnType<typeof roomSign>[]=[];
    for(const f of d.layout.FACILITIES){const device=kit.models.get(f.kind==="tvm"?"ticket-machine":f.kind==="security"?"security-arch":"fare-gate")!.clone(true);device.position.set(...devicePosition(f.kind,f.pos.x,f.pos.y,f.queueDirection));device.rotation.y=Math.atan2(f.queueDirection?.x??-1,f.queueDirection?.y??0);model.root.add(device);devices.push(device);}
    for(const detail of d.details){const root=createGeneratedProp(detail,p);root.position.set(detail.pos.x,detail.pos.floorId==="platform"?-6:0,detail.pos.y);model.root.add(root);owned.push(root);}
    const addSign=(text:string,position:XYZ,width:number,yaw=0)=>{const s=roomSign(text,position,width,yaw);signs.push(s);model.root.add(s.mesh);};
    for(const s of serviceBankSigns(d))addSign(s.text,[s.x,2.8,15],4,s.west?-Math.PI/2:Math.PI/2);
    for(const c of d.connectors!)addSign(`${c.groupId} ${c.kind==="stairs"?"楼梯":"扶梯"} ↓ 站台`,[c.from.x,2.7,c.from.y],2.8,c.to.x>c.from.x?-Math.PI/2:Math.PI/2);
    for(const x of stationNamePositions(d))for(const side of [-1,1])addSign("青禾站 / QINGHE",[x,-3.27,15+side*6.65],4,side>0?Math.PI:0);
    const detailScene=d.props?stationDetailScene(d,p,kit,standard):null;
    if(detailScene)model.root.add(detailScene.root);
    const view=(id:string)=>{const v=d.architecture!.views.find(v=>v.id===id)!;return {eye:v.eye,target:v.target};};
    const views:Record<RoomView,CameraPose>={overview:{eye:[d.layout.WIDTH*.86,Math.max(45,d.layout.WIDTH*.6),65],target:[d.layout.WIDTH/2,-2,15]},hall:view("gate"),entrance:view("gate"),connections:view("descent"),platform:view("platform"),services:view("gate")};
    return {root:model.root,definition:d,devices,views,setView(mode:RoomView,showRoof:boolean,_labels:boolean){model.ceiling.visible=mode!=="overview"||showRoof;model.deck.visible=mode!=="overview";},dispose(){if(detailScene){model.root.remove(detailScene.root);detailScene.dispose();}devices.forEach(device=>model.root.remove(device));signs.forEach(s=>{model.root.remove(s.mesh);s.dispose();});owned.forEach(root=>{model.root.remove(root);disposeSurfaceGeometry(root);});model.dispose();}};
  }
  const l=d.layout,root=new Group(),upper=new Group(),lower=new Group(),connections=new Group(),roof=new Group();
  root.name="assembled-station-showroom";upper.name="concourse-exhibit";lower.name="platform-exhibit";connections.name="connection-exhibit";
  root.add(upper,lower,connections);upper.add(roof);
  const cleanup:(()=>void)[]=[],signs:Mesh[]=[],devices:Group[]=[],floorMaterials:MeshStandardMaterial[]=[];
  const placements=generatedStationPlacements(d,false),floors=batchStation(kit,placements.filter(v=>v.id.startsWith("floor")));
  const clones=new Map<MeshStandardMaterial,MeshStandardMaterial>();
  floors.traverse(n=>{if(n instanceof Mesh&&n.material instanceof MeshStandardMaterial){let m=clones.get(n.material);if(!m){m=n.material.clone();clones.set(n.material,m);floorMaterials.push(m);}n.material=m;}});
  const frontFace=(v:typeof placements[number])=>v.position[2]>=l.HEIGHT-.01&&(v.id==="wall-straight"||v.id==="ceiling-fascia");
  const front=batchStation(kit,placements.filter(frontFace));
  const structure=batchStation(kit,placements.filter(v=>!v.id.startsWith("floor")&&v.id!=="ceiling-panel"&&!frontFace(v))),ceiling=batchStation(kit,placements.filter(v=>v.id==="ceiling-panel"));
  upper.add(floors,structure,front);roof.add(ceiling);
  cleanup.push(()=>{for(const batch of [floors,structure,front,ceiling])disposeBatches(batch);floorMaterials.forEach(m=>m.dispose());});
  const own=(model:Group,parent:Object3D,exhibit:string)=>{tag(model,exhibit);parent.add(model);cleanup.push(()=>disposeSurfaceGeometry(model));return model;};
  const sign=(text:string,position:XYZ,parent:Object3D,width=4,yaw=0)=>{const s=roomSign(text,position,width,yaw);parent.add(s.mesh);signs.push(s.mesh);cleanup.push(s.dispose);};
  for(const f of l.FACILITIES){
    const key=f.kind==="tvm"?"ticket-machine":f.kind==="security"?"security-arch":"fare-gate",device=kit.models.get(key)!.clone(true);
    device.position.set(...devicePosition(f.kind,f.pos.x,f.pos.y,f.queueDirection));device.rotation.y=Math.atan2(f.queueDirection?.x??-1,f.queueDirection?.y??0);device.name=f.id;tag(device,key);upper.add(device);devices.push(device);
  }
  for(const detail of d.details){
    const prop=own(createGeneratedProp(detail,p),detail.pos.floorId==="platform"?lower:upper,`detail-${detail.family}`);
    prop.position.set(detail.pos.x,detail.pos.floorId==="platform"?-6:0,detail.pos.y);prop.rotation.y=detail.yaw??0;
    if(["entrance","tickets","gates","commercial","maintenance"].includes(detail.family))sign(detail.label,[detail.pos.x,2.65,detail.pos.y+.2],upper,2.8,detail.yaw??0);
  }
  for(const a of l.ATTRACTIONS.filter(a=>a.body)){
    const family=a.kind==="seating"?"platform":"commercial",prop=own(createGeneratedProp({family,variant:1},p),upper,`detail-${family}`);
    prop.position.set(a.pos.x,0,a.pos.y);if(a.body!.h>a.body!.w)prop.rotation.y=Math.PI/2;
  }
  const room=d.details.find(v=>v.family==="maintenance")!.body!,roomBuilder=new SurfaceBuilder();
  roomBuilder.box(p.wall,[room.w,6,room.h],[room.x+room.w/2,3,room.y+room.h/2]);upper.add(roomBuilder.finish("equipment-room"));cleanup.push(()=>disposeSurfaceGeometry(upper.getObjectByName("equipment-room")!));
  const details=stationDetailScene(d,p,kit);upper.add(details.upper);lower.add(details.lower);cleanup.push(details.dispose);
  const platform=createGeneratedPlatform(d,p,true);tag(platform.root.getObjectByName("generated-metro-trains")!,"metro-head");lower.add(platform.root);cleanup.push(platform.dispose);
  for(const escalator of [false,true]){
    const top=escalator?l.ESCALATOR_TOP:l.STAIRS_TOP,bottom=escalator?l.ESCALATOR_BOTTOM:l.STAIRS_BOTTOM;
    const model=own(stairFlight(p,Math.hypot(bottom.x-top.x,bottom.y-top.y),6,2.4,36,escalator),connections,escalator?"escalator":"stairs");
    model.position.set(top.x,0,top.y);model.rotation.y=-Math.atan2(bottom.y-top.y,bottom.x-top.x);
    sign(escalator?"扶梯 ↓ 站台":"楼梯 ↓ 站台",[top.x-1,2.7,top.y],connections,3,Math.PI/2);
  }
  for(const e of d.entrances!){
    const entry=own(createEntrancePassage(e,p,true),upper,"entrance-passage");entry.position.set(e.top.x,0,e.top.y);entry.rotation.y=-Math.atan2(e.inward.y,e.inward.x);
    sign(`${e.id}口 / 进站 ↓`,[e.top.x,6.3,e.top.y],upper,3,Math.PI/2);
  }
  sign("01  售票与安检 →",[13,3.2,l.HEIGHT/2],upper,4.5,Math.PI/2);sign("02  检票进站 →",[28,3.2,l.HEIGHT/2],upper,4.5,Math.PI/2);
  sign(`${d.name} / 1号站台 ← → 2号站台`,[l.WIDTH/2,-3.7,l.HEIGHT/2],lower,7);
  const views:Record<RoomView,CameraPose>={
    overview:{eye:[l.WIDTH*.88,49,l.HEIGHT+52],target:[l.WIDTH*.46,-1.4,l.HEIGHT/2]},
    hall:{eye:[21,17,l.HEIGHT+7],target:[24,0,l.HEIGHT*.42]},
    entrance:{eye:[d.entrances![0].top.x-6,10,d.entrances![0].top.y+10],target:[d.entrances![0].top.x+3,2,d.entrances![0].top.y]},
    connections:{eye:[l.STAIRS_TOP.x+20,12,l.STAIRS_TOP.y+25],target:[l.STAIRS_TOP.x+5,-1.4,(l.STAIRS_TOP.y+l.ESCALATOR_TOP.y)/2]},
    platform:{eye:[l.WIDTH/2+20,6,l.HEIGHT/2+28],target:[l.WIDTH/2,-4.5,l.HEIGHT/2]},
    services:{eye:[16,7,12],target:[23,1.1,2]},
  };
  if(typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("study")==="reference"){
    views.hall={eye:[17,1.65,12],target:[27,1.4,15]};views.connections={eye:[24,1.65,14],target:[34,-.8,13]};views.platform={eye:[12,-4.35,22.5],target:[58,-4.45,23.5]};
  }
  return {root,definition:d,devices,views,setView(view:RoomView,showRoof:boolean,labels:boolean){
    upper.visible=view!=="platform";roof.visible=showRoof;connections.visible=true;front.visible=view!=="overview"&&view!=="connections";
    const ghost=view==="overview"||view==="connections";
    floorMaterials.forEach(m=>{const transparent=ghost;m.opacity=ghost?.15:1;m.depthWrite=!ghost;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}});
    signs.forEach(s=>s.visible=labels&&(view!=="platform"||s.position.y<0));
  },dispose(){cleanup.forEach(fn=>fn());root.clear();}};
}
