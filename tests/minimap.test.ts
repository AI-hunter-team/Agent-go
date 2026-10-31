import { afterEach, expect, test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Engine } from "../src/sim/engine";
import { generateWorld, legacyWorld } from "../src/sim/worldDefinition";
import { entrancePoint } from "../src/sim/entranceGeometry";
import { getReplayFrame } from "../src/replay/trajectory";
import { captureMapFrame, edgeTarget, floorViewport, mapViewportAtZoom, zoomMapViewport, miniMapShowsWhole, miniMapViewport, replayMapFrame, routeVisible, splitRoute, stationAtlas, visibleMarkers, type MapFrame, type StationAtlas } from "../src/ui/stationMap";
import { StationMap } from "../src/ui/FloorMap";
import { readRoutePreference, saveRoutePreference } from "../src/ui/MiniMap";
const make=()=>new Engine(1,{},undefined,undefined,generateWorld(1));
afterEach(()=>vi.unstubAllGlobals());

export function multiFloorFixture():StationAtlas {
 const floors=Array.from({length:6},(_,i)=>({id:`level-${i}`,label:`地下 ${i+1} 层`,elevation:-i*5,bounds:{x:-200,y:-100,w:800,h:400},shapes:[{id:`body-${i}`,kind:"floor" as const,bounds:{x:-200,y:-100,w:800,h:400}}],strokes:[],markers:[{id:`machine-${i}`,label:`${i+1}层售票`,kind:"tvm" as const,x:10,y:10,floorId:`level-${i}`}]}));
 return{key:"test:six-levels",name:"多层验收站",floors,connections:floors.slice(0,-1).map((f,i)=>({id:`link-${i}`,kind:"stairs",label:"跨层楼梯",from:{x:20,y:20,floorId:f.id},to:{x:20,y:20,floorId:floors[i+1].id}}))};
}
test("all archetypes use cached per-world geometry and match actual platform footprints",()=>{
 for(const seed of [1,2,4]){const d=generateWorld(seed),a=stationAtlas(d),b=stationAtlas(generateWorld(seed));expect(stationAtlas(d)).toBe(a);expect(b).not.toBe(a);expect(a).toEqual(b);
  for(const c of a.connections){expect(a.floors.some(f=>f.id===c.from.floorId)).toBe(true);expect(a.floors.some(f=>f.id===c.to.floorId)).toBe(true);}
  const body=a.floors.find(f=>f.id==="platform")!.shapes.find(s=>s.id==="envelope:platform")!.bounds;expect(Math.min(body.w,body.h)).toBe(14);
 }
 expect(stationAtlas(generateWorld(1)).key).not.toBe(stationAtlas(generateWorld(2)).key);
});
test("six floors with identical XY coordinates are isolated by IDs throughout rendering",()=>{
 const atlas=multiFloorFixture(),frame:MapFrame={player:{x:10,y:10,floorId:"level-4",yaw:0},route:splitRoute([{x:10,y:10,floorId:"level-4"},{x:30,y:20,floorId:"level-4"},{x:30,y:20,floorId:"level-5"},{x:50,y:20,floorId:"level-5"}]),target:null,people:[],facilities:[]};
 for(const floor of atlas.floors){const html=renderToStaticMarkup(createElement(StationMap,{atlas,floor,view:floorViewport(floor,frame.player,240,180,true),frame}));expect(html.includes('data-map-layer="player"')).toBe(floor.id==="level-4");expect(routeVisible(frame,floor.id).length).toBe(["level-4","level-5"].includes(floor.id)?1:0);expect(html).toContain(`data-map-floor="${floor.id}"`);}
});
test("local viewport remains readable for large floors; overview fits all bounds at any aspect",()=>{
 const f=multiFloorFixture().floors[0],p={x:400,y:200,floorId:f.id};
 for(const [width,height] of [[240,180],[160,130],[900,500],[320,680]]){const local=floorViewport(f,p,width,height,false),whole=floorViewport(f,p,width,height,true);expect(local.h).toBeCloseTo(48);expect(local.x+local.w/2).toBe(p.x);expect(whole.x).toBeLessThanOrEqual(f.bounds.x);expect(whole.x+whole.w).toBeGreaterThanOrEqual(f.bounds.x+f.bounds.w);expect(whole.w/whole.h).toBeCloseTo(width/height);}
});
test("dense devices aggregate by kind and separate when sufficiently zoomed in",()=>{
 const f=multiFloorFixture().floors[0],markers=[f.markers[0],{...f.markers[0],id:"nearby",x:10.1}, {...f.markers[0],id:"other-kind",kind:"gate" as const}];
 const small=visibleMarkers(markers,{x:0,y:0,w:80,h:60},240,false);expect(small.map(g=>g.count).sort()).toEqual([1,2]);expect(visibleMarkers(markers,{x:0,y:0,w:20,h:20},500,true)).toHaveLength(3);
});
test("walking uses the remaining actual path; replacement, queueing and cancellation remove stale routes",()=>{
 const e=make();e.player.pos={x:3,y:4,floorId:"concourse"};const path=[{x:7,y:4,floorId:"concourse"},{x:8,y:9,floorId:"concourse"}];e.player.activity={kind:"walking",path,label:"第一目标"};
 expect(captureMapFrame(e).route[0].points).toEqual([e.player.pos,...path]);expect(captureMapFrame(e).player.yaw).toBeCloseTo(Math.PI/2);
 e.player.activity={kind:"walking",path:[{x:15,y:4}],label:"改道"};expect(captureMapFrame(e).target?.label).toBe("改道");expect(captureMapFrame(e).route[0].points.at(-1)?.x).toBe(15);
 e.player.activity={kind:"queued",facility:e.world.layout.FACILITIES[0].id};expect(captureMapFrame(e).route).toEqual([]);expect(captureMapFrame(e).target).not.toBeNull();
 e.player.activity={kind:"idle"};expect(captureMapFrame(e).target).toBeNull();expect(captureMapFrame(e).route).toEqual([]);
 e.world.transit.queue.push(e.player.id);e.player.activity={kind:"to_escalator",path:[{x:999,y:999}]};expect(captureMapFrame(e).route[0].points.at(-1)).toEqual({...e.world.transit.slot(e.world.transit.queue.indexOf(e.player.id)),floorId:"concourse"});
});
test("stairs and escalators retain the source layer until arrival and use real endpoints",()=>{
 const e=make(),l=e.world.layout;
 for(const kind of ["stairs","escalator"] as const){e.player.pos={x:40,y:14,floorId:`transit:${kind}`,elevation:-3};e.player.activity=kind==="stairs"?{kind,remaining:3,duration:6,start:l.STAIRS_TOP,end:l.STAIRS_BOTTOM}:{kind,remaining:5,duration:10};const f=captureMapFrame(e);expect(f.player.floorId).toBe("concourse");expect(f.transition?.progress).toBe(.5);expect(f.target?.floorId).toBe("platform");expect(f.route[0].points.at(-1)?.x).toBe((kind==="stairs"?l.STAIRS_BOTTOM:l.ESCALATOR_BOTTOM).x);}
 e.player.pos={...l.STAIRS_BOTTOM};e.player.activity={kind:"done"};expect(captureMapFrame(e).player.floorId).toBe("platform");expect(captureMapFrame(e).transition).toBeUndefined();
});
test("entrance stairs show only the remaining descent, never a path back uphill",()=>{
 const e=make(),entrance=e.world.definition.entrances![0];
 for(const progress of [0,.4,.99]){e.player.pos=entrancePoint(entrance,progress);e.player.activity={kind:"entering",entranceId:entrance.id,progress,lane:0,fromSource:false};const f=captureMapFrame(e);expect(f.player.floorId).toBe(`entry:${entrance.id}`);expect(f.transition?.progress).toBe(progress);expect(f.target?.floorId).toBe("concourse");const pts=f.route[0].points;for(let i=1;i<pts.length;i++)expect((pts[i].x-pts[i-1].x)*entrance.inward.x+(pts[i].y-pts[i-1].y)*entrance.inward.y).toBeGreaterThanOrEqual(0);}
});
test("upper/lower actors, hidden faults and people outside sight do not leak into the dynamic layer",()=>{
 const e=make();e.player.pos={x:3,y:3,floorId:"concourse"};e.player.activity={kind:"idle"};
 const visible=e.world.addPerson("normal",{x:3.2,y:3,floorId:"concourse"}),lower=e.world.addPerson("normal",{x:3.2,y:3,floorId:"platform"}),far=e.world.addPerson("normal",{x:999,y:999,floorId:"concourse"});
 const hidden=[...e.world.facilities.values()].find(f=>Math.hypot(f.def.pos.x-3,f.def.pos.y-3)>20)!;hidden.status="broken";
 const frame=captureMapFrame(e);expect(frame.people.some(p=>p.id===visible.id)).toBe(true);expect(frame.people.some(p=>p.id===lower.id||p.id===far.id)).toBe(false);expect(frame.facilities.some(f=>f.id===hidden.def.id)).toBe(false);
});
test("capturing and rendering map frames never advances time or mutates activity, queues or RNG",()=>{
 const e=make(),facts=()=>JSON.stringify({t:e.t,p:e.player,persons:[...e.world.persons],facilities:[...e.world.facilities],events:e.world.events,rng:e.world.rng}),before=facts();
 for(let i=0;i<20;i++){const frame=captureMapFrame(e),atlas=stationAtlas(e.world.definition),floor=atlas.floors.find(f=>f.id===frame.player.floorId)!;renderToStaticMarkup(createElement(StationMap,{atlas,floor,view:floor.bounds,frame,showRoute:i%2===0}));}expect(facts()).toBe(before);
});
test("route toggle hides line and target; directional cues remain within the viewport",()=>{
 const atlas=multiFloorFixture(),floor=atlas.floors[0],view={x:0,y:0,w:48,h:36},target={x:500,y:20,floorId:floor.id,label:"远处目标"},frame:MapFrame={player:{x:10,y:10,floorId:floor.id,yaw:0},route:splitRoute([{x:10,y:10,floorId:floor.id},target]),target,people:[],facilities:[]};
 const html=renderToStaticMarkup(createElement(StationMap,{atlas,floor,view,frame,showRoute:false}));expect(html).not.toContain('data-map-layer="route"');expect(html).not.toContain('data-map-layer="edge-target"');const edge=edgeTarget(target,view)!;expect(edge.x).toBeGreaterThan(view.x);expect(edge.x).toBeLessThan(view.w);expect(edge.y).toBeLessThan(view.h);
});
test("route preferences default on, persist off and tolerate blocked browser storage",()=>{
 const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)});expect(readRoutePreference()).toBe(true);saveRoutePreference(false);expect(readRoutePreference()).toBe(false);saveRoutePreference(true);expect(readRoutePreference()).toBe(true);
 vi.stubGlobal("localStorage",{getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("blocked");}});expect(readRoutePreference()).toBe(true);expect(()=>saveRoutePreference(false)).not.toThrow();
});
test("new and old replay maps use only recorded past samples, without end-state NPCs or future routes",()=>{
 const atlas=stationAtlas(generateWorld(1)),frame=getReplayFrame({elapsed:10,trail:[{x:2,y:2,t:0,floorId:"concourse"},{x:4,y:2,t:5,floorId:"concourse"},{x:9,y:2,t:10,floorId:"platform"}],decisions:[]},3),map=replayMapFrame(atlas,frame);expect(map.player.x).toBeCloseTo(3.2);expect(map.route.every(s=>s.floorId==="concourse")).toBe(true);expect(map.people).toEqual([]);expect(map.facilities).toEqual([]);expect(map.target).toBeNull();
 const old=stationAtlas(legacyWorld());expect(old.floors).toHaveLength(1);expect(replayMapFrame(old,{...frame,position:{x:78,y:15}}).player.floorId).toBe("concourse");
});

