import { expect, test } from "vitest";
import { DEFAULT_PERFORMANCE_SETTINGS, ECONOMY_SETTINGS, parsePerformanceSettings } from "../src/ui/performanceSettings";

test("damaged or unsupported display preferences restore safe per-field defaults", () => {
  for (const raw of [null, "bad JSON", "null", "[]", "42"]) {
    expect(parsePerformanceSettings(raw)).toEqual(DEFAULT_PERFORMANCE_SETTINGS);
  }
  expect(parsePerformanceSettings(JSON.stringify({ quality: "ultra", targetFps: 999, simpleCrowd: "true", reducedMotion: "false" }))).toEqual(DEFAULT_PERFORMANCE_SETTINGS);
});

test("economy settings survive storage and motion can explicitly override the system", () => {
  expect(parsePerformanceSettings(JSON.stringify(ECONOMY_SETTINGS))).toEqual(ECONOMY_SETTINGS);
  expect(parsePerformanceSettings('{"targetFps":15,"reducedMotion":false}')).toMatchObject({ targetFps: 15, reducedMotion: false });
});
