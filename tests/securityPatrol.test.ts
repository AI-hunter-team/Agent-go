import {expect,test} from "vitest";
import {Engine} from "../src/sim/engine";
import {GuardSystem} from "../src/sim/guards";
import {DT,GUARDS,SECURITY_STAFF} from "../src/sim/scenario";
import {clearOfScenery,personRadius} from "../src/sim/movement";
import {angleDiff,angleTo,dist} from "../src/sim/geometry";
import {emptyScenario} from "./fixtures/scenarios";
import {publicActionKnowledge} from "../server/actionKnowledge";
import {PresentationBuffer,sampleActor} from "../src/ui/presentation";

const capturedPoint={x:18.913480250023543,y:5.621644999874308};
test("all normal seeds have three officers with one roaming security officer, with no timed reinforcement",()=>{
  for(const seed of [1,9,21996796]) {
    const e=new Engine(seed);
    expect(e.guards.guards).toHaveLength(3);
    expect(e.guards.guards.filter(g=>g.role==="security_staff")).toHaveLength(1);
    expect(e.guards.guards.map(g=>g.def.id)).toEqual(["guard-A","guard-B","security-S2"]);
    for(let i=0;i<400;i++)e.step();
    expect(e.guards.guards).toHaveLength(3);
  }
  expect(publicActionKnowledge()).toContain("常规执勤为3人");
});

test("the security officer walks a collision-safe north-south route, turns and returns deterministically",()=>{
  const a=new GuardSystem(SECURITY_STAFF),b=new GuardSystem(SECURITY_STAFF),ys:number[]=[],headings=new Set<number>();
  for(let i=0;i<700;i++) {
    const before={...a.guards[0].pos};a.step();b.step();const g=a.guards[0];ys.push(g.pos.y);
    expect(clearOfScenery(before,g.pos,personRadius("guard"))).toBe(true);
    if(dist(before,g.pos)>1e-6) {expect(angleDiff(g.facing,angleTo(before,g.pos))).toBeLessThan(1e-6);headings.add(Math.sign(g.facing));}
  }
  expect(Math.min(...ys)).toBeLessThan(5);expect(Math.max(...ys)).toBeGreaterThan(25);
  expect(headings).toEqual(new Set([-1,1]));expect(a.guards.map(g=>[g.pos,g.facing])).toEqual(b.guards.map(g=>[g.pos,g.facing]));
});

test("the captured hit point had overlapping stationary coverage, while patrol now gives real windows",()=>{
  const old=new GuardSystem([
    ...GUARDS,
    ...[3.5,12.5,26.5].map((y,i)=>({id:`security-S${i+1}`,label:`旧安检员${i+1}`,role:"security_staff" as const,route:[{x:28.5,y}],facing:Math.PI,speed:.9,pauseSeconds:0})),
  ]);
  expect(old.guards.filter(g=>old.canSee(g,capturedPoint)).map(g=>g.def.id)).toEqual(["security-S1","security-S2"]);
  const patrol=new GuardSystem([...GUARDS,...SECURITY_STAFF]);let gap=0,longest=0;
  for(let i=0;i<600;i++) {
    patrol.step();gap=patrol.seenBy(capturedPoint)?0:gap+DT;longest=Math.max(longest,gap);
    if(i===312)expect(patrol.seenBy(capturedPoint)).toBeNull();
  }
  expect(longest).toBeGreaterThan(3); // More than the actual .5s strike, without disabling sight.
});

test("a real strike can start and finish its attempt in a patrol gap, but a watched strike still loses",()=>{
  const gap=new Engine(21996796,{},emptyScenario(21996796));
  gap.player.pos={...capturedPoint};
  for(let i=0;i<313;i++)gap.step();
  const victim=gap.world.addPerson("normal",{x:capturedPoint.x-.9,y:capturedPoint.y});victim.activity={kind:"waiting",remaining:100};
  expect(gap.guards.seenBy(gap.player.pos)).toBeNull();
  expect(gap.applyAction({type:"physical_action",action:"strike",npcId:victim.id,aim:"knockout",reason:"巡逻空档的一次尝试"}).ok).toBe(true);
  for(let i=0;i<6;i++)gap.step();
  expect(gap.events.events.some(v=>v.kind==="strike")).toBe(true);expect(gap.status).toBe("running");
  expect(gap.executor.lifecycle.some(row=>row.step.op==="strike" && row.phase==="completed")).toBe(true);

  const watched=new Engine(1,{},emptyScenario());watched.player.pos={x:25.3,y:10};
  const target=watched.world.addPerson("normal",{x:24.4,y:10});target.activity={kind:"waiting",remaining:100};
  expect(watched.guards.seenBy(watched.player.pos)?.def.id).toBe("security-S2");
  watched.applyAction({type:"physical_action",action:"strike",npcId:target.id,aim:"knockout",reason:"视线内测试"});
  expect(watched.status).toBe("failed");expect(watched.failReason).toContain("确认击打行为");
});

test("the formal scene and role observation use the patrol's real positions and headings",()=>{
  const e=new Engine(1,{},emptyScenario());e.player.pos={x:25.3,y:10};
  const start={...e.guards.guards[2].pos};
  for(let i=0;i<60;i++)e.step();
  const guard=e.guards.guards[2],observation=e.observe().guards.find(g=>g.id===guard.def.id)!;
  expect(guard.pos.y).toBeGreaterThan(start.y+2);expect(observation.position.x).toBeCloseTo(guard.pos.x);expect(observation.position.y).toBeCloseTo(guard.pos.y,1);
  const buffer=new PresentationBuffer(e),pose={x:0,y:0,z:0,yaw:0};sampleActor(buffer,guard.def.id,1,pose);
  expect(pose.z).toBe(guard.pos.y);expect(pose.yaw).toBeCloseTo(Math.PI/2-guard.facing);
});
