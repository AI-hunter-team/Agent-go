import { describe, expect, test } from "vitest";
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { surfacePixels, type SurfaceKind } from "../src/assets/world-surfaces";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { createEntrancePassage, createGeneratedPlatform, generatedTrainLayout, stairFlight } from "../src/ui/scene/generatedArchitecture";
import { createGeneratedProp } from "../src/ui/scene/generatedProps";
import { disposeSurfaceGeometry, metreUV } from "../src/ui/scene/surfaceGeometry";
import { generateWorld } from "../src/sim/worldDefinition";
import { METRO_PROFILE } from "../src/shared/metro";

const extent = (root: Group) => new Box3().setFromObject(root);
describe("generated station original art", () => {
  test.each<SurfaceKind>(["stone", "plaster", "steel", "concrete", "rubber", "tactile", "paint", "ribbed"])("%s has reproducible, non-flat PBR channels", kind => {
    const first=surfacePixels(kind,64),second=surfacePixels(kind,64);
    expect(first.color).toEqual(second.color); expect(first.normal).toEqual(second.normal);
    expect(new Set(first.color).size).toBeGreaterThan(4); expect(new Set(first.normal).size).toBeGreaterThan(4);
    expect(first.metres).toBeGreaterThan(0); expect(first.color.length).toBe(64*64*4);
    for(let i=3;i<first.color.length;i+=4)expect(first.color[i]).toBe(255);
  });
  test("texture UV density follows metres rather than box stretch", () => {
    for(const length of [2,12,72]){
      const geometry=metreUV(new BoxGeometry(length,.1,2),1.2),uv=geometry.getAttribute("uv");
      const values=Array.from({length:uv.count},(_,i)=>uv.getX(i));
      expect(Math.max(...values)-Math.min(...values)).toBeCloseTo(length/1.2,4);geometry.dispose();
    }
  });
  test.each([48,54,66,72,78])("%sm platform fits unscaled cars with level thresholds and correct rail height", length => {
    const layout=generatedTrainLayout(length); expect(layout.scale).toEqual([1,1,1]);
    expect(layout.count).toBe(length>=72?3:2);
    expect(layout.centres[0]-11.65).toBeGreaterThan(0);expect(layout.centres.at(-1)!+11.65).toBeLessThan(length);
    expect(layout.railTop+1.1).toBe(0);expect(layout.trackCentre - METRO_PROFILE.exteriorHalfWidth - 7).toBeCloseTo(METRO_PROFILE.platformGap);
    expect(layout.trackCentre + METRO_PROFILE.exteriorHalfWidth).toBeLessThan(11.1);
  });
  test.each([false,true])("floor connector has closed geometry, maps and exact endpoints (escalator=%s)", escalator => {
    const p=createGeneratedPalette(),root=stairFlight(p,12,6,2.4,36,escalator),bounds=extent(root);
    expect(root.userData.lower).toEqual([12,-6,0]);expect(root.userData.rise).toBeCloseTo(1/6);
    expect(bounds.min.y).toBeCloseTo(-6.26,4);expect(bounds.max.y).toBeGreaterThan(.9);
    root.traverse(node=>{if(node instanceof Mesh){expect(node.geometry.getAttribute("uv").count).toBeGreaterThan(0);const material=node.material as MeshStandardMaterial;if(!material.transparent)expect(material.map).not.toBeNull();}});
    disposeSurfaceGeometry(root);p.dispose();
  });
  test("all eight detail combinations contain textured modelling, two variants and no orphan source geometry",()=>{
    const p=createGeneratedPalette();
    for(const family of ["entrance","tickets","security","gates","connections","platform","commercial","maintenance"] as const)for(const variant of [0,1]){
      const root=createGeneratedProp({family,variant},p);expect(root.children.length).toBeGreaterThan(0);
      root.traverse(node=>{if(node instanceof Mesh){const pos=node.geometry.getAttribute("position");expect([...pos.array].every(Number.isFinite)).toBe(true);}});
      expect(root.children.some(node=>node instanceof Mesh&&(node.material as MeshStandardMaterial).map)).toBe(true);disposeSurfaceGeometry(root);
    }p.dispose();
  });
  test("all three layouts bake detailed trains and entrance stairs without changing the immutable map",()=>{
    const p=createGeneratedPalette();
    for(const seed of [1,2,4]){
      const d=generateWorld(seed),before=JSON.stringify(d),asset=createGeneratedPlatform(d,p),trains=asset.root.getObjectByName("generated-metro-trains")!;
      expect(trains.children.length).toBeLessThanOrEqual(14);expect(trains.userData.passengerFloor).toBe(0);
      const mesh=trains.getObjectByName("generated-metro-trains/metro.shell.silver") as Mesh;
      expect((mesh.material as MeshStandardMaterial).map).not.toBeNull();expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(5000);
      for(const e of d.entrances!){const entry=createEntrancePassage(e,p,false);expect(entry.userData.lower).toEqual([6,-4,0]);expect(entry.getObjectByName("detailed-stairs")).toBeDefined();disposeSurfaceGeometry(entry);}
      expect(JSON.stringify(d)).toBe(before);asset.dispose();
    }p.dispose();
  });
});
