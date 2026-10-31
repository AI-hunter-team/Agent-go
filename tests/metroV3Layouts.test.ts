import { getReplayFrame } from "../src/replay/trajectory";
import { describe,it,expect } from "vitest";
import { generateWorld,restoreWorld,serializableWorld,hydrateWorld,validateWorld,publicMap } from "../src/sim/worldDefinition";
import { createWorldV3 } from "../src/sim/worldV3";
import { buildingCandidate } from "../src/sim/metroV3Layouts";
import { stationAtlas } from "../src/ui/stationMap";
import { createMovement } from "../src/sim/movement";
import { createNavigation } from "../src/sim/nav";
import { coversRect } from "../src/shared/stationFootprint";
import { createGeneratedPalette } from "../src/ui/scene/generatedSurfaces";
import { createStationV2Architecture } from "../src/ui/scene/stationV2Architecture";
import { stationDetailScene } from "../src/ui/scene/stationDetailScene";
import { Mesh } from "three";
import { World } from "../src/sim/world";
import { Engine } from "../src/sim/engine";
import { buildScenario } from "../src/sim/scenario";
import { playerCanSee } from "../src/sim/observation";
const station=(seed:number)=>generateWorld(seed,{version:"metro-v3"});
const representatives=[[1,"offset-entry"],[3,"open-hall"],[7,"dual-ended"]] as const;