test("compact station minimaps fit the complete floor with pixel margins and remain centered while moving",()=>{
 for(const seed of [1,2,4])for(const floor of stationAtlas(generateWorld(seed)).floors)for(const [width,height] of [[238,176],[168,132],[360,240]]){
  const p={x:floor.bounds.x,y:floor.bounds.y,floorId:floor.id},view=miniMapViewport(floor,p,width,height),other=miniMapViewport(floor,{...p,x:p.x+floor.bounds.w,y:p.y+floor.bounds.h},width,height);
  expect(miniMapShowsWhole(floor,"auto")).toBe(true);expect(view).toEqual(other);
  expect(view.x+view.w/2).toBeCloseTo(floor.bounds.x+floor.bounds.w/2);expect(view.y+view.h/2).toBeCloseTo(floor.bounds.y+floor.bounds.h/2);
  expect((floor.bounds.x-view.x)/view.w*width).toBeGreaterThanOrEqual(18);expect((floor.bounds.y-view.y)/view.h*height).toBeGreaterThanOrEqual(18);
  expect((view.x+view.w-floor.bounds.x-floor.bounds.w)/view.w*width).toBeGreaterThanOrEqual(18);expect((view.y+view.h-floor.bounds.y-floor.bounds.h)/view.h*height).toBeGreaterThanOrEqual(18);
  expect(view.w/view.h).toBeCloseTo(width/height);
 }
});
test("large floors retain nearby mode by default and can explicitly fit the whole floor",()=>{
 const floor=multiFloorFixture().floors[0],p={x:10,y:10,floorId:floor.id};expect(miniMapShowsWhole(floor,"auto")).toBe(false);expect(miniMapShowsWhole(floor,"whole")).toBe(true);expect(miniMapShowsWhole(floor,"nearby")).toBe(false);
 const view=miniMapViewport(floor,p,240,176,"whole");expect(view.x).toBeLessThan(floor.bounds.x);expect(view.x+view.w).toBeGreaterThan(floor.bounds.x+floor.bounds.w);expect(miniMapViewport(floor,p,240,176,"nearby").h).toBeCloseTo(48);
});

