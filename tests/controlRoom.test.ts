import { stationLightBlend } from "../src/ui/scene/controlRoomLighting";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorldPlan } from "../src/ui/WorldPlan";
import { describe, expect, test } from "vitest";
import { Box3, Raycaster, Vector3 } from "three";
import { generateWorld } from "../src/sim/worldDefinition";
import { entrancePoint } from "../src/sim/entranceGeometry";
import { GameSession } from "../src/ui/gameSession";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { LOUNGE } from "../src/ui/scene/loungeLayout";
import { ControlRoomState, entranceDock } from "../src/ui/scene/controlRoomLayout";
import { cameraFraction } from "../src/ui/scene/cameraCollision";
import { FollowCamera } from "../src/ui/scene/followCamera";
import { createControlRoomAsset,createControlRoomSuite,disposeControlAsset } from "../src/ui/scene/controlRoomModels";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { createdWorld,matchesCreatedWorld,resolveWorldSeed } from "../src/ui/worldCreation";
import { isSavedWorld,type SavedWorld } from "../src/ui/worldLibrary";
import { initialFlow,journeyReducer } from "../src/ui/journeyFlow";

const choice=()=>createdWorld(generateWorld(1),{mode:"custom",value:"1"},"我的车站");
const saved=():SavedWorld=>({...choice(),schemaVersion:1,id:"world-1",createdAt:1,updatedAt:2,preferences:{settings:{timeLimitSeconds:150,extraQueuePeople:3},backpack:true,characterId:"dafeiyu",kind:"offline",guidance:""}});

describe("world creation and local records",()=>{
  test("numeric seeds retain API semantics and normalized text is deterministic",()=>{
    expect(resolveWorldSeed(" 0001 ")).toMatchObject({ok:true,seed:1,kind:"number"});
    expect(resolveWorldSeed("4294967295")).toMatchObject({ok:true,seed:4294967295});
    expect(resolveWorldSeed("é")).toEqual(resolveWorldSeed("e\u0301".replace("\u0301","́")));
    expect(resolveWorldSeed("地铁🚇")).toEqual(resolveWorldSeed("地铁🚇"));
    for(const invalid of ["","  ","0","-1","1.5","4294967296","字".repeat(65)])expect(resolveWorldSeed(invalid).ok,invalid).toBe(false);
  });
  test("records retain a label and source but reject broken seeds and invalid preferences",()=>{
    const record=saved();expect(isSavedWorld(record)).toBe(true);expect(record.name).toBe("我的车站");
    expect(isSavedWorld({...record,preferences:{...record.preferences,characterId:"doubao"}})).toBe(true);
    expect(isSavedWorld({...record,seed:2})).toBe(false);
    expect(isSavedWorld({...record,preferences:{...record.preferences,settings:{timeLimitSeconds:150,extraQueuePeople:4}}})).toBe(false);
    expect(isSavedWorld({...record,schemaVersion:8})).toBe(false);
    expect(isSavedWorld({...record,preferences:{}})).toBe(false);
    expect(isSavedWorld({...record,preferences:{...record.preferences,guidance:"字".repeat(301)}})).toBe(true);
    expect(matchesCreatedWorld(record,generateWorld(1))).toBe(true);
    const older={...record,world:{...record.world,layoutHash:"old-version"}};expect(matchesCreatedWorld(older,generateWorld(1))).toBe(false);expect(older.world.layoutHash).toBe("old-version");
  });
  test("rendered floor plans contain the actual platform axis and landing coordinates",()=>{
    for(const seed of [1,2,4,5,7]){
      const world=generateWorld(seed),html=renderToStaticMarkup(createElement(WorldPlan,{world,floor:"platform"}));
      const [x,y,w,h]=html.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number),axis=world.layout.platformAxis!;
      expect(axis.direction==="y"?h:w).toBe((axis.direction==="y"?world.layout.HEIGHT:world.layout.WIDTH)+6);
      for(const pos of [world.layout.STAIRS_BOTTOM,world.layout.ESCALATOR_BOTTOM,...world.details.filter(d=>d.pos.floorId==="platform").map(d=>d.pos)]){
        expect(pos.x).toBeGreaterThanOrEqual(x);expect(pos.x).toBeLessThanOrEqual(x+w);expect(pos.y).toBeGreaterThanOrEqual(y);expect(pos.y).toBeLessThanOrEqual(y+h);
      }
      expect(html.includes("matrix(0 1 1 0 0 0)")).toBe(axis.direction==="y");
    }
  });
  test("creation cannot confirm a stale preview or random text seed",()=>{
    expect(()=>createdWorld(generateWorld(2),{mode:"custom",value:"1"})).toThrow();
    const text=resolveWorldSeed("云桥");if(!text.ok)throw new Error("fixture seed");
    expect(()=>createdWorld(generateWorld(text.seed),{mode:"random",value:"云桥"})).toThrow();
  });
  test("creation is mandatory and selecting/deleting worlds clears old plans",()=>{
    for(const stage of ["character","guidance","planning","plan","launch","watch"] as const)expect(journeyReducer(initialFlow,{type:"navigate",stage}).stage).toBe("world");
    const editing=journeyReducer(initialFlow,{type:"navigate",stage:"world"});
    const selected=journeyReducer(editing,{type:"world-created",choice:choice()});expect(selected.stage).toBe("character");
    const planning=journeyReducer(selected,{type:"navigate",stage:"planning"});
    const returned=journeyReducer(planning,{type:"navigate",stage:"lobby"});
    expect(journeyReducer(returned,{type:"prepare",revision:planning.revision,prepared:{} as never})).toEqual(returned);
    const removed=journeyReducer(planning,{type:"world-removed"});expect(removed.createdWorld).toBeNull();expect(removed.stage).toBe("lobby");
  });
});

