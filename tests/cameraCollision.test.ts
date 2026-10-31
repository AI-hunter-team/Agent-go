import { expect, test } from "vitest";
import { cameraFraction } from "../src/ui/scene/cameraCollision";

test("camera clips columns and low railings at their actual heights", () => {
  expect(cameraFraction({ x: 34, y: 1.5, z: 12 }, { x: 40, y: 2, z: 12 })).toBeLessThan(0.2);
  expect(cameraFraction({ x: 25, y: 1.5, z: 9 }, { x: 29, y: 2, z: 9 })).toBe(1);
  expect(cameraFraction({ x: 25, y: 0.7, z: 9 }, { x: 29, y: 0.7, z: 9 })).toBeLessThan(0.3);
  expect(cameraFraction({ x: 25, y: 1.5, z: 15 }, { x: 29, y: 2, z: 15 })).toBe(1);
});

test("ceiling and outer walls cover both levels and the updated station width", () => {
  expect(cameraFraction({ x: 10, y: 1.5, z: 15 }, { x: 10, y: 8, z: 15 })).toBeLessThan(0.7);
  expect(cameraFraction({ x: 65, y: -0.5, z: 29 }, { x: 65, y: -0.5, z: 33 })).toBeLessThan(0.3);
  expect(cameraFraction({ x: 60, y: -0.7, z: 15 }, { x: 64, y: 0, z: 15 })).toBe(1);
});


test("camera avoids south-facing TVMs, commercial objects and both relocated descent rails", () => {
  expect(cameraFraction({ x: 10, y: 1.2, z: 5.1 }, { x: 10, y: 1.2, z: 2 })).toBeLessThan(0.5);
  expect(cameraFraction({ x: 30.5, y: 1.5, z: 4.5 }, { x: 30.5, y: 1.5, z: 1 })).toBeLessThan(0.5);
  expect(cameraFraction({ x: 67, y: -0.5, z: 9 }, { x: 67, y: -0.5, z: 5 })).toBeLessThan(0.5);
  expect(cameraFraction({ x: 67, y: -0.5, z: 22 }, { x: 67, y: -0.5, z: 18 })).toBeLessThan(0.4);
  expect(cameraFraction({ x: 53, y: -0.5, z: 15 }, { x: 53, y: -0.5, z: 11 })).toBe(1);
});
