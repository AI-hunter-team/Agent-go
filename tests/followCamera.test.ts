import { expect, test } from "vitest";
import { FollowCamera } from "../src/ui/scene/followCamera";
import { cameraFraction } from "../src/ui/scene/cameraCollision";

const orbit = { yaw: 0, pitch: 0.16, distance: 4.2 };
const frame = 1 / 60;

test("NPC avoidance and facility-facing turns do not swing the follow camera", () => {
  const camera = new FollowCamera();
  const pose = { x: 10, y: 0, z: 15, yaw: Math.PI / 2 };
  camera.update(pose, orbit, frame);
  const eye = { ...camera.position };
  // A blocked walker reverses headings, then turns to interact without moving its feet.
  for (let tick = 0; tick < 120; tick++) {
    pose.yaw = tick % 2 ? -Math.PI / 2 : Math.PI;
    camera.update(pose, orbit, frame);
    expect(camera.position).toEqual(eye);
    expect(camera.target).toEqual({ x: 10, y: 1.25, z: 15 });
  }
  camera.update(pose, { ...orbit, yaw: Math.PI / 2 }, frame);
  expect(camera.position.z).toBeCloseTo(19.2);
  camera.reset();
  camera.update(pose, orbit, frame);
  expect(camera.position.x).toBeCloseTo(14.2);
  expect(camera.position.z).toBeCloseTo(15);
});

test("centimeter collision corrections are damped and frozen views finish settling", () => {
  const camera = new FollowCamera();
  const pose = { x: 10, y: 0, z: 15, yaw: Math.PI / 2 };
  camera.update(pose, orbit, frame);
  let last = camera.position.z, largestStep = 0;
  for (let tick = 0; tick < 120; tick++) {
    pose.z = 15 + (tick % 2 ? 0.03 : -0.03);
    camera.update(pose, orbit, frame);
    largestStep = Math.max(largestStep, Math.abs(camera.position.z - last));
    last = camera.position.z;
  }
  expect(largestStep).toBeLessThan(0.01);
  pose.x = 11; pose.z = 15;
  for (let tick = 0; tick < 120; tick++) camera.update(pose, orbit, frame);
  expect(camera.target.x).toBeCloseTo(11);
  expect(camera.settled).toBe(true);
});

test("pillar-edge clipping stays safe without repeatedly springing back to full distance", () => {
  const camera = new FollowCamera();
  const pose = { x: 34, y: 0, z: 12, yaw: -Math.PI / 2 };
  camera.update(pose, orbit, frame);
  const shortDistance = camera.position.x - camera.target.x;
  expect(shortDistance).toBeLessThan(1);
  // Orbit alternately just misses or hits the nearby column for a single frame.
  for (let tick = 0; tick < 60; tick++) {
    camera.update(pose, { ...orbit, yaw: tick % 2 ? 0 : Math.PI / 2 }, frame);
    const distance = Math.hypot(camera.position.x - camera.target.x, camera.position.z - camera.target.z);
    expect(distance).toBeLessThan(1);
    expect(cameraFraction(camera.target, camera.position)).toBe(1);
  }
  for (let tick = 0; tick < 240; tick++) camera.update(pose, { ...orbit, yaw: Math.PI / 2 }, frame);
  expect(Math.hypot(camera.position.x - camera.target.x, camera.position.z - camera.target.z)).toBeCloseTo(orbit.distance, 3);
  expect(camera.settled).toBe(true);
});
