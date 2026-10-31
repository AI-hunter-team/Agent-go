import { describe,it,expect } from "vitest";
import { generateWorld,generateWorldV1,restoreWorld,serializableWorld,hydrateWorld,validateWorld,publicMap } from "../src/sim/worldDefinition";
import { createWorldV2 } from "../src/sim/worldV2";
import { propDefinition } from "../src/shared/stationProps";
import { Engine } from "../src/sim/engine";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { stationAtlas } from "../src/ui/stationMap";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { createStationV2Architecture } from "../src/ui/scene/stationV2Architecture";
import { stationDetailScene } from "../src/ui/scene/stationDetailScene";
import { agentTools } from "../server/tools";
const specimen=(seed=1,appearanceSeed=seed)=>generateWorld(seed,{version:"metro-v3",appearanceSeed});

describe("V3 architectural and facility fusion",()=>{
 it("preserves the supported seed range through both architectural factories",()=>{
  for(const seed of [0,-1,1.5,NaN,Infinity,4294967296]){expect(()=>createWorldV2(seed)).toThrow(RangeError);expect(()=>specimen(seed)).toThrow(RangeError);}
 });
 it("restores both V2 producers and both historical V1 descriptors",()=>{
  expect(restoreWorld(1,{generatorVersion:"metro-v3",layoutHash:"8e3cc409"})?.layout.WIDTH).toBe(72);
  const architectural=createWorldV2(1),detail=generateWorld(1,{version:"metro-v2"});
  expect(architectural.layoutHash).toBe("acc3b052");expect(detail.props!.length).toBeGreaterThan(0);expect(detail.connectors).toBeUndefined();
  for(const d of [architectural,detail,specimen(),generateWorldV1(1)])expect(serializableWorld(restoreWorld(d.seed,{generatorVersion:d.generatorVersion,layoutHash:d.layoutHash})!)).toEqual(serializableWorld(d));
  expect(restoreWorld(1,{generatorVersion:"metro-v1",layoutHash:"50e78bc1"})?.layoutHash).toBe("50e78bc1");
  expect(restoreWorld(1,{generatorVersion:"metro-v2",layoutHash:"wrong"})).toBeNull();
  expect(restoreWorld(1,{generatorVersion:"unknown" as "metro-v3",layoutHash:"wrong"})).toBeNull();
 });
 it("keeps geometric installation and operational draws independent of appearance",()=>{
  const a=specimen(7),b=specimen(7,12345),geometry=(d:typeof a)=>d.props!.map(({variant,...p})=>p);
  expect(geometry(a)).toEqual(geometry(b));expect(a.props).not.toEqual(b.props);expect(a.layout.solids).toEqual(b.layout.solids);expect(a.connectors).toEqual(b.connectors);
  const queueState=(d:typeof a)=>{const e=new Engine(7,{},undefined,undefined,d);return [...e.world.facilities].map(([id,f])=>({id,status:f.status,queue:f.queue.map(id=>e.world.persons.get(id)!.kind)}));};
  expect(queueState(a)).toEqual(queueState(b));expect(serializableWorld(specimen(7))).toEqual(serializableWorld(a));expect(hydrateWorld(serializableWorld(a)).props).toEqual(a.props);
 });
 it.each([1,2,4,7,17,30])("shares placements, collision and floor-aware mounting at seed %i",seed=>{
  const d=specimen(seed),e=new Engine(seed,{},undefined,undefined,d),atlas=stationAtlas(d);expect(validateWorld(d)).toEqual([]);expect(d.props!.length).toBeGreaterThan(40);
  expect(atlas.connections.filter(c=>c.kind!=="entrance")).toHaveLength(4);expect(publicMap(d).connectors).toEqual(d.connectors);
  for(const p of d.props!){const floor=d.floors.find(f=>f.id===p.pos.floorId)!,asset=propDefinition(p.assetId);expect(p.elevation+asset.size[1],p.id).toBeLessThanOrEqual(floor.ceiling-floor.elevation);
   if(p.body){expect(d.layout.solids).toContainEqual(p.body);expect(e.world.spatial.clearOfScenery(p.pos,p.pos,.1),p.id).toBe(false);expect(atlas.floors.flatMap(f=>f.shapes).some(s=>s.id===p.id)).toBe(true);}
  }
 });
 it.each([1,45])("publishes IDs and boards through the actual door at seed %i",async(seed)=>{
  const d=specimen(seed),e=new Engine(seed,{},undefined,undefined,d),r=new GameRunner(e,new HeuristicAgent(),async i=>classifyByKeywords(i));
  const tool=agentTools(publicMap(d)).find(t=>t.name==="traverse")!;
  expect((tool.parameters.properties as Record<string,{enum?:string[]}>).connectorId.enum).toEqual(d.connectors!.map(c=>c.id));
  await r.runToEnd();expect(e.status).toBe("success");expect(e.player.onTrain).toBe(true);expect(r.report().world!.generatorVersion).toBe("metro-v3");expect(r.report().trail.some(p=>p.connectorId==="A:stairs")).toBe(true);
 },15000);
 it("assembles one door frontage and releases independent geometry without changing the world",()=>{
  const d=specimen(),before=JSON.stringify(d),p=createGeneratedPalette(),architecture=createStationV2Architecture(d,p),details=stationDetailScene(d,p);
  expect(details.root.getObjectByName("detail-static-platform")).toBeDefined();expect(architecture.root.getObjectByName("B:stairs")).toBeDefined();expect(JSON.stringify(d)).toBe(before);
  details.dispose();architecture.dispose();p.dispose();
 });
});
