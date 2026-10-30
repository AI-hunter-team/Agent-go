import { expect, test } from "vitest";
import { cameraFraction } from "../src/ui/scene/cameraCollision";

test("camera is pulled in before an opaque column or wall, but not in an open lane", () => {
  expect(cameraFraction({ x: 34, y: 1.5, z: 12 }, { x: 40, y: 2, z: 12 })).toBeLessThan(0.2);
  expect(cameraFraction({ x: 25, y: 1.5, z: 9 }, { x: 29, y: 2, z: 9 })).toBeLessThan(0.3);
  expect(cameraFraction({ x: 25, y: 1.5, z: 15 }, { x: 29, y: 2, z: 15 })).toBe(1);
});
