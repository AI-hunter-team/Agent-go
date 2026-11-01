import { expect, test } from "vitest";
import { FACILITIES } from "../src/sim/layout";
import { NpcDirector } from "../src/sim/npc";
import { buildScenario } from "../src/sim/scenario";
import { World } from "../src/sim/world";
import { generateWorld } from "../src/sim/worldDefinition";

test("optional seeded failures vary by equipment and timing, with about 50 percent occurrence and no default outage", () => {
  const gates=new Set<string>(),tvms=new Set<string>(),security=new Set<string>(),times=new Set<number>();
  const counts={gate:0,tvm:0,security:0,recheck:0};
  for(let seed=1;seed<=400;seed++) {
    const scenario=buildScenario(seed);expect(buildScenario(seed)).toEqual(scenario);
    const [gate]=Object.keys(scenario.initialStatus);
    if(gate){counts.gate++;gates.add(gate);expect(scenario.initialStatus[gate]).toBe("broken");expect(scenario.spawns.some(s=>s.startQueue===gate)).toBe(false);}
    const world=new World(seed);new NpcDirector(world,scenario);
    expect([...world.facilities.values()].filter(f=>f.def.kind==="gate"&&f.status==="open")).toHaveLength(gate?4:5);
    for(const e of scenario.events) {
      expect(e.type).not.toBe("power");
      if(e.type==="status"&&e.status==="broken") {counts.tvm++;tvms.add(e.facility);times.add(e.t);expect(e.t).toBeGreaterThanOrEqual(20);expect(e.t).toBeLessThanOrEqual(40);expect(FACILITIES.find(f=>f.id===e.facility)?.kind).toBe("tvm");}
      if(e.type==="status"&&e.status==="closed") {counts.security++;security.add(e.facility);expect(e.t).toBeGreaterThanOrEqual(35);expect(e.t).toBeLessThanOrEqual(60);expect(e.broadcast).toContain(FACILITIES.find(f=>f.id===e.facility)!.label);}
      if(e.type==="recheck") {counts.recheck++;expect(e.t).toBeGreaterThanOrEqual(50);expect(e.t).toBeLessThanOrEqual(75);}
    }
  }
  for(const count of Object.values(counts)){expect(count).toBeGreaterThan(160);expect(count).toBeLessThan(240);}
  expect([...gates].sort()).toEqual(["G1","G2","G3","G4","G5"]);
  expect([...tvms].sort()).toEqual(["TVM-1","TVM-2","TVM-3"]);
  expect([...security].sort()).toEqual(["S1","S2","S3"]);expect(times.size).toBe(21);
});

test("crowd and deadline settings cannot change the seeded failure schedule",()=>{
  for(const seed of [1,2,6,17,200]){
    const plain=buildScenario(seed,{extraQueuePeople:0}),crowded=buildScenario(seed,{extraQueuePeople:8,timeLimitSeconds:60});
    expect(crowded.initialStatus).toEqual(plain.initialStatus);expect(crowded.events).toEqual(plain.events);
    expect(crowded.spawns.filter(s=>!s.startQueue)).toEqual(plain.spawns.filter(s=>!s.startQueue));
  }
});


test("generated layouts close a real security lane and recheck an open lane", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const definition = generateWorld(seed), scenario = buildScenario(seed, {}, definition.layout);
    const closure = scenario.events.find(e => e.type === "status" && e.status === "closed");
    const recheck = scenario.events.find(e => e.type === "recheck");
    const lanes = definition.layout.FACILITIES.filter(f => f.kind === "security");
    if (closure) expect("facility" in closure && lanes.some(f => f.id === closure.facility)).toBe(true);
    if (recheck) expect(lanes.some(f => f.id === recheck.facility)).toBe(true);
    if (closure && recheck && "facility" in closure) expect(recheck.facility).not.toBe(closure.facility);
    expect(buildScenario(seed, {}, definition.layout)).toEqual(scenario);
  }
});