describe("continuous room and station handoff",()=>{
  test("portrait lobby framing and its transition keep the actor in front of all room walls",()=>{
    const palette=createGeneratedPalette(),room=createControlRoomAsset("room",palette,false);
    room.updateMatrixWorld(true);
    const state=new ControlRoomState(),dock=entranceDock(generateWorld(1)),focus=new Vector3(...LOUNGE.actor).add(new Vector3(0,.9,0));
    for(let i=0;i<300;i++){
      state.update("lobby",1/60,false,false,dock,true);
      for(const target of [focus,state.target]){
        const ray=new Raycaster(state.eye,target.clone().sub(state.eye).normalize(),0,state.eye.distanceTo(target));
        expect(ray.intersectObject(room,true),`portrait frame ${i}`).toHaveLength(0);
      }
    }
    expect(state.eye.distanceTo(new Vector3(...LOUNGE.narrowEye))).toBeLessThan(.001);
    disposeControlAsset(room);palette.dispose();
  });
  test("each layout docks onto the same landing without mutating world data",()=>{
    const layouts=new Set<string>();
    for(const seed of [1,2,4]){
      const d=generateWorld(seed),before=d.layoutHash,e=d.entrances![0],dock=entranceDock(d);layouts.add(d.archetype);
      const top=new Vector3(e.top.x,e.top.elevation,e.top.y).applyMatrix4(dock.matrix);expect(top.length()).toBeLessThan(1e-10);
      const inward=new Vector3(e.inward.x,0,e.inward.y).transformDirection(dock.matrix);expect(inward.distanceTo(new Vector3(0,0,-1))).toBeLessThan(1e-10);
      const original=new Vector3(7,2,13),round=original.clone().applyMatrix4(dock.matrix).applyMatrix4(dock.inverse);expect(round.distanceTo(original)).toBeLessThan(1e-10);expect(d.layoutHash).toBe(before);
    }expect(layouts.size).toBe(3);
  },15000);
  test("waiting is untimed and the display path meets the simulation at exact position and heading",()=>{
    for(const seed of [1,2,4]){
      const session=new GameSession(seed,{},undefined,true),engine=session.engine,state=new ControlRoomState(),dock=entranceDock(engine.world.definition),start=JSON.stringify(engine.player.pos);
      for(let i=0;i<300;i++)state.update("launch",1/60,false,false,dock,false);
      expect(state.elapsed).toBe(0);expect(engine.t).toBe(0);expect(JSON.stringify(engine.player.pos)).toBe(start);
      let previous=new Vector3(...LOUNGE.actor);
      for(let i=0;i<481;i++){
        state.update("launch",1/60,true,false,dock,false);expect(state.actor.distanceTo(previous)).toBeLessThan(.05);previous.copy(state.actor);
        // The passage crosses the open side doorway, not the room's wall.
        if(state.actor.x>-3.1&&state.actor.x<-1.7)expect(Math.abs(state.actor.z-LOUNGE.door[2])).toBeLessThan(.35);
      }
      expect(state.complete).toBe(true);expect(engine.t).toBe(0);
      const e=engine.world.definition.entrances![0];expect(new Vector3(state.pose.x,state.pose.y,state.pose.z).distanceTo(new Vector3(e.top.x,e.top.elevation,e.top.y))).toBeLessThan(.0001);
      expect(Math.cos(state.pose.yaw-Math.atan2(e.inward.x,e.inward.y))).toBeCloseTo(1,8);
      state.update("character",1/60,false,false,dock,false);expect(state.door).toBe(0);expect(state.actor.toArray()).toEqual(LOUNGE.actor);
    }
  });
  test("room lighting hands off continuously and restores the station before timed entry",()=>{
    const state=new ControlRoomState(),dock=entranceDock(generateWorld(1));
    state.update("launch",0,false,false,dock,false);expect(stationLightBlend(state)).toBe(0);
    let previous=0;
    for(let i=0;i<481;i++){state.update("launch",1/60,true,false,dock,false);const blend=stationLightBlend(state);expect(blend).toBeGreaterThanOrEqual(previous);expect(blend-previous).toBeLessThan(.03);previous=blend;}
    expect(previous).toBe(1);state.update("watch",1/60,false,false,dock,false);expect(stationLightBlend(state)).toBe(1);
    state.update("character",1/60,false,false,dock,false);expect(stationLightBlend(state)).toBe(0);
  });
  test("accelerating the display changes no world facts or clock",()=>{
    const d=generateWorld(1),dock=entranceDock(d),state=new ControlRoomState();for(let i=0;i<162;i++)state.update("launch",1/60,true,true,dock,false);expect(state.complete).toBe(true);
    const before=state.elapsed;state.update("launch",0,true,false,dock,false);expect(state.elapsed).toBe(before);
  });
  test("prepared startup keeps engine, map and render generation, and refuses duplicate startup",()=>{
    const session=new GameSession(1,{},undefined,true),engine=session.engine,definition=engine.world.definition,generation=session.generation,position={...engine.player.pos};
    session.startPrepared(new HeuristicAgent(),offlineClassifier);expect(session.engine).toBe(engine);expect(session.engine.world.definition).toBe(definition);expect(session.generation).toBe(generation);expect(engine.player.pos).toEqual(position);expect(engine.t).toBe(0);
    expect(()=>session.startPrepared(new HeuristicAgent(),offlineClassifier)).toThrow();session.stop();
    session.start(new HeuristicAgent(),offlineClassifier);expect(session.engine).not.toBe(engine);expect(session.generation).toBe(generation+1);session.stop();
  });
  test("stair follow cameras stay above the upper landing and retain headroom",()=>{
    for(const seed of [1,2,4])for(const progress of [.1,.25,.5,.75,.95]){
      const d=generateWorld(seed),e=d.entrances![0],point=entrancePoint(e,progress),camera=new FollowCamera();
      camera.update({x:point.x,y:point.elevation!,z:point.y,yaw:Math.atan2(e.inward.x,e.inward.y)},{yaw:0,pitch:.16,distance:4.2},1/60,true,false,d);
      const along=(camera.position.x-e.top.x)*e.inward.x+(camera.position.z-e.top.y)*e.inward.y;
      const floor=along<0?4:along>6?0:4*(1-along/6);expect(camera.position.y-floor).toBeGreaterThan(.9);expect(camera.position.y-floor).toBeLessThan(2.7);
    }
  });
  test("the private doorway is open to the same camera ray as its rendered side passage",()=>{
    for(const seed of [1,2,4]){const d=generateWorld(seed),dock=entranceDock(d),target=dock.toMap(new Vector3(0,1.25,3.5)),eye=dock.toMap(new Vector3(-4.2,2.3,4));expect(cameraFraction(target,eye,d)).toBe(1);}
  });
  test("all original control-room assets and their assembled cutaway have finite metre geometry",()=>{
    const palette=createGeneratedPalette();
    for(const kind of ["room","console","wardrobe","door","passage","seat","table","brand"] as const){const root=createControlRoomAsset(kind,palette),box=new Box3().setFromObject(root);expect(box.isEmpty()).toBe(false);expect([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)).toBe(true);expect(root.scale.toArray()).toEqual([1,1,1]);if(kind==="door"){expect(root.getObjectByName("door-leaf--1")).toBeDefined();expect(root.getObjectByName("door-leaf-1")).toBeDefined();}disposeControlAsset(root);}
    const suite=createControlRoomSuite(palette);expect(suite.children.length).toBe(6);expect(suite.getObjectByName("control-console")).toBeUndefined();expect(suite.getObjectByName("lounge-brand")).toBeDefined();disposeControlAsset(suite);palette.dispose();
  });
});