test("pointer zoom preserves the anchored world point, supports panning and clamps zoom limits",()=>{
 const base={x:-30,y:-10,w:100,h:60},initial={zoom:1,pan:{x:0,y:0}};
 for(const anchor of [{x:-10,y:15},{x:40,y:30}]){
  const nav=zoomMapViewport(base,initial,2,anchor),view=mapViewportAtZoom(base,nav);
  expect((anchor.x-view.x)/view.w).toBeCloseTo((anchor.x-base.x)/base.w);expect((anchor.y-view.y)/view.h).toBeCloseTo((anchor.y-base.y)/base.h);
  expect(view.w).toBe(50);expect(view.h).toBe(30);
 }
 expect(zoomMapViewport(base,initial,1000).zoom).toBe(12);expect(zoomMapViewport(base,initial,.0001).zoom).toBe(.65);expect(zoomMapViewport(base,initial,NaN)).toBe(initial);
 const shifted=mapViewportAtZoom(base,{zoom:1,pan:{x:10,y:-5}});expect(shifted.x).toBe(base.x+10);expect(shifted.y).toBe(base.y-5);expect(mapViewportAtZoom(base,initial)).toEqual(base);
});
test("compact markers shrink without reducing the expanded map's readable size",()=>{
 const atlas=multiFloorFixture(),floor=atlas.floors[0],view=floor.bounds;
 const small=renderToStaticMarkup(createElement(StationMap,{atlas,floor,view})),large=renderToStaticMarkup(createElement(StationMap,{atlas,floor,view,expanded:true}));
 expect(small).toContain('data-marker-size="12.24"');expect(large).toContain('data-marker-size="18"');
});
