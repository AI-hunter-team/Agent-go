import { Vector3 } from "three";
import { entranceDock } from "../src/ui/scene/controlRoomLayout";
import { describe, expect, it } from "vitest";
import { generateWorld, legacyWorld, descriptor, publicMap, hydrateWorld, serializableWorld } from "../src/sim/worldDefinition";
import { createMovement } from "../src/sim/movement";
import { createNavigation } from "../src/sim/nav";
import { Engine } from "../src/sim/engine";
import { World } from "../src/sim/world";
import { PerceptionSystem } from "../src/sim/perception";
import { EventBus } from "../src/sim/events";
import { dist } from "../src/sim/geometry";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { classifyByKeywords } from "../src/sim/intent";

describe("generated station contracts",()=>{
 it("1000 deterministic seeds have complete, bounded, diverse layouts",async()=>{
  const families=new Set<string>(),hashes=new Set<string>();
  for(let seed=1;seed<=1000;seed++){
   const d=generateWorld(seed);families.add(d.archetype);hashes.add(d.layoutHash);
   const entry=d.entrances![0],dock=entranceDock(d);
   expect(new Vector3(entry.top.x,entry.top.elevation,entry.top.y).applyMatrix4(dock.matrix).length()).toBeLessThan(1e-10);
   expect(new Vector3(entry.inward.x,0,entry.inward.y).transformDirection(dock.matrix).distanceTo(new Vector3(0,0,-1))).toBeLessThan(1e-10);
   expect(d.generation.fallback).toBe(false);expect(d.generation.emptyRouteSeconds).toBeLessThanOrEqual(90);
   expect(d.floors.map(f=>f.elevation)).toEqual([0,-6]);expect(d.entrances).toHaveLength(2);for(const en of d.entrances!){expect(d.layout.zoneOf(en.bottom)).toBe("hall");expect(en.top.elevation).toBe(4);expect(en.bottom.elevation).toBe(0);}expect(d.details).toHaveLength(8);
   expect(new Set(d.props?.map(p=>p.id)).size).toBe(d.props?.length);
   for(const p of d.props??[]){if(p.body)expect(d.layout.solids).toContainEqual(p.body);expect(Number.isFinite(p.elevation)).toBe(true);}
   for(const [kind,min,max] of [["tvm",3,5],["security",3,4],["gate",4,8]] as const){const n=d.layout.FACILITIES.filter(f=>f.kind===kind).length;expect(n).toBeGreaterThanOrEqual(min);expect(n).toBeLessThanOrEqual(max);}
   for(const n of d.layout.RAILING_APPROACHES){expect(d.layout.zoneOf(n.pos)).toBe("hall");expect(d.layout.atRailing(n.pos)).toBe(true);}
   expect(d.layout.platformAxis?.center).toBeDefined();
   expect(d.layout.STAIRS_BOTTOM.floorId).toBe("platform");expect(Object.isFrozen(d.layout)).toBe(true);
   // Keep the Vitest worker responsive while retaining every seed assertion.
   if(seed%25===0) await new Promise<void>(resolve=>setImmediate(resolve));
  }
  expect(families.size).toBe(3);expect(hashes.size).toBeGreaterThan(100);
 // V2 validates the base layout and the placed solids; slower CI hosts need
 // more wall time without reducing the seed count or any assertions.
 },360000);
 it("varies entry and connector anchors, with a transverse side service band",()=>{
  const definitions=Array.from({length:30},(_,i)=>generateWorld(i+1));
  expect(new Set(definitions.map(d=>JSON.stringify(d.layout.ENTRANCE))).size).toBeGreaterThan(4);
  expect(new Set(definitions.map(d=>JSON.stringify(d.layout.STAIRS_TOP))).size).toBeGreaterThan(4);
  for(const d of definitions.filter(d=>d.archetype==="side"))expect(d.layout.STAIRS_TOP.x).toBe(d.layout.STAIRS_BOTTOM.x);
 });
 it("round-trips reports and isolates decorative randomness",()=>{
  const a=generateWorld(8),b=generateWorld(8,{appearanceSeed:999});expect(a.layout.FACILITIES).toEqual(b.layout.FACILITIES);
  expect(descriptor(a)).toEqual(descriptor(generateWorld(8)));expect(hydrateWorld(serializableWorld(a)).layout.zoneOf(a.layout.STAIRS_BOTTOM)).toBe("platform");
  expect(JSON.stringify(publicMap(a))).not.toMatch(/initialStatus|spawns|events|queueLength/);
 });
 it("uses independent navigation and blocks ordinary boundary crossing",()=>{
  for(let seed=1;seed<=12;seed++){
   const d=generateWorld(seed),m=createMovement(d.layout),nav=createNavigation(d.layout,m), l=d.layout;
   const f=l.FACILITIES.filter(f=>f.kind==="tvm").sort((a,b)=>dist(l.ENTRANCE,a.head)-dist(l.ENTRANCE,b.head))[0];
   expect(nav.findPath(l.ENTRANCE,f.head)).not.toBeNull();
   const s=l.FACILITIES.find(f=>f.kind==="security")!,g=l.FACILITIES.find(f=>f.kind==="gate")!;
   expect(nav.findPath(f.head,s.head)).not.toBeNull();expect(nav.findPath(s.exit!,g.head)).not.toBeNull();expect(nav.findPath(g.exit!,l.STAIRS_TOP)).not.toBeNull();
   expect(nav.findPath(l.ENTRANCE,l.STAIRS_TOP)).toBeNull();expect(nav.findPath(l.STAIRS_TOP,l.STAIRS_BOTTOM)).toBeNull();
  }
 });
 it("separates floors for collision, items, sight, hearing and actions",()=>{
  const d=generateWorld(2),w=new World(2,150,undefined,d),p=w.addPerson("player",{x:8,y:15,floorId:"concourse"},{isPlayer:true}),n=w.addPerson("normal",{x:8,y:15,floorId:"platform"});
  expect(w.spatial.clearOfPeople(p.pos,p.pos,.32,w.collisionBodies(p.id))).toBe(true);
  const item=w.items.spawn("can",{type:"ground",pos:n.pos},null);expect(w.items.visibleItems(p.pos).some(i=>i.id===item.id)).toBe(false);
  const bus=new EventBus(),perception=new PerceptionSystem(bus,id=>w.persons.get(id),w.lightAt,w.layout);
  bus.emit({t:0,kind:"item_dropped",severity:"odd",actorId:n.id,pos:n.pos,loudness:20});
  expect(perception.step([{id:p.id,role:"npc",pos:p.pos,facing:0}])).toHaveLength(0);
  expect(w.walkTo(p,n.pos,"另一层")).not.toBeNull();
 });
 it("locates outages on the actual floor and region",()=>{
  const d=generateWorld(4),w=new World(4,150,undefined,d),events:import("../src/shared/interaction").WorldEvent[]=[];
  w.onWorldEvent=event=>events.push({...event,id:String(events.length)});
  w.powerOut("concourse",10);expect(w.layout.zoneOf(events[0].pos)).toBe("concourse");
  w.powerOut("platform",10);expect(events[1].pos.floorId).toBe("platform");
  expect(w.lightAt(d.layout.STAIRS_BOTTOM)).toBeLessThan(1);expect(w.lightAt(d.layout.STAIRS_TOP)).toBe(1);
 });
 it.each([2,4,19])("admits an escalator rider and records cross-floor progress (seed %i)",seed=>{
  const d=generateWorld(seed),e=new Engine(seed,{}, {seed,spawns:[],events:[],initialStatus:{}},undefined,d);
  e.world.transit.queue.splice(0);e.world.transit.nextCrowdAt=Infinity;for(const [id,p] of e.world.persons)if(!p.isPlayer)e.world.persons.delete(id);
  e.player.pos={...d.layout.ESCALATOR_APPROACH};e.player.screened=e.player.passedGate=true;
  expect(e.applyAction({type:"traverse",route:"escalator",reason:"验证连接器"}).ok).toBe(true);
  for(let i=0;i<160&&e.status==="running";i++)e.step();
  expect(e.status).toBe("running");expect(e.player.onPlatform).toBe(true);expect(e.player.pos).toEqual(d.layout.ESCALATOR_BOTTOM);
  expect(e.trail.some(p=>p.connector==="escalator"&&p.elevation!<0&&p.elevation!>-6)).toBe(true);
 });
 it("retains the legacy constructor and legacy scenario",()=>{expect(new Engine(1).world.definition.generatorVersion).toBe("legacy-v0");expect(legacyWorld(1).layout.WIDTH).toBe(90);});
 it.each([2,4,19])("completes an empty journey through every orientation (seed %i)",async(seed)=>{
  const e=new Engine(seed,{}, {seed,spawns:[],events:[],initialStatus:{}},undefined,generateWorld(seed)),r=new GameRunner(e,new HeuristicAgent(),async i=>classifyByKeywords(i));await r.runToEnd();
  expect(e.status,JSON.stringify({reason:e.failReason,pos:e.player.pos,activity:e.player.activity,decisions:r.decisions.map(d=>({t:d.t,action:d.action,result:d.result}))})).toBe("success");
  expect(e.player.pos.floorId).toBe("platform");expect(r.report().world?.layoutHash).toBe(e.world.definition.layoutHash);
 },30000);
});

it("drains a crowded generated staircase without a collision between its floors",async()=>{
 const e=new Engine(40,{},undefined,undefined,generateWorld(40)),r=new GameRunner(e,new HeuristicAgent(),async i=>classifyByKeywords(i));
 await r.runToEnd();expect(e.status).toBe("success");expect(e.player.pos.floorId).toBe("platform");
},30000);
