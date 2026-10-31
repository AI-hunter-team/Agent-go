import { readFileSync } from "node:fs";
import { describe,expect,test,vi } from "vitest";
import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { brandSvg,brandVector } from "../src/assets/brand";
import { createBrandSculpture } from "../src/ui/scene/brandGeometry";
import { createControlRoomAsset,disposeControlAsset } from "../src/ui/scene/controlRoomModels";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { LOUNGE, LOUNGE_PORTAL } from "../src/ui/scene/loungeLayout";
import { ControlRoomState,entranceDock } from "../src/ui/scene/controlRoomLayout";
import { initialFlow,journeyReducer } from "../src/ui/journeyFlow";
import { readDefaultCharacter,saveDefaultCharacter } from "../src/ui/appearancePreferences";
import { generateWorld } from "../src/sim/worldDefinition";

describe("03 identity and lounge",()=>{
 // 从观察侧射线检查黄线：墙面保留，内外门框之间没有悬空黄条。
 test("墙面黄线在外门框收口，不伸进内外门框之间",()=>{
  const palette=createGeneratedPalette(),room=createControlRoomAsset("room",palette);room.updateMatrixWorld(true);
  /** 返回射线命中的导向黄线，而不是后面的墙面。 */
  const stripeHits=(z:number)=>new Raycaster(new Vector3(-4,1.78,z),new Vector3(1,0,0)).intersectObject(room,true).filter(hit=>{
   const material=(hit.object as Mesh).material as import("three").MeshStandardMaterial;return material.color?.getHexString()==="df9e09";
  });
  const outerNear=LOUNGE.door[2]-LOUNGE_PORTAL.outerHalfSpan-LOUNGE_PORTAL.outerJambWidth/2;
  const gap=LOUNGE.door[2]-(LOUNGE_PORTAL.outerHalfSpan+LOUNGE_PORTAL.innerHalfSpan)/2;
  expect(stripeHits((.435+outerNear)/2).length).toBeGreaterThan(0);expect(stripeHits(gap)).toHaveLength(0);
  disposeControlAsset(room);palette.dispose();
 });
 test("all SVG assets and sculpture share the exact vector master, including open counters",()=>{
  for(const kind of ["wordmark","icon"] as const)for(const tone of ["color","mono","inverse"] as const)expect(readFileSync(`public/assets/brand/${kind}-${tone}.svg`,"utf8").trim()).toBe(brandSvg(kind,tone));
  const root=createBrandSculpture(),box=new Box3().setFromObject(root);expect(box.getSize(new Vector3()).z).toBeCloseTo(.024,3);
  const vector=brandVector();expect(vector.shapes.some(s=>s.holes.length>0)).toBe(true);
  root.updateMatrixWorld(true);
  for(const shape of vector.shapes)for(const hole of shape.holes){const x=hole.reduce((sum,p)=>sum+p[0],0)/hole.length,y=hole.reduce((sum,p)=>sum+p[1],0)/hole.length;
   const ray=new Raycaster(new Vector3(x*LOUNGE.brandWidth/vector.width,(vector.height-y)*LOUNGE.brandWidth/vector.width,1),new Vector3(0,0,-1));expect(ray.intersectObject(root,true)).toHaveLength(0);
  }disposeControlAsset(root);
 });
 test("real furniture stays outside the complete departure corridor, not just the start pose",()=>{
  const palette=createGeneratedPalette(),objects=(["seat","table"] as const).map((kind,i)=>{const root=createControlRoomAsset(kind,palette);root.position.set(...(i===0?LOUNGE.seat:LOUNGE.table));root.updateMatrixWorld(true);return root;});
  const boxes=objects.map(o=>new Box3().setFromObject(o)),state=new ControlRoomState(),dock=entranceDock(generateWorld(1));
  for(let frame=0;frame<481;frame++){state.update("launch",1/60,true,false,dock,false);for(const box of boxes){const corridor=new Box3(new Vector3(state.actor.x-.75,0,state.actor.z-.75),new Vector3(state.actor.x+.75,1.8,state.actor.z+.75));expect(box.intersectsBox(corridor)).toBe(false);}}
  objects.forEach(disposeControlAsset);palette.dispose();
 });
 test("disposing lounge assets releases owned materials without disposing borrowed kit materials",()=>{
  const palette=createGeneratedPalette(),borrowed=vi.spyOn(palette.dark,"dispose"),root=createControlRoomAsset("seat",palette),owned=root.userData.ownedMaterials.map((m:Mesh["material"])=>vi.spyOn(m as import("three").Material,"dispose"));
  disposeControlAsset(root);for(const spy of owned)expect(spy).toHaveBeenCalledTimes(1);expect(borrowed).not.toHaveBeenCalled();palette.dispose();
 });
 test("appearance entry works without a world while launch remains gated",()=>{
  const state=journeyReducer(initialFlow,{type:"navigate",stage:"character",characterEntry:"lobby"});expect(state.stage).toBe("character");expect(state.createdWorld).toBeNull();
  expect(journeyReducer(state,{type:"navigate",stage:"launch"}).stage).toBe("world");expect(journeyReducer(state,{type:"navigate",stage:"lobby"}).stage).toBe("lobby");
 });
 test("default appearance rejects corrupt values and storage failure is recoverable",()=>{
  vi.stubGlobal("localStorage",{getItem:()=>"bad",setItem:()=>{throw Error("blocked");}});expect(readDefaultCharacter()).toBe("dafeiyu");expect(saveDefaultCharacter("naiwa")).toBe(false);
  vi.stubGlobal("localStorage",{getItem:()=>"naiwa",setItem:vi.fn()});expect(readDefaultCharacter()).toBe("naiwa");expect(saveDefaultCharacter("dafeiyu")).toBe(true);vi.unstubAllGlobals();
  vi.stubGlobal("localStorage",{getItem:()=>"doubao",setItem:vi.fn()});expect(readDefaultCharacter()).toBe("doubao");vi.unstubAllGlobals();
 });
});
