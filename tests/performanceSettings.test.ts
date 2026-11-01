import { expect, test } from "vitest";
import { DEFAULT_PERFORMANCE_SETTINGS, ECONOMY_SETTINGS, MOBILE_PERFORMANCE_SETTINGS, isMobileRenderer, parsePerformanceSettings } from "../src/ui/performanceSettings";

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

test("phones and touch tablets start within the mobile budget, including old saved desktop defaults", () => {
  expect(isMobileRenderer("Mozilla/5.0 (iPhone)", false)).toBe(true);
  expect(isMobileRenderer("Macintosh", true)).toBe(true);
  expect(isMobileRenderer("Macintosh", false)).toBe(false);
  for (const raw of [null, "bad JSON", "{}", JSON.stringify(DEFAULT_PERFORMANCE_SETTINGS)]) {
    expect(parsePerformanceSettings(raw, MOBILE_PERFORMANCE_SETTINGS)).toEqual(MOBILE_PERFORMANCE_SETTINGS);
  }
  expect(parsePerformanceSettings('{"targetFps":15,"reducedMotion":false}', MOBILE_PERFORMANCE_SETTINGS)).toMatchObject({ quality: "low", targetFps: 15, reducedMotion: false });
  expect(parsePerformanceSettings(JSON.stringify({...ECONOMY_SETTINGS, quality:"standard"}), MOBILE_PERFORMANCE_SETTINGS).quality).toBe("standard");
});
