import { describe, expect, test } from "vitest";
import { clampModelProgress, modelResourceKey, shouldShowModelLoadingOverlay, type ModelLoadingState } from "../src/ui/modelLoading";

const state = (overrides: Partial<ModelLoadingState> = {}): ModelLoadingState => ({ url: "/models/character.gltf", status: "loading", progress: 42, ...overrides });

describe("model loading overlay state", () => {
  test("shows only while a first load is active", () => {
    expect(shouldShowModelLoadingOverlay(state())).toBe(true);
    expect(shouldShowModelLoadingOverlay(state({ status: "loaded" }))).toBe(false);
    expect(shouldShowModelLoadingOverlay(state({ status: "failed" }))).toBe(false);
    expect(shouldShowModelLoadingOverlay(state({ url: null }))).toBe(false);
  });

  test("clamps progress values for an accessible progress bar", () => {
    expect(clampModelProgress(-4)).toBe(0);
    expect(clampModelProgress(42.6)).toBe(43);
    expect(clampModelProgress(140)).toBe(100);
    expect(clampModelProgress(Number.NaN)).toBe(0);
  });

  test("treats cache-busting query strings as the same model resource", () => {
    expect(modelResourceKey("/models/character.gltf?v=2")).toBe("/models/character.gltf");
  });

  test("keeps cached resources out of the active loading state", () => {
    expect(shouldShowModelLoadingOverlay(state({ status: "loaded", progress: 100 }))).toBe(false);
  });
});
