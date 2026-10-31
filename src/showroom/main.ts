import "./style.css";
import { ACESFilmicToneMapping, Box3, BoxGeometry, BoxHelper, Color, DirectionalLight, GridHelper, Group, HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PMREMGenerator, Raycaster, Scene, Vector2, Vector3, WebGLRenderer, type Object3D } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadStationKit, type StationKit } from "../ui/scene/stationAssets";
import { createGeneratedPalette, type GeneratedPalette, type SurfaceName } from "../ui/scene/generatedSurfaces";
import { makeMaterials, setFacilityState, setGateProgress, type FacilityState } from "../assets/station-kit";
import { setMetroDoorProgress } from "../assets/metro-train";
import { EXHIBITS, ROOM_VIEWS, SURFACES, type Exhibit, type RoomView, type ViewMode } from "./catalog";
import { assembledRoom, framedPose, exhibitModel, localStationKit, materialStudy, type CameraPose, type MaterialChannel, type ModelHandle } from "./models";

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const params=new URLSearchParams(location.search),viewport=el("viewport"),stage=viewport.closest<HTMLElement>(".stage")!;
let mode:ViewMode=(["room","asset","material"] as const).find(v=>v===params.get("mode"))??"room";
let view:RoomView=ROOM_VIEWS.find(v=>v.id===params.get("view"))?.id??"overview";
let selected=EXHIBITS.find(e=>e.id===params.get("asset"))??EXHIBITS[0],surface:SurfaceName=SURFACES.find(s=>s.id===params.get("surface"))?.id??"stone";
let variant=0,channel:MaterialChannel="lit",picked:Exhibit|undefined,highlight:BoxHelper|undefined;
let kit:StationKit|undefined,palette:GeneratedPalette|undefined,localKit:ReturnType<typeof localStationKit>|undefined;
let room:ReturnType<typeof assembledRoom>|undefined,model:ModelHandle|undefined,formal=false,loading=false,disposed=false;
let renderer:WebGLRenderer|undefined,controls:OrbitControls|undefined,frame:number|undefined,goal:CameraPose|undefined,lastFrame=performance.now();
const scene=new Scene(),camera=new PerspectiveCamera(43,1,.05,700),content=new Group();scene.add(content);scene.background=new Color("#e8e8df");
const stateMaterials=makeMaterials(),raycaster=new Raycaster(),pointer=new Vector2();
const reduced=matchMedia("(prefers-reduced-motion: reduce)");
const studioMaterial=new MeshStandardMaterial({color:"#eeede4",roughness:.96}),studio=new Mesh(new BoxGeometry(1,.1,1),studioMaterial);studio.receiveShadow=true;scene.add(studio);
const grid=new GridHelper(150,50,"#aab5a1","#cbd1c3");grid.visible=false;scene.add(grid);
let environment:ReturnType<PMREMGenerator["fromScene"]>|undefined;

