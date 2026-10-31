import { describe,it,expect } from "vitest";
import { createWorldV2 } from "../src/sim/worldV2";
import { generateWorld,validateWorld,hydrateWorld,serializableWorld,publicMap } from "../src/sim/worldDefinition";
import { World } from "../src/sim/world";
import { actorConnector, selectConnector } from "../src/sim/connectors";
import { stationAtlas } from "../src/ui/stationMap";
import { createStationV2Architecture } from "../src/ui/scene/stationV2Architecture";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { Engine } from "../src/sim/engine";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { parseToolUse } from "../server/tools";
const specimen=()=>createWorldV2(1);
describe("V2 playable architectural specimen",()=>{
 it("carries explicit connector IDs through tool parsing and actual boarding",async()=>{
  const d=specimen();expect(parseToolUse("traverse",{route:"stairs",connectorId:"B:stairs"},publicMap(d))).toMatchObject({action:{connectorId:"B:stairs"}});
  const e=new Engine(1,{},undefined,undefined,d),r=new GameRunner(e,new HeuristicAgent(),async i=>classifyByKeywords(i));await r.runToEnd();
  expect(e.status).toBe("success");expect(e.player.onTrain).toBe(true);expect(r.report().trail.some(p=>p.connectorId==="A:stairs")).toBe(true);expect(d.generation.emptyRouteSeconds).toBeGreaterThan(0);expect(d.generation.emptyRouteSeconds).toBeLessThanOrEqual(90);
 },15000);
 it("keeps V1 unchanged and restores four concrete routes from reports",()=>{
  const before=generateWorld(1,{version:"metro-v1"}),d=specimen();expect(serializableWorld(generateWorld(1,{version:"metro-v1"}))).toEqual(serializableWorld(before));expect(validateWorld(d)).toEqual([]);
  const restored=hydrateWorld(serializableWorld(d));expect(restored.layoutHash).toBe(d.layoutHash);expect(publicMap(restored).routes.map(r=>r.connectorId)).toEqual(["A:stairs","A:escalator","B:stairs","B:escalator"]);
  expect(stationAtlas(restored).connections.filter(c=>c.kind!=="entrance")).toHaveLength(4);
 });
 it("binds stair movement to either group and rejects mismatched explicit IDs",()=>{
  for(const id of ["A:stairs","B:stairs"]){const d=specimen(),w=new World(1,150,undefined,d),c=d.connectors!.find(c=>c.id===id)!,p=w.addPerson("player",{...c.from},{isPlayer:true});p.passedGate=true;
   expect(w.traverse(p,"stairs",false,"B:escalator")).not.toBeNull();expect(w.traverse(p,"stairs",false,id)).toBeNull();
   expect(p.activity.kind==="stairs"&&p.activity.connectorId).toBe(id);for(let i=0;i<65;i++)w.stepPeopleAndFacilities();expect(p.onPlatform).toBe(true);expect(p.pos).toEqual(c.to);
  }
 });
 it("keeps escalator queues independent, including leave and capacity",()=>{
  const d=specimen(),w=new World(1,150,undefined,d);
  for(const id of ["A:escalator","B:escalator"]){const c=d.connectors!.find(c=>c.id===id)!,p=w.addPerson("normal",{...c.from});p.passedGate=true;expect(w.traverse(p,"escalator",false,id)).toBeNull();expect(w.transit.forConnector(id)!.queue).toEqual([p.id]);}
  const queues=w.transit.queues();expect(queues[0]).not.toBe(queues[1]);const p=w.persons.get(queues[1][0])!;w.transit.remove(p);expect(queues[0]).toHaveLength(1);expect(queues[1]).toHaveLength(0);
 });
 it("carries passengers through both independent escalators",()=>{
  const d=specimen(),w=new World(1,150,undefined,d);
  const riders=d.connectors!.filter(c=>c.kind==="escalator").map(c=>{const p=w.addPerson("normal",{...c.from});p.passedGate=true;expect(w.traverse(p,"escalator",false,c.id)).toBeNull();return {p,c};});
  for(let i=0;i<110;i++)w.stepPeopleAndFacilities();
  for(const {p,c} of riders){expect(p.onPlatform).toBe(true);expect(p.pos).toEqual(c.to);}
 });
 it("selects the nearest reachable group without peeking at queues",()=>{
  const d=specimen(),w=new World(1,150,undefined,d),p=w.addPerson("normal",{x:57,y:12,floorId:"concourse"});expect(selectConnector(w,p,"stairs")?.id).toBe("B:stairs");
  expect(selectConnector(w,p,"stairs","missing")).toBeUndefined();
 });
 it("binds special movement to group B even after leaving a group A queue",()=>{
  const d=specimen(),e=new Engine(1,{},undefined,undefined,d),c=d.connectors!.find(c=>c.id==="B:stairs")!;
  e.player.passedGate=true;e.player.activity={kind:"idle"};e.player.pos={...c.from};e.player.transitConnectorId="A:escalator";
  expect(actorConnector(e.world,e.player,"stairs")?.id).toBe("B:stairs");
  expect(e.executor.start({status:"plan",steps:[{op:"slide_handrail"}],summary:"滑扶手",reason:"",source:"keywords"}).ok).toBe(true);
  for(let i=0;i<23;i++)e.step();expect(e.player.onPlatform).toBe(true);expect(e.player.transitConnectorId).toBe("B:stairs");expect(e.player.pos).toEqual(c.to);
 });
 it("builds one shared physical specimen without mutating its map",()=>{
  const d=specimen(),hash=d.layoutHash,p=createGeneratedPalette(),model=createStationV2Architecture(d,p);
  expect(model.root.getObjectByName("A:stairs")).toBeDefined();expect(model.root.getObjectByName("B:escalator")).toBeDefined();expect(model.root.getObjectByName("v2-trim-screen-doors")).toBeDefined();expect(d.layoutHash).toBe(hash);model.dispose();p.dispose();
 });
});
