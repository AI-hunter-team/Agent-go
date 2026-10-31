import { describe, expect, test } from "vitest";
import type { AlertRecord } from "../src/shared/types";
import { createFixtureEngine } from "./fixtures/scenarios";
import { NpcDirector } from "../src/sim/npc";
import { emptyScenario } from "./fixtures/scenarios";

const record = (npcId: string, level: AlertRecord["level"] = "red"): AlertRecord => ({ observerId: npcId, subjectId: "player", level, ring: 0, hiddenFor: 0, since: 0, causeEventId: "unknown", reaction: null });

describe("NPC reactions and memory", () => {
  test("personality selects different responses to the same red alert, once per colour", () => {
    const e = createFixtureEngine(); const w = e.world;
    const shy = w.addPerson("normal",{x:7,y:15}), bold = w.addPerson("normal",{x:9,y:15});
    shy.persona!.traits = { vanity: .5, courage: 0, temper: 0, fairness: 0, meddling: 0 };
    bold.persona!.traits = { vanity: .5, courage: 1, temper: 1, fairness: 0, meddling: 0 };
    const a = e.npcBrain.choose(shy,e.player,record(shy.id)), b = e.npcBrain.choose(bold,e.player,record(bold.id));
    expect(a).toBe("flee"); expect(b).toBe("confront");
    for (let i=0;i<10;i++) expect(e.npcBrain.choose(shy,e.player,record(shy.id))).toBe(a);
  });
  test("a report walks within shout distance and carries only the last seen location", () => {
    const e = createFixtureEngine(undefined,[{ id:"guard",label:"保安",route:[{x:23,y:15}],facing:0,speed:0,pauseSeconds:0 }]);
    const n = e.world.addPerson("normal",{x:8,y:15}); e.player.pos = {x:7,y:15}; n.facing = Math.PI;
    e.npcBrain.react(n,e.player,record(n.id),e.player.pos,"report");
    e.player.pos = {x:60,y:28};
    e.npcBrain.step(); expect(e.events.events.filter((v)=>v.kind==="report")).toHaveLength(0);
    for(let i=0;i<250;i++) { e.world.t += .1; e.npcBrain.step(); }
    const report = e.events.events.find((v)=>v.kind==="report")!;
    expect(report).toBeDefined(); expect(report.pos.x).toBeGreaterThanOrEqual(15);
    expect(report.aboutPos).toEqual({x:7,y:15}); expect(report.aboutId).toBe("player");
  });
  test("a nearby guard behind an occluding wall does not receive a report", () => {
    const e = createFixtureEngine(undefined,[{id:"guard",label:"保安",route:[{x:29,y:2}],facing:0,speed:0,pauseSeconds:0}]);
    const n=e.world.addPerson("normal",{x:23,y:2});
    e.npcBrain.react(n,e.player,record(n.id),{x:10,y:2},"report"); e.npcBrain.step();
    expect(e.events.events.some((v)=>v.kind==="report")).toBe(false);
  });
  test("a passenger whose ticket was stolen returns from security to buy a replacement unless red", () => {
    const e=createFixtureEngine(); const n=e.world.addPerson("normal",{x:18,y:15},{hasTicket:true});
    const ticket=e.world.items.holdings(n.id)[0];
    e.world.items.move(ticket.id,{type:"held",personId:"player",slot:"pocket"},"snatch");
    const security=[...e.world.facilities.values()].find((f)=>f.def.kind==="security")!;
    security.queue.push(n.id); n.activity={kind:"queued",facility:security.def.id};
    e.npcBrain.step(); expect(n.activity.kind).toBe("idle"); expect(security.queue).not.toContain(n.id);
    new NpcDirector(e.world,emptyScenario()).step();
    expect(n.activity.kind).toBe("to_queue");
    const activity = e.world.persons.get(n.id)!.activity;
    if(activity.kind==="to_queue") expect(e.world.facility(activity.facility)!.def.kind).toBe("tvm");
  });
  test("memory is bounded and reacting/knocked out NPCs are not assigned new actions", () => {
    const e=createFixtureEngine(); const n=e.world.addPerson("normal",{x:8,y:15});
    for(let i=0;i<20;i++) e.npcBrain.remember(n.id,{t:i,about:"player",kind:"test",text:"字".repeat(60)});
    const entries=e.npcBrain.memory.get(n.id)!; expect(entries).toHaveLength(12); expect(entries[0].t).toBe(8); expect(entries.every((v)=>[...v.text].length===40)).toBe(true);
    e.npcBrain.react(n,e.player,record(n.id,"white"),e.player.pos,"glance");
    const director=new NpcDirector(e.world,emptyScenario()); director.step(); expect(n.activity.kind).toBe("reacting");
    e.world.knockOut(n,20); director.step(); expect(n.activity.kind).toBe("idle");
  });
});