function note(text:string){el("scene-note").textContent=text;}
function invalidate(){if(!disposed&&frame===undefined&&!document.hidden)frame=requestAnimationFrame(render);}
function render(now:number){
  frame=undefined;if(!renderer||!controls||disposed)return;
  const delta=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
  if(goal){
    const eye=new Vector3(...goal.eye),target=new Vector3(...goal.target);
    camera.position.lerp(eye,.17);controls.target.lerp(target,.17);
    if(camera.position.distanceToSquared(eye)+controls.target.distanceToSquared(target)<.0005){camera.position.copy(eye);controls.target.copy(target);goal=undefined;}
  }
  controls.update(delta);highlight?.update();renderer.render(scene,camera);
  if(goal||controls.autoRotate)invalidate();
}
function move(pose:CameraPose,instant=false){
  if(!controls)return;
  if(instant||reduced.matches){goal=undefined;camera.position.set(...pose.eye);controls.target.set(...pose.target);controls.update();}else goal=pose;
  invalidate();
}
function fit(root:Object3D,instant=false){
  root.updateMatrixWorld(true);move(framedPose(new Box3().setFromObject(root),camera.aspect,camera.fov),instant);
}
function clearHighlight(){if(highlight){scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=undefined;}}
function showHighlight(root:Object3D){clearHighlight();root.updateWorldMatrix(true,true);highlight=new BoxHelper(root,"#55856b");scene.add(highlight);invalidate();}
function specs(rows:[string,string][]){el("specifications").innerHTML=rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");}
function updateURL(){const url=new URL(location.href);for(const key of ["mode","view","asset","surface"])url.searchParams.delete(key);if(mode!=="room")url.searchParams.set("mode",mode);if(mode==="room"&&view!=="overview")url.searchParams.set("view",view);if(mode==="asset")url.searchParams.set("asset",selected.id);if(mode==="material")url.searchParams.set("surface",surface);history.replaceState(null,"",url);}
function catalog(){
  const list=el("catalog-list");el("filters").hidden=mode!=="asset";
  if(mode==="room"){
    list.innerHTML=ROOM_VIEWS.map(v=>`<button class="catalog-item" data-view="${v.id}" aria-pressed="${v.id===view}"><span class="item-number">${v.number}</span><span class="item-copy"><strong>${v.label}</strong><small>${v.subtitle}</small></span></button>`).join("");
  }else if(mode==="asset"){
    const query=el<HTMLInputElement>("search").value.toLowerCase().trim(),category=el<HTMLSelectElement>("category").value;
    const filtered=EXHIBITS.filter(e=>(!category||e.category===category)&&(!query||`${e.label} ${e.category} ${e.description}`.toLowerCase().includes(query)));
    list.innerHTML=filtered.length?filtered.map((e,i)=>`<button class="catalog-item asset-item" data-asset="${e.id}" aria-pressed="${e.id===selected.id}"><span class="item-number">${String(i+1).padStart(2,"0")}</span><span class="item-copy"><strong>${esc(e.label)}</strong><small>${esc(e.category)}</small></span></button>`).join(""):'<p class="empty-search">没有找到匹配的资产。<br>试试其他名称或分类。</p>';
  }else list.innerHTML=SURFACES.map(s=>`<button class="catalog-item asset-item" data-surface="${s.id}" aria-pressed="${s.id===surface}"><span class="material-dot" style="--swatch:#${palette?.[s.id].color.getHexString()??"c0c8bb"}"></span><span class="item-copy"><strong>${s.label}</strong></span></button>`).join("");
  el("collection-count").textContent=mode==="room"?"6 个空间视角，完整组合展示":mode==="asset"?`${EXHIBITS.length} 件资产 · 保持原始比例`:`${SURFACES.length} 种表面 · 查看材质表现`;
}
function inspector(){
  const entry=mode==="asset"?selected:picked;
  el("room-options").hidden=mode!=="room";el("roof").parentElement!.hidden=mode==="room"&&view==="platform";
  el("variant-options").hidden=mode!=="asset"||selected.kind!=="detail";
  el("facility-options").hidden=!entry||!(["ticket-machine","security-arch","fare-gate"].includes(entry.id));
  el("motion-options").hidden=!entry||!(entry.id==="fare-gate"||entry.id==="control-door"||(mode==="asset"&&entry.kind==="train"));
  el("motion-title").textContent=entry?.kind==="train"?"车门开合":entry?.id==="control-door"?"出口门开合":"闸门开合";
  el("channel-options").hidden=mode!=="material";el("inspect").hidden=mode!=="room"||!picked;
  if(mode==="material"){
    const s=SURFACES.find(v=>v.id===surface)!,m=palette?.[surface];
    el("info-kicker").textContent="MATERIAL STUDY";el("info-title").textContent=s.label;el("info-description").textContent=s.description;
    specs([["基础色",`#${m?.color.getHexString()??"—"}`],["平铺模数",m?.userData.metres?`${m.userData.metres} m / 块`:"独立表面"],["表现方式",m?.map?"颜色 / 凹凸 / 粗糙度":m?.transparent?"透明 / 反射":"颜色 / 发光"]]);
    for(const b of document.querySelectorAll<HTMLButtonElement>("[data-channel]")){b.disabled=b.dataset.channel==="normal"?!m?.normalMap:b.dataset.channel==="roughness"?!m?.roughnessMap:false;b.setAttribute("aria-pressed",String(b.dataset.channel===channel));}
    el("channel-note").textContent=m?.map?"平面观察铺设尺度，曲面观察光泽和表面细节。":"这类表面通过透明、反射或发光表现，未使用凹凸与粗糙度贴图。";
  }else if(entry){
    el("info-kicker").textContent=entry.category;el("info-title").textContent=entry.label;el("info-description").textContent=entry.description;
    const box=mode==="asset"&&model?new Box3().setFromObject(model.root):undefined,size=box?.getSize(new Vector3());
    const rows:[string,string][]=[["资产类型",entry.category],["显示比例","1 : 1 · 米制"]];
    if(size)rows.push(["长 × 高 × 宽",`${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`]);else rows.push(["查看方式","场景中的组合位置"]);
    rows.push(["表面来源",entry.kind==="kit"&&formal?"正式站厅素材":"项目原创模型与材质"]);specs(rows);
  }else{
    const v=ROOM_VIEWS.find(v=>v.id===view)!;el("info-kicker").textContent="COMPOSED SPACE";el("info-title").textContent=v.label;
    el("info-description").textContent=view==="overview"?"轻透上层地面，同时查看站厅、楼层连接与岛式站台。所有部件保持实际相对位置。":view==="platform"?"移去上层遮挡，查看站台两侧列车、轨道、盲道和候车设施。":v.subtitle+"。拖动镜头，近看构件和表面细节。";
    specs([["样板车站","云桥站 · 双层岛式"],["站厅平面","72 × 36 m"],["楼层关系","站厅 0 m / 站台 −6 m"],["下行选择","石材楼梯 / 自动扶梯"]]);
  }
  document.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.variant)===variant)));
}
function heading(){
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===mode)));
  el("collection-kicker").textContent=mode==="room"?"THE STATION / 01":mode==="asset"?"OBJECT COLLECTION":"SURFACE LIBRARY";
  el("collection-title").textContent=mode==="room"?"一座车站的细节":mode==="asset"?"部件，各有用途":"触得到的表面";
  el("collection-description").textContent=mode==="room"?"从入站到候车，看看这些部件如何组成一个完整空间。":mode==="asset"?"单独查看模型的比例、结构和细节，试试不同组合与状态。":"同一套色彩，通过颗粒、纹路与光泽呈现不同质感。";
  el("stage-kicker").textContent=mode==="room"?"STATION STUDY · 01":mode==="asset"?"OBJECT STUDY / 1:1":"MATERIAL STUDY / PBR";
  el("stage-title").textContent=mode==="room"?`云桥站 · ${ROOM_VIEWS.find(v=>v.id===view)!.label}`:mode==="asset"?selected.label:SURFACES.find(s=>s.id===surface)!.label;
  el("stage-badge").textContent=mode==="room"?"组合样板间":mode==="asset"?"单件资产":"材质试样";
  note(mode==="room"?"同一套资产，放回真实的空间关系。":mode==="asset"?"原始比例 · 可自由旋转查看":"平面看尺度，曲面看光泽。" );
  document.title=`${el("stage-title").textContent} · Agent Go 资产样板间`;
}
function applyFacility(){
  const state=el<HTMLSelectElement>("facility-state").value as FacilityState,opening=Number(el<HTMLInputElement>("opening").value)/100;
  if(mode==="room")room?.devices.forEach(d=>{setFacilityState(d,state,stateMaterials);setGateProgress(d,opening);});
  if(mode==="asset"&&model){if(selected.kind==="kit"){setFacilityState(model.root,state,stateMaterials);setGateProgress(model.root,opening);}else if(selected.kind==="train")setMetroDoorProgress(model.root,opening);else if(selected.id==="control-door")for(const side of [-1,1]){const leaf=model.root.getObjectByName(`door-leaf-${side}`);if(leaf)leaf.position.z=side*(.52+opening*1.04);}}
  el("opening-value").textContent=`${Math.round(opening*100)}%`;invalidate();
}
function display(reset=true){
  clearHighlight();model?.dispose();if(model)content.remove(model.root);model=undefined;
  if(room)room.root.visible=mode==="room";
  if(palette&&kit){
    if(mode==="room"&&room){room.setView(view,el<HTMLInputElement>("roof").checked,el<HTMLInputElement>("labels").checked);studio.scale.set(140,1,100);studio.position.set(36,-7.66,18);if(reset){if(view==="overview"){room.root.updateMatrixWorld(true);move(framedPose(new Box3().setFromObject(room.root),camera.aspect,camera.fov,new Vector3(.6,.85,1.25)));}else move(room.views[view]);}}
    else{
      model=mode==="asset"?exhibitModel(selected,palette,kit,variant):materialStudy(palette,surface,channel);content.add(model.root);
      const box=new Box3().setFromObject(model.root),size=box.getSize(new Vector3());studio.scale.set(Math.max(9,size.x+7),1,Math.max(8,size.z+6));studio.position.set(0,-.17,0);
      if(reset)fit(model.root);
    }
  }
  grid.position.copy(studio.position);grid.position.y+=.057;heading();catalog();inspector();applyFacility();updateURL();invalidate();
}
function cleanupAssets(){clearHighlight();model?.dispose();model=undefined;room?.dispose();room=undefined;content.clear();localKit?.dispose();localKit=undefined;palette?.dispose();palette=undefined;kit=undefined;}
async function loadAssets(){
  if(loading||disposed)return;loading=true;el("retry-kit").hidden=true;el("loading-note").hidden=false;
  let loaded:StationKit|undefined;
  try{loaded=await loadStationKit();formal=true;}catch{formal=false;}
  if(disposed)return;
  cleanupAssets();palette=createGeneratedPalette(loaded);kit=loaded??(localKit=localStationKit(palette));
  try{room=assembledRoom(kit,palette);content.add(room.root);el("asset-status").textContent=formal?"正式材质已载入":"本地模型与备用材质";el("retry-kit").hidden=formal;display();}
  catch(error){showError("部分展品未能布置",error instanceof Error?error.message:"请重试载入素材。");}
  finally{loading=false;el("loading-note").hidden=true;}
}
function showError(title:string,message:string){el("error-note").hidden=false;el("error-title").textContent=title;el("error-description").textContent=message;el("loading-note").hidden=true;}
function resize(){if(!renderer)return;const r=viewport.getBoundingClientRect();if(r.width<1||r.height<1)return;const change=Math.abs(camera.aspect-r.width/r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);if(change>.08&&room)el("reset").click();invalidate();}
function setup(){
  try{
    renderer=new WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label","三维资产展示画面");viewport.appendChild(renderer.domElement);
    const pmrem=new PMREMGenerator(renderer),environmentScene=new RoomEnvironment();environment=pmrem.fromScene(environmentScene,.04);scene.environment=environment.texture;scene.environmentIntensity=.75;environmentScene.dispose();pmrem.dispose();
    scene.add(new HemisphereLight("#fff6df","#819488",1.5));const sun=new DirectionalLight("#fff2d9",2.4);sun.position.set(-12,55,42);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-75;sun.shadow.camera.right=75;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=160;sun.shadow.normalBias=.035;sun.target.position.set(25,-1,15);scene.add(sun,sun.target);
    const fill=new DirectionalLight("#e2edf0",.9);fill.position.set(70,28,-20);scene.add(fill);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=.7;controls.maxDistance=220;controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.5;controls.addEventListener("change",invalidate);controls.listenToKeyEvents(viewport);
    camera.position.set(63,49,88);controls.target.set(33,-1.4,18);controls.update();new ResizeObserver(resize).observe(viewport);resize();
    renderer.domElement.addEventListener("webglcontextlost",event=>{event.preventDefault();showError("三维画面已中断","重新载入页面即可再次打开样板间。资产目录仍可查看。");});
    void loadAssets();
  }catch{showError("暂时无法打开三维展厅","浏览器未能建立图形画面。请开启硬件加速，或换用支持 WebGL 的浏览器后重试。");el("asset-status").textContent="三维画面不可用";}
}

