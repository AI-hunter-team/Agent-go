import { expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { World } from "../src/sim/world";
import { NpcDirector } from "../src/sim/npc";
import { generateWorld, hydrateWorld, serializableWorld } from "../src/sim/worldDefinition";
import { entrancePoint, displayFloor, worldViewBounds } from "../src/sim/entranceGeometry";
import { GameRunner } from "../src/agent/runner";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { classifyByKeywords } from "../src/sim/intent";
import { cameraFraction } from "../src/ui/scene/cameraCollision";
import { dist } from "../src/sim/geometry";

const classifier = async (text: string) => classifyByKeywords(text);

test.each([2, 4, 19])("enters continuously before the first agent decision (seed %i)", seed => {
  const d = generateWorld(seed), e = new Engine(seed, {}, undefined, undefined, d), calls: number[] = [];
  const heuristic = new HeuristicAgent();
  const agent = { kind: "offline" as const, decide: (turn: Parameters<HeuristicAgent["decide"]>[0]) => { calls.push(e.t); return heuristic.decide(turn); }, dispose: () => heuristic.dispose() };
  const r = new GameRunner(e, agent, classifier), entry = d.entrances![0];
  expect(e.player.pos).toEqual(entry.top); expect(e.player.activity.kind).toBe("entering");
  expect(e.applyAction({ type: "move_to", target: "TICKETS_C", reason: "不能中断入站" }).ok).toBe(false);
  r.start(); r.advance(30);
  expect(calls).toHaveLength(0); expect(e.player.pos.elevation).toBeGreaterThan(0); expect(e.player.pos.elevation).toBeLessThan(4);
  r.advance(80);
  expect(calls).toHaveLength(1); expect(calls[0]).toBeGreaterThan(6); expect(e.player.pos.floorId).toBe("concourse"); expect(e.player.onPlatform).toBe(false);
  expect(e.trail.some(p => p.connector === "entrance" && p.progress! > 0 && p.elevation! > 0)).toBe(true);
  r.stop();
});

test("all new generated passengers originate in an entry passage", () => {
  const e = new Engine(19, {}, undefined, undefined, generateWorld(19)), existing = new Set(e.world.persons.keys());
  const seen = new Set(existing); let arrivals = 0;
  e.world.transit.nextCrowdAt = 0; // The old paid-area spawner must remain disabled.
  for (let i = 0; i < 220; i++) {
    e.step();
    for (const p of e.world.persons.values()) if (!seen.has(p.id)) {
      seen.add(p.id); arrivals++;
      expect(p.entryOrigin).toMatch(/^[AB]$/); expect(p.activity.kind).toBe("entering"); expect(p.pos.elevation).toBe(4);
      const source = e.world.definition.entrances!.find(en => en.id === p.entryOrigin)!.source;
      expect(Math.hypot(p.pos.x - source.x, p.pos.y - source.y)).toBeLessThan(1);
    }
  }
  expect(arrivals).toBeGreaterThan(2);
});

test("an occupied source delays a passenger instead of overlapping or relocating it", () => {
  const d = generateWorld(2), entry = d.entrances![0], w = new World(2, 150, undefined, { ...d, entrances: [entry] });
  const blocker = w.addPerson("luggage", entry.source);
  const director = new NpcDirector(w, { seed: 2, events: [], initialStatus: {}, spawns: [{ t: 0, kind: "luggage", hasCard: true, irritable: false, startQueue: null }] }, false);
  director.step(); expect(w.persons.size).toBe(1);
  w.persons.delete(blocker.id); director.step();
  expect(w.persons.size).toBe(1); const p = [...w.persons.values()][0];
  expect(p.entryOrigin).toBe(entry.id); expect(p.pos.floorId).toBe(`entry:${entry.id}`); expect(p.pos.elevation).toBe(4);
});

test("entry waits for a clear concourse handoff and then completes", () => {
  const d = generateWorld(2), w = new World(2, 150, undefined, d), entry = d.entrances![0];
  const p = w.addPerson("player", entry.top, { isPlayer: true }), blocker = w.addPerson("normal", entry.bottom);
  w.entry.begin(p, entry);
  for (let i = 0; i < 120; i++) { w.t += .1; w.stepPeopleAndFacilities(); }
  expect(p.activity.kind).toBe("entering"); expect(dist(p.pos, blocker.pos)).toBeGreaterThanOrEqual(.64);
  w.persons.delete(blocker.id);
  for (let i = 0; i < 120 && p.activity.kind === "entering"; i++) { w.t += .1; w.stepPeopleAndFacilities(); }
  expect(p.pos).toEqual(entry.bottom); expect(p.onPlatform).toBe(false);
});

test.each([2, 4, 19])("keeps the camera doorway open and corridor side walls solid (seed %i)", seed => {
  const d = generateWorld(seed), en = d.entrances![0], q = en.inward;
  const target = { x: en.bottom.x, y: 1.3, z: en.bottom.y }, behind = { x: en.foot.x - q.x * 2, y: 2.6, z: en.foot.y - q.y * 2 };
  expect(cameraFraction(target, behind, d)).toBeGreaterThan(.95);
  const offset = (p: typeof target) => ({ ...p, x: p.x - q.y * 2.5, z: p.z + q.x * 2.5 });
  expect(cameraFraction(offset(target), offset(behind), d)).toBeLessThan(.8);
});

test("saves entry geometry and supports recordings that predate it", () => {
  const d = generateWorld(4), saved = serializableWorld(d), restored = hydrateWorld(saved);
  expect(restored.entrances).toEqual(d.entrances);
  const b = worldViewBounds(d); for (const en of d.entrances!) expect(en.source.x >= b.x && en.source.x <= b.x + b.w && en.source.y >= b.y && en.source.y <= b.y + b.h).toBe(true);
  expect(displayFloor(entrancePoint(d.entrances![0], .2).floorId)).toBe("concourse");
  delete saved.entrances;
  expect(new Engine(4, {}, undefined, undefined, hydrateWorld(saved)).player.activity.kind).toBe("idle");
  expect(new Engine(4).player.activity.kind).toBe("idle");
});

test("an arriving passenger can pass someone waiting beside the entrance",()=>{
  const d=generateWorld(2),w=new World(2,150,undefined,d),entry=d.entrances![0];
  w.addPerson("player",entry.bottom,{isPlayer:true});
  const arriving=w.addPerson("luggage",entry.source);w.entry.begin(arriving,entry,.9,true);
  for(let i=0;i<220&&arriving.activity.kind==="entering";i++){w.t+=.1;w.stepPeopleAndFacilities();}
  expect(arriving.activity.kind).toBe("idle");expect(arriving.pos.floorId).toBe("concourse");
  expect(dist(arriving.pos,w.player!.pos)).toBeGreaterThanOrEqual(.82);
});
