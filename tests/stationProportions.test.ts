import { describe,it,expect } from "vitest";
import { Box3 } from "three";
import { generateWorld,publicMap,serializableWorld } from "../src/sim/worldDefinition";
import { validateStationProportions,stationEntryBudgets } from "../src/sim/stationProportions";
import { generatedTrainDoors,generatedTrainLayout,worldTrainLayout } from "../src/shared/generatedTrain";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { createStationV2Architecture } from "../src/ui/scene/stationV2Architecture";
import { constrainCabinCamera } from "../src/ui/scene/trainCabin";
import { serviceBankSigns } from "../src/ui/scene/stationWayfinding";
import { World } from "../src/sim/world";
import { Engine } from "../src/sim/engine";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { emptyScenario } from "./fixtures/scenarios";
const representatives=[[1,78,3],[8,102,4],[3,126,5],[9,150,6]] as const;
const station=(seed:number)=>generateWorld(seed,{version:"metro-v3"});

describe("V3 station proportions",()=>{
 it.each(representatives)("seed %i builds a %im station with %i unscaled cars",(seed,length,count)=>{
  const d=station(seed),train=worldTrainLayout(d),doors=generatedTrainDoors(d);
  expect(d.layout.WIDTH).toBe(length);expect(train.count).toBe(count);expect(train.scale).toEqual([1,1,1]);
  expect(train.centres[0]-23.117/2).toBeGreaterThan(0);expect(train.centres.at(-1)!+23.117/2).toBeLessThan(length);
  expect(doors).toHaveLength(count*10);expect(publicMap(d).train).toEqual({carCount:count});
  expect(new Set(publicMap(d).nodes.filter(n=>n.id.startsWith("TRAIN_")).map(n=>n.id)).size).toBe(count*10);
  const a=d.connectors![0],b=d.connectors![2];expect(b.to.x-a.to.x).toBe(length-54);
  expect(d.connectors!.every(c=>c.to.x>c.from.x)).toBe(true);expect(validateStationProportions(d)).toEqual([]);
  expect(stationEntryBudgets(d)).toEqual(d.generation.entryBudgets);
  for(const seconds of Object.values(d.generation.entryBudgets!))expect(seconds).toBeLessThanOrEqual(90);
  expect(serviceBankSigns(d).map(s=>s.x)).toEqual([14,length-7,21,length-12]);
 });
 it("rejects occupied or mutually overlapping group aprons and oversized consists",()=>{
  const d=serializableWorld(station(1)),arrival=d.connectors![0].arrivalArea!;
  d.layout.solids!.push({...arrival});expect(validateStationProportions(d)).toContain("arrival blocked A");
  d.layout.solids!.pop();d.connectors![2].to={...d.connectors![0].to};
  expect(validateStationProportions(d)).toContain("connection groups too close A/B");
  expect(()=>generatedTrainLayout(78,6)).toThrow(RangeError);expect(generatedTrainLayout(150).count).toBe(3);
 });
 it("extends opaque enclosure, roof and trains to the long station end",()=>{
  const d=station(9),p=createGeneratedPalette(),model=createStationV2Architecture(d,p);
  for(const name of ["v2-walls-columns","v2-ceilings"]){const box=new Box3().setFromObject(model.root.getObjectByName(name)!);expect(box.max.x).toBeGreaterThanOrEqual(150);}
  const trains=model.root.getObjectByName("generated-metro-trains")!,box=new Box3().setFromObject(trains);expect(box.max.x).toBeGreaterThan(140);
  model.dispose();p.dispose();
 });
 it("turns full independent queues away from stairs while preserving the distribution corridor",()=>{
  const d=station(1),w=new World(1,150,undefined,d);
  for(const c of d.connectors!.filter(c=>c.kind==="escalator")){
   const channel=w.transit.forConnector(c.id)!;
   if(c.groupId==="A")expect(channel.slot(3).x-d.layout.GATE_X).toBeGreaterThanOrEqual(3);
   expect(channel.slot(3)).toMatchObject({x:c.from.x-3,y:18});expect(channel.slot(13)).toMatchObject({x:c.from.x-3,y:28});
   for(let i=0;i<14;i++)expect(w.spatial.clearOfScenery(channel.slot(i),channel.slot(i),.48)).toBe(true);
  }
 });
 it("rejoins the legal route after local avoidance carries a walker behind an opening",()=>{
  const d=station(45),w=new World(45,150,undefined,d),target=d.connectors![0].from;
  const p=w.addPerson("player",{x:38.63,y:15.95,floorId:"concourse"},{isPlayer:true});p.passedGate=true;
  p.activity={kind:"walking",path:[{...target}],label:"楼梯入口"};
  for(let i=0;i<120&&p.activity.kind==="walking";i++){w.t+=.1;w.stepPeopleAndFacilities();}
  expect(p.activity.kind).toBe("idle");expect(Math.hypot(p.pos.x-target.x,p.pos.y-target.y)).toBeLessThan(.2);
 });
 it("admits an NPC at the outer approach tolerance instead of leaving it idle across the stairs path",()=>{
  const d=station(47),w=new World(47,150,undefined,d);
  const riders=d.connectors!.filter(c=>c.kind==="escalator").map(c=>{
   const dx=c.approach.x-c.from.x,dy=c.approach.y-c.from.y,len=Math.hypot(dx,dy);
   const p=w.addPerson("normal",{...c.approach,x:c.approach.x+dx/len*.19,y:c.approach.y+dy/len*.19});
   p.passedGate=p.screened=true;p.transitRoute="escalator";p.transitConnectorId=c.id;w.transit.routeNpc(p);
   expect(["to_escalator","escalator_queue"]).toContain(p.activity.kind);return p;
  });
  for(let i=0;i<150;i++){w.t+=.1;w.stepPeopleAndFacilities();}
  expect(riders.every(p=>p.onPlatform)).toBe(true);
 });
 it("boards the sixth car through its generated door and keeps the camera inside that car",()=>{
  const d=station(9),e=new Engine(9,{},emptyScenario(9),undefined,d),door=generatedTrainDoors(d).find(v=>v.id==="TRAIN_N_6_5")!;
  Object.assign(e.player,{pos:{...door.pos},passedGate:true,screened:true,onPlatform:true});
  expect(e.applyAction({type:"move_to",target:door.id,reason:"登车"}).ok).toBe(true);
  for(let i=0;i<100&&e.status==="running";i++)e.step();expect(e.status).toBe("success");expect(e.player.onTrain).toBe(true);
  const camera={x:0,y:0,z:0};constrainCabinCamera(camera,{x:e.player.pos.x,y:-6,z:e.player.pos.y,yaw:0},d);
  expect(Math.abs(camera.x-door.carCentre)).toBeLessThanOrEqual(10.4+1e-9);expect(camera.x).toBeGreaterThan(120);
 });
 it.each(representatives.flatMap(([seed,length])=>["A","B"].map(entry=>({seed,length,entry}))))("completes empty $length m journey from $entry within 90 seconds",async({seed,entry})=>{
  const d=station(seed),e=new Engine(seed,{},emptyScenario(seed),undefined,d);
  e.world.entry.begin(e.player,d.entrances!.find(e=>e.id===entry)!);
  const r=new GameRunner(e,new HeuristicAgent(),async i=>classifyByKeywords(i));await r.runToEnd();
  expect(e.status,r.report().failReason??"").toBe("success");expect(e.player.onTrain).toBe(true);expect(e.t).toBeLessThanOrEqual(90);
 },15000);
});
