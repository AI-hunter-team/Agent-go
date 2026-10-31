import { Group, Mesh, MeshStandardMaterial, CylinderGeometry, LatheGeometry, SphereGeometry, TorusGeometry, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createBrandSculpture } from "./brandGeometry";
import { LOUNGE, LOUNGE_PORTAL } from "./loungeLayout";
import { SurfaceBuilder,disposeSurfaceGeometry } from "./surfaceGeometry";
import type { GeneratedPalette } from "./generatedSurfaces";
export type ControlAsset="room"|"console"|"wardrobe"|"door"|"passage"|"seat"|"table"|"brand";
/** Original metre-scale assets, using the same project-owned PBR textures as the station. */
export function createControlRoomAsset(kind:ControlAsset,p:GeneratedPalette,cutaway=false):Group{
  if(kind==="brand")return createBrandSculpture(LOUNGE.brandWidth);
  const b=new SurfaceBuilder(),owned:MeshStandardMaterial[]=[];
  /** 创建独立休息室材质，不改变车站共享材质。 */
  const matte=(color:string)=>{const m=new MeshStandardMaterial({color,roughness:.82});owned.push(m);return m;};
  /** 构造柔和圆角的实体软包与家具收口。 */
  const rounded=(m:MeshStandardMaterial,size:[number,number,number],at:[number,number,number],radius=.055)=>{const g=new RoundedBoxGeometry(...size,4,radius);g.translate(...at);b.add(m,g);};
  if(kind==="room"){
    const wall=matte("#eee7dc"),lower=matte("#737866"),floor=matte("#d9d0c2"),seam=matte("#b9b2a6"),yellow=matte("#df9e09");
    wall.map=p.wall.map;wall.normalMap=p.wall.normalMap;wall.normalScale.setScalar(.08);
    floor.map=p.stone.map;floor.roughness=.3;floor.metalness=.06;
    // Keep the camera-side floor edge outside the frame; exhibits retain the architectural footprint.
    b.box(floor,[16,.18,cutaway?6.2:10],[-11,-.09,cutaway?3.4:5.3]);
    b.box(wall,[16,3.2,.18],[-11,1.6,.31]);b.box(wall,[.18,3.2,10],[-19,1.6,5.3]);
    b.box(lower,[16,1.3,.025],[-11,.65,.412]);b.box(seam,[16,.16,.04],[-11,.08,.44]);
    b.box(wall,[.18,3.2,.8],[-2.91,1.6,.8]);b.box(wall,[.18,3.2,5],[-2.91,1.6,5.5]);b.box(wall,[.18,.65,1.8],[-2.91,2.875,2.1]);
    b.box(lower,[.025,1.3,.8],[-3.015,.65,.8]);b.box(lower,[.025,1.3,5],[-3.015,.65,5.5]);
    if(!cutaway)b.box(wall,[16,.12,10],[-11,3.26,5.3]);
    for(const x of [-15,-13,-11,-9,-7,-5])b.box(seam,[.004,.003,10], [x,.009,5.3]);
    for(const z of [2.5,4.5,6.5,8.5])b.box(seam,[16,.003,.004],[-11,.009,z]);
    b.box(yellow,[14.7,.055,.012],[-11.65,1.58,.435]);
    b.bar(yellow,[-4.3,1.58,.435],[-4.05,1.78,.435],.0275);b.box(yellow,[1.05,.055,.012],[-3.525,1.78,.435]);
    // 薄饰线止于外框近侧边缘，既不穿过立柱，也不悬空伸进门洞。
    const stripeStart=.435,stripeEnd=LOUNGE.door[2]-LOUNGE_PORTAL.outerHalfSpan-LOUNGE_PORTAL.outerJambWidth/2;
    b.box(yellow,[.012,.055,stripeEnd-stripeStart],[-3.006,1.78,(stripeStart+stripeEnd)/2]);
    b.box(yellow,[.09,.23,.07],[-6.1,2.4,.45]);
    const globe=new SphereGeometry(.13,32,20);globe.translate(-6.09,2.46,.6);b.add(p.light,globe);
    const downlight=new CylinderGeometry(.055,.055,.012,24);downlight.translate(-5,3.19,1.4);b.add(p.light,downlight);
  }else if(kind==="seat"){
    const fabric=matte("#81806a"),base=matte("#414236");fabric.normalMap=p.wall.normalMap;fabric.normalScale.setScalar(.35);fabric.roughness=.95;
    rounded(base,[2.22,.18,.62],[0,.3,0],.045);
    for(const x of [-.54,.54]){rounded(fabric,[1.06,.26,.58],[x,.48,.03],.12);rounded(fabric,[1.06,.65,.18],[x,.83,-.22],.085);}
    for(const x of [-1.08,1.08])rounded(fabric,[.16,.46,.62],[x,.59,0]);
    for(const x of [-.91,.91])for(const z of [-.18,.18])b.bar(p.dark,[x,.02,z],[x,.26,z],.025);
  }else if(kind==="table"){
    const green=matte("#284b40"),ceramic=matte("#f3f0e4");green.roughness=.3;green.metalness=.15;
    const top=new CylinderGeometry(.3,.3,.045,32);top.translate(0,.7,0);b.add(green,top);
    const stem=new CylinderGeometry(.14,.18,.68,32);stem.translate(0,.34,0);b.add(green,stem);
    const cup=new LatheGeometry([new Vector2(0,0),new Vector2(.047,0),new Vector2(.057,.105),new Vector2(.047,.105),new Vector2(.037,.015),new Vector2(0,.015)],24);cup.translate(0,.723,0);b.add(ceramic,cup);
    const handle=new TorusGeometry(.028,.008,8,16);handle.translate(.061,.78,0);b.add(ceramic,handle);
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
    const trim=matte("#e3a006");trim.roughness=.36;
    const portal=LOUNGE_PORTAL;
    for(const s of [-1,1]){
      b.box(trim,[.22,portal.innerHeaderBottom,portal.innerJambWidth],[0,portal.innerHeaderBottom/2,s*portal.innerHalfSpan]);
      b.box(trim,[.14,portal.outerHeaderBottom,portal.outerJambWidth],[.04,portal.outerHeaderBottom/2,s*portal.outerHalfSpan]);
    }
    b.box(trim,[.22,portal.innerHeaderHeight,portal.innerHalfSpan*2+portal.innerJambWidth],[0,portal.innerHeaderBottom+portal.innerHeaderHeight/2,0]);
    b.box(trim,[.14,portal.outerHeaderHeight,portal.outerHalfSpan*2+portal.outerJambWidth],[.04,portal.outerHeaderBottom+portal.outerHeaderHeight/2,0]);

  }else{
    const passageWall=matte("#837a64"),passageLower=matte("#48503b");
    // Private side branch into the public upper landing, before the timed stairs.
    b.box(p.stone,[5,.18,1.8],[-.5,-.09,2.1]);b.box(passageWall,[5,2.8,.15],[-.5,1.4,1.125]);b.box(passageWall,[1.3,2.8,.15],[-2.4,1.4,3.075]);
    b.box(passageLower,[5,1.3,.03],[-.5,.65,1.215]);b.box(passageLower,[1.3,1.3,.03],[-2.4,.65,2.985]);
    b.box(p.wall,[5,.15,2.1],[-.5,2.875,2.1]);b.box(p.light,[4.8,.035,.045],[-.5,2.72,1.25]);
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
