import { expect, test } from "vitest";
import { FrameMetrics } from "../src/ui/frameMetrics";

test("FPS is frames over total elapsed time; P95 includes slow frames", () => {
  const metrics = new FrameMetrics();
  metrics.start();
  for (const seconds of [0.01, 0.01, 0.04]) metrics.push(seconds);
  expect(metrics.summary()).toMatchObject({ fps: 50, p95Ms: 40, frames: 3 });
});
test("measurement stops at sixty seconds and a fresh sample has no old frames", () => {
  const metrics = new FrameMetrics();
  metrics.start();
  for (let i = 0; i < 61; i++) metrics.push(1);
  expect(metrics.summary()).toMatchObject({ active: false, seconds: 60, frames: 60 });
  metrics.start();
  expect(metrics.summary()).toMatchObject({ active: true, seconds: 0, frames: 0, fps: 0 });
});

test("completed measurements retain their environment and peak actor count", () => {
  const metrics = new FrameMetrics();
  metrics.environment = { gpu: "test GPU", width: 1280, actors: 23 };
  metrics.start(); metrics.push(30);
  metrics.environment.actors = 40; metrics.push(30);
  metrics.environment.gpu = "another GPU"; metrics.environment.actors = 100;
  expect(metrics.summary()).toMatchObject({ gpu: "test GPU", actorsStart: 23, actors: 40, maxActors: 40, active: false });
});
