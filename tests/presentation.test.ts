import { expect, test } from "vitest";
import { Engine } from "../src/sim/engine";
import { captureScene, PresentationBuffer, sampleActor } from "../src/ui/presentation";

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
  engine.applyAction({ type: "attempt_creative", intent: "翻闸", reason: "test" }, "jump_gate");
  for (let i = 0; i < 10; i++) engine.step();
  buffer.capture(engine);
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
  engine.player.pos = { x: 48, y: 15 };
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
  expect(engine.player.pos).toEqual({ x: 57, y: 15 });
});