describe("M2 architectural layouts and M3 consumers",()=>{
 it.each(representatives)("seed %i creates %s without painting the bounding rectangle as walkable",(seed,type)=>{
  const d=station(seed),a=d.architecture!,areas=a.areas.filter(a=>a.floorId==="concourse").map(a=>a.bounds),spatial=createMovement(d.layout),atlas=stationAtlas(d);
  expect(a.layoutType).toBe(type);expect(d.generation.actualLayout).toBe(type);expect(validateWorld(d)).toEqual([]);expect(a.walls!.length).toBeGreaterThan(3);
  for(const shape of atlas.floors.find(f=>f.id==="concourse")!.shapes.filter(s=>["floor","paid"].includes(s.kind)))expect(coversRect(shape.bounds,areas),shape.id).toBe(true);
  if(type!=="open-hall"){const point=type==="offset-entry"?{x:2,y:8}:{x:d.layout.WIDTH/2,y:2};expect(spatial.clearOfScenery(point,point,.32)).toBe(false);expect(areas.some(r=>point.x>r.x&&point.x<r.x+r.w&&point.y>r.y&&point.y<r.y+r.h)).toBe(false);}
  const nav=createNavigation(d.layout,spatial);for(const c of d.connectors!)for(const gate of d.layout.FACILITIES.filter(f=>f.kind==="gate"))expect(nav.findPath(gate.exit!,c.approach,.48)).not.toBeNull();
  expect(publicMap(d).connectors).toEqual(d.connectors);expect(hydrateWorld(serializableWorld(d)).architecture).toEqual(a);
 });
 it("interpolates entry into a connector below its floor instead of moving across the slab",()=>{
  const replay=getReplayFrame({elapsed:1,decisions:[],trail:[{t:0,x:51,y:12,floorId:"concourse",elevation:0},{t:1,x:57,y:12,floorId:"transit:B:stairs",elevation:-3,connector:"stairs",connectorId:"B:stairs",progress:.5}]},.5);
  expect(replay.position).toMatchObject({floorId:"transit:B:stairs",connectorId:"B:stairs",x:54,elevation:-1.5,progress:.25});
 });
 it("preserves both delivered V3 revisions and rejects an unknown descriptor",()=>{
  for(const [hash,width] of [["8e3cc409",72],["2978abaf",78]] as const){const old=restoreWorld(1,{generatorVersion:"metro-v3",layoutHash:hash})!;expect(old.layout.WIDTH).toBe(width);expect(old.layoutHash).toBe(hash);}
  expect(restoreWorld(1,{generatorVersion:"metro-v3",layoutHash:"missing"})).toBeNull();
 });
 it("bounds retries and falls back to a verified V3 sample while recording the actual type",()=>{
  let calls=0;const d=createWorldV3(3,3,(...args)=>{calls++;const source=buildingCandidate(...args),bad=serializableWorld(source);bad.layout.zoneOf=source.layout.zoneOf;bad.layout.atRailing=source.layout.atRailing;bad.layout.solids!.push({...bad.connectors![0].arrivalArea!});return bad;});
  expect(calls).toBe(20);expect(d.generation.attempts).toBe(20);expect(d.generation.fallback).toBe(true);expect(d.generation.actualLayout).toBe("dual-ended");expect(d.generatorVersion).toBe("metro-v3");expect(validateWorld(d)).toEqual([]);expect(d.generation.reasons.length).toBeGreaterThanOrEqual(20);
 },15000);
 it("keeps decoration independent of geometry, length, facilities, faults and spawn sampling",()=>{
  const a=createWorldV3(9),b=createWorldV3(9,54321),geometry=(d:typeof a)=>d.props!.map(({variant,...p})=>p);
  expect(a.architecture).toEqual(b.architecture);expect(geometry(a)).toEqual(geometry(b));expect(a.train).toEqual(b.train);expect(a.connectors).toEqual(b.connectors);expect(a.props).not.toEqual(b.props);
  expect(buildScenario(9,{},a.layout)).toEqual(buildScenario(9,{},b.layout));
 });
 it.each(representatives)("retains structural enclosure at seed %i in both quality levels (%s)",(seed)=>{
  const d=station(seed),p=createGeneratedPalette(),standard=createStationV2Architecture(d,p),low=createStationV2Architecture(d,p,false),fullDetails=stationDetailScene(d,p),lowDetails=stationDetailScene(d,p,undefined,false);
  const vertices=(root:typeof standard.root)=>{let n=0;root.traverse(v=>{if(v instanceof Mesh)n+=v.geometry.getAttribute("position").count;});return n;};
  expect(vertices(low.root)).toBeLessThan(vertices(standard.root));expect(low.root.getObjectByName("v2-ceilings")).toBeDefined();expect(low.root.getObjectByName("B:stairs")).toBeDefined();expect(lowDetails.leaves.children.length).toBeGreaterThan(0);
  const leaf=fullDetails.leaves.children[0] as Mesh,positions=leaf.geometry.getAttribute("position"),before=positions.getX(0);fullDetails.setDoorProgress(0);expect(positions.getX(0)).not.toBe(before);fullDetails.setDoorProgress(1);expect(positions.getX(0)).toBeCloseTo(before,4);
  fullDetails.dispose();lowDetails.dispose();standard.dispose();low.dispose();p.dispose();
 },15000);
 it.each(representatives)("routes around a full group A queue without blocking admission to B at seed %i (%s)",seed=>{
  const d=station(seed),w=new World(seed,150,undefined,d),a=d.connectors!.find(c=>c.id==="A:escalator")!,b=d.connectors!.find(c=>c.id==="B:escalator")!;
  const channel=w.transit.forConnector(a.id)!;for(let i=0;i<14;i++){const p=w.addPerson("normal",channel.slot(i));p.passedGate=true;p.transitConnectorId=a.id;p.activity={kind:"escalator_queue",joinedAt:0};channel.queue.push(p.id);}
  const alternate=w.addPerson("normal",{...a.approach});alternate.passedGate=true;alternate.transitRoute="escalator";alternate.transitConnectorId=a.id;w.transit.routeNpc(alternate);expect(alternate.transitConnectorId).toBe("A:stairs");
  const independent=w.addPerson("normal",{...b.from});independent.passedGate=true;expect(w.traverse(independent,"escalator",false,b.id)).toBeNull();expect(w.transit.forConnector(b.id)!.queue).toEqual([independent.id]);
 });
 it.each(representatives)("binds special movement and replay progress to group B at seed %i (%s)",seed=>{
  const d=station(seed),e=new Engine(seed,{}, {seed,initialStatus:{},spawns:[],events:[]},undefined,d),c=d.connectors!.find(c=>c.id==="B:stairs")!;
  e.player.passedGate=true;e.player.activity={kind:"idle"};e.player.pos={...c.from};e.player.transitConnectorId="A:escalator";
  expect(e.executor.start({status:"plan",steps:[{op:"slide_handrail"}],summary:"滑扶手",reason:"",source:"keywords"}).ok).toBe(true);
  for(let i=0;i<10;i++)e.step();const last=e.trail.at(-1)!;expect(last.connectorId).toBe(c.id);
  const replay=getReplayFrame({elapsed:e.t,trail:e.trail,decisions:[]},e.t-.05);expect(replay.position?.connectorId).toBe(c.id);expect(replay.position?.progress).toBeGreaterThan(0);
  for(let i=0;i<20;i++)e.step();expect(e.player.onPlatform).toBe(true);expect(e.player.pos).toEqual(c.to);
 });
 it.each(representatives)("keeps separate queues, connector collisions and cross-floor perception at seed %i (%s)",seed=>{
  const d=station(seed),w=new World(seed,150,undefined,d);
  const riders=d.connectors!.filter(c=>c.kind==="escalator").map(c=>{const person=w.addPerson("normal",{...c.from});person.passedGate=true;expect(w.traverse(person,"escalator",false,c.id)).toBeNull();return {person,c};});
  expect(w.transit.queues()[0]).not.toBe(w.transit.queues()[1]);for(let i=0;i<120;i++){w.t+=.1;w.stepPeopleAndFacilities();}for(const {person,c} of riders){expect(person.onPlatform).toBe(true);expect(person.pos).toEqual(c.to);}
  const e=new Engine(seed,{}, {seed,initialStatus:{},spawns:[],events:[]},undefined,d),other={...e.player.pos,floorId:"platform"};expect(playerCanSee(e.player.pos,other,e.world.lightAt,d.layout)).toBe(false);
 });
});