el("category").innerHTML='<option value="">全部分类</option>'+[...new Set(EXHIBITS.map(e=>e.category))].map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode as ViewMode;picked=undefined;display();});
el("catalog-list").onclick=event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button");if(!button)return;
  picked=undefined;
  if(button.dataset.view)view=button.dataset.view as RoomView;
  if(button.dataset.asset){selected=EXHIBITS.find(e=>e.id===button.dataset.asset)!;variant=0;el<HTMLInputElement>("opening").value="0";}
  if(button.dataset.surface){surface=button.dataset.surface as SurfaceName;channel="lit";}
  display();
};
el("search").oninput=catalog;el("category").onchange=catalog;
el("roof").onchange=()=>{room?.setView(view,el<HTMLInputElement>("roof").checked,el<HTMLInputElement>("labels").checked);invalidate();};el("labels").onchange=()=>{room?.setView(view,el<HTMLInputElement>("roof").checked,el<HTMLInputElement>("labels").checked);invalidate();};
document.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach(b=>b.onclick=()=>{variant=Number(b.dataset.variant);display(false);});
document.querySelectorAll<HTMLButtonElement>("[data-channel]").forEach(b=>b.onclick=()=>{channel=b.dataset.channel as MaterialChannel;display(false);});
el("facility-state").onchange=applyFacility;el("opening").oninput=applyFacility;
el("inspect").onclick=()=>{if(picked){selected=picked;mode="asset";picked=undefined;display();}};
el("reset").onclick=()=>{if(mode==="room"&&room){if(view==="overview")move(framedPose(new Box3().setFromObject(room.root),camera.aspect,camera.fov,new Vector3(.6,.85,1.25)));else move(room.views[view]);}else if(model)fit(model.root);};
el("rotate").onclick=()=>{if(!controls)return;controls.autoRotate=!controls.autoRotate;el("rotate").setAttribute("aria-pressed",String(controls.autoRotate));invalidate();};el<HTMLButtonElement>("rotate").disabled=reduced.matches;
reduced.addEventListener("change",()=>{el<HTMLButtonElement>("rotate").disabled=reduced.matches;if(reduced.matches&&controls){controls.autoRotate=false;el("rotate").setAttribute("aria-pressed","false");if(goal)move(goal,true);}invalidate();});
el("capture").onclick=()=>{if(!renderer)return;renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(!blob){note("画面未能保存，请重试。");return;}const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`agent-go-showroom-${mode}-${mode==="room"?view:mode==="asset"?selected.id:surface}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);note("画面已保存。");});};
el("fullscreen").onclick=()=>{const action=document.fullscreenElement?document.exitFullscreen():stage.requestFullscreen();void action.catch(()=>note("当前浏览器未能打开全屏，可放大窗口查看。"));};
el("retry").onclick=()=>location.reload();el("retry-kit").onclick=()=>void loadAssets();
let down=new Vector2();viewport.addEventListener("pointerdown",e=>{down.set(e.clientX,e.clientY);goal=undefined;});
viewport.addEventListener("pointerup",e=>{
  if(mode!=="room"||!room||!renderer||down.distanceTo(new Vector2(e.clientX,e.clientY))>5)return;
  const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  let node:Object3D|null=null;
  for(const hit of raycaster.intersectObject(room.root,true)){
    let visible=true,parent:Object3D|null=hit.object;while(parent){if(!parent.visible){visible=false;break;}parent=parent.parent;}if(!visible)continue;
    parent=hit.object;while(parent&&!parent.userData.exhibit)parent=parent.parent;
    if(parent){node=parent;break;}
    const material=hit.object instanceof Mesh&&!Array.isArray(hit.object.material)?hit.object.material:undefined;
    if(!material?.transparent||material.opacity>.5)break;
  }
  if(node){picked=EXHIBITS.find(a=>a.id===node!.userData.exhibit);if(picked){if(typeof node.userData.variant==="number")variant=node.userData.variant;showHighlight(node);inspector();note(`已选中：${picked.label}。可在右侧单独查看。`);}}
});
viewport.addEventListener("keydown",e=>{if(e.key==="Home"){e.preventDefault();el("reset").click();}});document.addEventListener("visibilitychange",()=>{if(document.hidden&&frame!==undefined){cancelAnimationFrame(frame);frame=undefined;}else invalidate();});
window.addEventListener("pagehide",event=>{if(event.persisted){if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;return;}disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);controls?.dispose();cleanupAssets();environment?.dispose();studio.geometry.dispose();studioMaterial.dispose();grid.geometry.dispose();grid.material.dispose();Object.values(stateMaterials).forEach(m=>m.dispose());renderer?.dispose();});
window.addEventListener("pageshow",event=>{if(event.persisted){lastFrame=performance.now();resize();invalidate();}});
Object.assign(window,{showroomInspect:()=>({mode,view,asset:selected.id,surface,variant,channel,formal,ready:!!palette&&!!room,worldHash:room?.definition.layoutHash,camera:camera.position.toArray(),target:controls?.target.toArray(),catalogue:EXHIBITS.length,materials:SURFACES.length,upperVisible:room?.root.getObjectByName("concourse-exhibit")?.visible,geometry:renderer?.info.memory.geometries,textures:renderer?.info.memory.textures,drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles,bounds:model?{min:new Box3().setFromObject(model.root).min.toArray(),max:new Box3().setFromObject(model.root).max.toArray()}:null})});
heading();catalog();inspector();setup();
