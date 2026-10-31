import { afterEach, describe, expect, test, vi } from "vitest";
import { Box3, Mesh, PerspectiveCamera, Vector3 } from "three";
import { EXHIBITS, SURFACES } from "../src/showroom/catalog";
import { assembledRoom, exhibitModel, framedPose, localStationKit, materialStudy } from "../src/showroom/models";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { generatedStationPlacements } from "../src/ui/scene/generatedPlacements";
import { createGeneratedPlatform } from "../src/ui/scene/generatedArchitecture";
import { generateWorld } from "../src/sim/worldDefinition";

afterEach(()=>vi.unstubAllGlobals());
describe("standalone asset showroom",()=>{
  test("every catalogue entry builds finite, non-empty geometry using the same project assets",()=>{
    const p=createGeneratedPalette(),kit=localStationKit(p);
    expect(new Set(EXHIBITS.map(e=>e.id)).size).toBe(EXHIBITS.length);
    for(const entry of EXHIBITS){
      const model=exhibitModel(entry,p,kit),box=new Box3().setFromObject(model.root),size=box.getSize(new Vector3());
      expect(box.isEmpty(),entry.id).toBe(false);expect([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite),entry.id).toBe(true);
      expect(box.min.y,entry.id).toBeCloseTo(0,4);expect(size.length(),entry.id).toBeGreaterThan(.01);expect(model.root.scale.toArray()).toEqual([1,1,1]);model.dispose();
    }
    for(const surface of SURFACES)for(const channel of ["lit","normal","roughness"] as const){const study=materialStudy(p,surface.id,channel);expect(new Box3().setFromObject(study.root).isEmpty()).toBe(false);study.dispose();}
    kit.dispose();p.dispose();
  });
  test("shared floor pieces keep every staircase opening clear in all layout rules",()=>{
    for(const seed of [1,2,4]){
      const d=generateWorld(seed),before=JSON.stringify(d),placements=generatedStationPlacements(d,true);
      for(const piece of placements){expect([...piece.position,...piece.scale].every(Number.isFinite)).toBe(true);expect(piece.scale.every(s=>s>0)).toBe(true);}
      for(const piece of placements.filter(p=>p.id.startsWith("floor")))for(const hole of d.layout.openings!){
        const w=piece.scale[0]*3,h=piece.scale[2]*3,x=piece.position[0]-w/2,z=piece.position[2]-h/2;
        const overlap=Math.max(0,Math.min(x+w,hole.x+hole.w)-Math.max(x,hole.x))*Math.max(0,Math.min(z+h,hole.y+hole.h)-Math.max(z,hole.y));
        expect(overlap).toBeLessThan(.000001);
      }expect(JSON.stringify(d)).toBe(before);
    }
  });
  test("automatic framing contains every corner of long or tall assets on narrow and wide screens",()=>{
    for(const [min,max] of [[[0,0,0],[23.2,4.6,3.1]],[[-6,-6,-2],[6,1,2]],[[0,0,0],[.16,1.1,.16]]])for(const aspect of [.45,1.4,2.4]){
      const box=new Box3(new Vector3(...min),new Vector3(...max)),pose=framedPose(box,aspect),camera=new PerspectiveCamera(43,aspect,.05,700);
      camera.position.set(...pose.eye);camera.lookAt(new Vector3(...pose.target));camera.updateMatrixWorld();
      for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){const clip=new Vector3(x,y,z).project(camera);expect(Math.abs(clip.x)).toBeLessThan(.96);expect(Math.abs(clip.y)).toBeLessThan(.96);expect(clip.z).toBeLessThan(1);}
    }
  });
  test("assembled room keeps floors and borrowed assets intact through view changes and teardown",()=>{
    vi.stubGlobal("document",{createElement:()=>({width:0,height:0,getContext:()=>({fillStyle:"",font:"",textAlign:"",textBaseline:"",fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){},strokeRect(){},measureText:()=>({width:700})})})});
    const p=createGeneratedPalette(),kit=localStationKit(p),source=kit.models.get("ticket-machine")!,mesh=source.getObjectByProperty("isMesh",true) as Mesh,disposed=vi.fn();mesh.geometry.addEventListener("dispose",disposed);
    const room=assembledRoom(kit,p),before=JSON.stringify(room.definition);room.setView("platform",false,true);
    expect(room.root.getObjectByName("concourse-exhibit")!.visible).toBe(false);expect(room.root.getObjectByName("platform-exhibit")!.visible).toBe(true);
    room.setView("overview",false,true);expect(room.root.getObjectByName("concourse-exhibit")!.visible).toBe(true);
    expect(room.root.getObjectByName("connection-exhibit")!.getObjectByName("detailed-stairs")!.userData.lower).toEqual([12,-6,0]);expect(JSON.stringify(room.definition)).toBe(before);
    const item=exhibitModel(EXHIBITS.find(e=>e.id==="ticket-machine")!,p,kit);item.dispose();room.dispose();expect(disposed).not.toHaveBeenCalled();
    expect(source.position.toArray()).toEqual([0,0,0]);kit.dispose();expect(disposed).toHaveBeenCalledOnce();p.dispose();
  });
  test("showroom cutaway leaves the game's closed platform and train thresholds unchanged",()=>{
    const d=generateWorld(1),p=createGeneratedPalette(),before=JSON.stringify(d),normal=createGeneratedPlatform(d,p),cut=createGeneratedPlatform(d,p,true);
    const normalWall=normal.root.getObjectByName("generated-platform-textured/world.concrete") as Mesh,cutWall=cut.root.getObjectByName("generated-platform-textured/world.concrete") as Mesh;
    normalWall.geometry.computeBoundingBox();cutWall.geometry.computeBoundingBox();expect(cutWall.geometry.boundingBox!.max.z).toBeLessThan(normalWall.geometry.boundingBox!.max.z);
    expect(cut.root.getObjectByName("generated-metro-trains")!.userData).toEqual(normal.root.getObjectByName("generated-metro-trains")!.userData);
    expect(JSON.stringify(d)).toBe(before);normal.dispose();cut.dispose();p.dispose();
  });
});
