import { Group, Mesh, MeshStandardMaterial, CylinderGeometry, LatheGeometry, SphereGeometry, TorusGeometry, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createBrandSculpture } from "./brandGeometry";
import { LOUNGE } from "./loungeLayout";
import { SurfaceBuilder,disposeSurfaceGeometry } from "./surfaceGeometry";
import type { GeneratedPalette } from "./generatedSurfaces";
export type ControlAsset="room"|"console"|"wardrobe"|"door"|"passage"|"seat"|"table"|"brand";
/** Original metre-scale assets, using the same project-owned PBR textures as the station. */
export function createControlRoomAsset(kind:ControlAsset,p:GeneratedPalette,cutaway=false):Group{
  if(kind==="brand")return createBrandSculpture(LOUNGE.brandWidth);
  const b=new SurfaceBuilder(),owned:MeshStandardMaterial[]=[];
  const matte=(color:string)=>{const m=new MeshStandardMaterial({color,roughness:.94});owned.push(m);return m;};
  const rounded=(m:MeshStandardMaterial,size:[number,number,number],at:[number,number,number],radius=.055)=>{const g=new RoundedBoxGeometry(...size,2,radius);g.translate(...at);b.add(m,g);};
  if(kind==="room"){
    const wall=matte("#F6F3EA"),lower=matte("#899789"),floor=matte("#e6e3da"),seam=matte("#d4d3cb"),yellow=matte("#FFC600");
    // Keep the camera-side floor edge outside the frame; exhibits retain the architectural footprint.
    b.box(floor,[8.2,.18,cutaway?6.2:7.2],[-7,-.09,cutaway?3.4:3.9]);
    b.box(wall,[8.2,3.2,.18],[-7,1.6,.31]);b.box(wall,[.18,3.2,6.2],[-11.09,1.6,3.4]);
    b.box(lower,[8.1,.95,.025],[-7,.475,.412]);b.box(lower,[.025,.95,6.1],[-10.985,.475,3.4]);
    b.box(wall,[.18,3.2,1.9],[-2.91,1.6,1.35]);b.box(wall,[.18,3.2,1.9],[-2.91,1.6,5.5]);b.box(wall,[.18,.65,2.2],[-2.91,2.875,3.5]);
    for(const z of [1.35,5.5])b.box(lower,[.025,.95,1.88],[-3.015,.475,z]);
    if(!cutaway)b.box(wall,[8.2,.12,6.2],[-7,3.26,3.4]);
    for(const x of [-9,-7,-5])b.box(seam,[.007,.003,6], [x,.002,3.4]);
    for(const z of [2.5,4.5])b.box(seam,[8,.003,.007],[-7,.002,z]);
    b.box(yellow,[7.9,.035,.012],[-7,1.06,.435]);
    b.box(yellow,[.045,.035,1.82],[-3.03,1.06,1.35]);
    b.box(p.steel,[.12,.28,.06],[-5.95,2.15,.44]);
    const globe=new SphereGeometry(.13,16,10);globe.translate(-5.95,2.18,.58);b.add(p.light,globe);
  }else if(kind==="seat"){
    const fabric=matte("#899789"),base=matte("#394a40");
    rounded(base,[2.22,.18,.85],[0,.3,0],.045);
    for(const x of [-.54,.54]){rounded(fabric,[1.04,.19,.77],[x,.5,.03]);rounded(fabric,[1.04,.57,.21],[x,.81,-.32]);}
    for(const x of [-1.08,1.08])rounded(fabric,[.16,.46,.85],[x,.59,0]);
    for(const x of [-.91,.91])for(const z of [-.29,.29])b.bar(p.dark,[x,.02,z],[x,.26,z],.025);
  }else if(kind==="table"){
    const green=matte("#42594b"),ceramic=matte("#f3f0e4");
    const top=new CylinderGeometry(.3,.3,.045,32);top.translate(0,.57,0);b.add(green,top);
    const stem=new CylinderGeometry(.14,.18,.54,24);stem.translate(0,.27,0);b.add(green,stem);
    const cup=new LatheGeometry([new Vector2(0,0),new Vector2(.047,0),new Vector2(.057,.105),new Vector2(.047,.105),new Vector2(.037,.015),new Vector2(0,.015)],24);cup.translate(0,.593,0);b.add(ceramic,cup);
    const handle=new TorusGeometry(.028,.008,8,16);handle.translate(.061,.65,0);b.add(ceramic,handle);
  }else if(kind==="console"){
    b.box(p.jade,[4.5,.84,1.6],[0,.42,0]);b.box(p.rubber,[4.6,.07,1.7],[0,.875,0]);b.box(p.steel,[4.7,.08,1.8],[0,.95,0]);
    b.box(p.glass,[2.7,.025,1.3],[0,1.015,.03]);
    for(const x of [-2,-1.85,-1.7])b.box(p.light,[.08,.025,.08],[x,1.007,.58]);
    b.box(p.rubber,[.85,.025,.26],[1.65,1.01,.55]);
    for(let x=-.3;x<.3;x+=.12)for(let z=-.05;z<.1;z+=.08)b.box(p.steel,[.08,.012,.05],[x+1.65,1.029,z+.55]);
    for(const x of [-2.2,2.2])b.box(p.steel,[.045,.6,1.3],[x,.5,0]);
  }else if(kind==="wardrobe"){
    b.box(p.jade,[1.8,2.4,.65],[0,1.2,0]);
    for(const x of [-.6,0,.6]){b.box(p.paint,[.56,2.26,.04],[x,1.2,.35]);b.bar(p.steel,[x+.17,1.05,.4],[x+.17,1.36,.4],.018);for(let y=1.8;y<2.1;y+=.07)b.box(p.steel,[.34,.014,.012],[x,y,.38]);}
    b.box(p.rubber,[1.84,.1,.72],[0,.05,0]);
  }else if(kind==="door"){
    const trim=matte("#FFC600");
    for(const s of [-1,1]){b.box(trim,[.08,2.55,.12],[0,1.275,s*1.08]);}
    b.box(trim,[.12,.08,2.24],[0,2.58,0]);

  }else{
    // Private side branch into the public upper landing, before the timed stairs.
    b.box(p.sage,[1.3,.18,2.2],[-2.4,-.09,3.5]);b.box(p.wall,[1.3,2.8,.15],[-2.4,1.4,2.325]);b.box(p.wall,[1.3,2.8,.15],[-2.4,1.4,4.675]);
    b.box(p.wall,[1.3,.15,2.5],[-2.4,2.875,3.5]);b.box(p.light,[.8,.03,.2],[-2.4,2.78,3.5]);
    b.box(p.tactile,[1.3,.016,.3],[-2.4,.009,3.5]);
  }
  const root=b.finish(`control-${kind}`);root.userData.assetId=`control-${kind}`;root.userData.ownedMaterials=owned;
  if(kind==="room")root.traverse(node=>{if(node instanceof Mesh)node.castShadow=false;});
  if(kind==="door")for(const side of [-1,1]){const leaf=new SurfaceBuilder();leaf.box(matte("#899789"),[.1,2.5,1.02],[0,1.25,0]);leaf.box(p.glass,[.014,.95,.76],[.06,1.7,0]);leaf.box(p.paint,[.014,.12,.8],[.065,.45,0]);leaf.box(p.light,[.018,.045,.54],[.065,2.31,0]);const panel=leaf.finish(`door-leaf-${side}`);panel.position.z=side*.52;root.add(panel);}
  return root;
}
export function disposeControlAsset(root:Group){disposeSurfaceGeometry(root);root.traverse(node=>{for(const m of node.userData.ownedMaterials??[])m.dispose();});}

export function createControlRoomSuite(p:GeneratedPalette,cutaway=true){
  const root=new Group();root.name="control-room-suite";root.add(createControlRoomAsset("room",p,cutaway),createControlRoomAsset("passage",p));
  for(const [kind,pos] of [["seat",LOUNGE.seat],["table",LOUNGE.table],["brand",LOUNGE.brand],["door",LOUNGE.door]] as const){const model=createControlRoomAsset(kind,p);model.position.set(...pos);root.add(model);}return root;
}
