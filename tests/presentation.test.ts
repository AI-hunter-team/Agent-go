import { expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { captureScene, PresentationBuffer, sampleActor } from "../src/ui/presentation";
import { STAIRS_TOP, STAIRS_BOTTOM } from "../src/sim/layout";

test("consecutive lines from one NPC replace its bubble without dropping other speakers or history", () => {
  const engine = new Engine(1);
  engine.world.t = 11;
  engine.world.log("speech", "p2：我在等人。", true);
  for (let i = 0; i < 10; i++) {
    engine.world.t = 11 + i / 10;
    engine.world.log("speech", `p1：第${i + 1}句`, true);
  }
  const snapshot = captureScene(engine);
  expect(snapshot.speech).toEqual([
    { speakerId: "p2", text: "我在等人。", t: 11 },
    { speakerId: "p1", text: "第10句", t: 11.9 },
  ]);
  expect(engine.world.events.filter(event => event.kind === "speech")).toHaveLength(11);
});

test("snapshots are copies, and rendering cannot change world facts", () => {
  const engine = new Engine(1);
  const before = JSON.stringify([...engine.world.persons.values()]);
  const buffer = new PresentationBuffer(engine);
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  for (let i = 0; i <= 100; i++) sampleActor(buffer, "player", i / 100, pose);
  expect(JSON.stringify([...engine.world.persons.values()])).toBe(before);
  expect(Object.isFrozen(buffer.current.actors.get("player"))).toBe(true);
  const snapshot = captureScene(engine);
  engine.player.pos.x += 1;
  expect(snapshot.actors.get("player")!.x).not.toBe(engine.player.pos.x);
});

test("interpolation stays between ticks and reset never blends two games", () => {
  const engine = new Engine(1);
  const buffer = new PresentationBuffer(engine);
  engine.applyAction({ type: "move_to", target: "HALL_W", reason: "test" });
  engine.step();
  buffer.capture(engine);
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  sampleActor(buffer, "player", 0.5, pose);
  expect(pose.x).toBeGreaterThan(2);
  expect(pose.x).toBeLessThan(engine.player.pos.x);
  buffer.reset(new Engine(2));
  sampleActor(buffer, "player", 0.5, pose);
  expect(pose.x).toBe(2);
  expect(buffer.previous).toBe(buffer.current);
});

test("jump height is a visual offset, and guard facing maps the planar axes correctly", () => {
  const engine = new Engine(1);
  engine.player.pos = { x: 43, y: 2 };
  engine.guards.guards[0].facing = Math.PI;
  const buffer = new PresentationBuffer(engine);
  expect(buffer.current.actors.get("guard-A")!.yaw).toBeCloseTo(-Math.PI / 2);
  // Isolate the active jump animation from guard failure/cancellation.
  engine.guards.guards.splice(0);
  engine.applyAction({ type: "attempt_creative", intent: "翻闸", reason: "test" }, "jump_gate");
  for (let i = 0; i < 10; i++) engine.step();
  buffer.capture(engine);
  expect(engine.status).toBe("running");
  const actual = { ...engine.player.pos };
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  sampleActor(buffer, "player", 0.5, pose);
  expect(pose.y).toBeGreaterThan(0);
  expect(pose.z).toBe(2);
  expect(engine.player.pos).toEqual(actual);
  expect(engine.score).toBeNull();
});

test("stairs lower the displayed player to the platform without changing simulation facts", () => {
  const engine = new Engine(1);
  engine.player.pos = { ...STAIRS_TOP };
  engine.player.passedGate = true;
  expect(engine.applyAction({ type: "descend_stairs", reason: "test" }).ok).toBe(true);
  const buffer = new PresentationBuffer(engine);
  for (let i = 0; i < 30; i++) engine.step();
  buffer.capture(engine);
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  sampleActor(buffer, "player", 1, pose);
  expect(pose.y).toBeCloseTo(-1);
  expect(engine.player.onPlatform).toBe(false);
  for (let i = 0; i < 30; i++) engine.step();
  buffer.capture(engine);
  sampleActor(buffer, "player", 1, pose);
  expect(pose.y).toBe(-2);
  expect(engine.status).toBe("success");
  expect(engine.player.pos).toEqual(STAIRS_BOTTOM);
});

test("queued and serving actors turn toward their facility after arriving from the side", () => {
  for (const facilityId of ["TVM-2", "S2", "G2"]) for (const kind of ["queued", "service"] as const) {
    const engine = new Engine(1);
    engine.world.persons.clear();
    engine.world.items.items.clear();
    const f = engine.world.facility(facilityId)!;
    const p = engine.world.addPerson("player", { x: f.def.head.x, y: f.def.head.y - 1 }, { isPlayer: true });
    const buffer = new PresentationBuffer(engine);
    p.pos = { ...f.def.head };
    p.activity = { kind, facility: facilityId };
    if (kind === "queued") f.queue = [p.id];
    else { f.queue = []; f.serving = { personId: p.id, remaining: 5, recheck: false }; }
    engine.world.t += 0.1;
    buffer.capture(engine);
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    sampleActor(buffer, p.id, 1, pose);
    expect(pose.yaw).toBeCloseTo(f.def.kind === "tvm" ? Math.PI : Math.PI / 2);
    expect(buffer.current.actors.get(p.id)!.motion).toBe(kind === "service" ? "interact" : "walk");
  }
});

test("interaction snapshots copy directed badges, physical items and expiring speech", () => {
  const e=new Engine(1);
  e.alerts.records.set("test",{observerId:"p1",subjectId:"player",level:"yellow",ring:.4,hiddenFor:0,since:0,causeEventId:"e1",reaction:null});
  const item=e.world.items.spawn("umbrella",{type:"ground",pos:{x:7,y:15}},null);
  e.world.log("speech","p1：请注意排队",true);
  const s=captureScene(e);
  expect(s.alerts).toEqual([{observerId:"p1",subjectId:"player",level:"yellow",ring:.4}]);
  expect(s.items.find(i=>i.id===item.id)).toMatchObject({x:7,z:15,kind:"umbrella"});
  expect(s.speech[0].text).toBe("请注意排队");
  e.alerts.records.get("test")!.ring=.8;
  expect(s.alerts[0].ring).toBe(.4);
  e.world.t=5;
  expect(captureScene(e).speech).toHaveLength(0);
  expect(JSON.stringify(e.observe())).not.toContain('"ring"');
});
test("NPC collision reversals and arrival transitions have bounded visual turns", () => {
  const engine = new Engine(1);
  engine.world.persons.clear();
  const p = engine.world.addPerson("normal", { x: 10, y: 15 });
  p.activity = { kind: "walking", path: [{ x: 15, y: 15 }], label: "test" };
  let scene = captureScene(engine);
  for (let tick = 0; tick < 20; tick++) {
    const old = scene.actors.get(p.id)!;
    p.pos.y += tick % 2 ? 0.08 : -0.08;
    engine.world.t += 0.1;
    scene = captureScene(engine, scene);
    const actor = scene.actors.get(p.id)!;
    expect(Math.abs(actor.yaw - old.yaw)).toBeLessThanOrEqual(0.4 + 1e-8);
    expect(actor.x).toBe(p.pos.x);
    expect(actor.z).toBe(p.pos.y);
  }
  const stopped = scene.actors.get(p.id)!.yaw;
  engine.world.t += 0.1;
  scene = captureScene(engine, scene);
  expect(scene.actors.get(p.id)!.yaw).toBe(stopped);
  p.activity = { kind: "queued", facility: "TVM-2" };
  for (let tick = 0; tick < 20; tick++) { engine.world.t += 0.1; scene = captureScene(engine, scene); }
  const buffer = new PresentationBuffer(engine);
  buffer.previous = buffer.current = scene;
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  sampleActor(buffer, p.id, 1, pose);
  const facility = engine.world.facility("TVM-2")!.def;
  expect(pose.yaw).toBeCloseTo(Math.atan2(facility.pos.x - p.pos.x, facility.pos.y - p.pos.y));
});
