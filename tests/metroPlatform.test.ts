import { readFile } from "node:fs/promises";
import { Box3, Group, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, test } from "vitest";
import { HEIGHT, WIDTH } from "../src/sim/layout";
import { createParkedMetro, disposeMetroGeometry, metroPlatformLayout, parkMetroDoors } from "../src/ui/scene/metroPlatformLayout";
import { createMetroTrainLoader } from "../src/ui/scene/metroTrainAssets";

async function importedTrain() {
  const bytes = await readFile(new URL("../public/assets/metro-train/metro-head-car.glb", import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")).scene;
}
describe("parked metro integration", () => {
  test("the real GLB keeps the passenger floor level and clears the walkable platform", async () => {
    const source = await importedTrain(), layout = metroPlatformLayout(WIDTH, HEIGHT), car = createParkedMetro(source, layout.platformSide);
    car.rotation.y = layout.trainYaw; car.position.set(layout.trackX, layout.railY, layout.centreZ); car.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(car), floor = new Vector3(0, 1.1, 0).applyMatrix4(car.matrixWorld);
    expect(floor.y).toBeCloseTo(layout.floorY, 7);
    expect(bounds.min.x - WIDTH).toBeCloseTo(layout.gap, 4);
    expect(bounds.min.z).toBeGreaterThan(0); expect(bounds.max.z).toBeLessThan(HEIGHT);
    expect(car.children.length).toBeLessThanOrEqual(16);
    let triangles = 0; car.traverse((node) => { if (node instanceof Mesh) triangles += node.geometry.getAttribute("position").count / 3; });
    expect(triangles).toBeGreaterThan(23000);
    disposeMetroGeometry(car);
  });
  test("only the platform-facing leaves open and the cached source stays closed", async () => {
    const source = await importedTrain(), posed = source.clone(true), doors = parkMetroDoors(posed, -1);
    expect(doors).toHaveLength(20);
    expect(doors.filter((door) => door.side === -1).every((door) => door.x === door.closedX + door.travel && door.progress === 1)).toBe(true);
    expect(doors.filter((door) => door.side === 1).every((door) => door.x === door.closedX && door.progress === 0)).toBe(true);
    source.traverse((node) => { if (node.userData.role === "metroDoor") expect(node.position.x).toBe(node.userData.closedX); });
    expect(() => createParkedMetro(new Group(), -1)).toThrow("列车门节点不完整");
  });
  test("failed downloads can retry, while concurrent and successful loads share one request", async () => {
    let calls = 0;
    const scene = new Group(), load = createMetroTrainLoader(async () => { calls++; if (calls === 1) throw new Error("offline"); return scene; });
    await expect(load("train.glb")).rejects.toThrow("offline");
    const first = load("train.glb"), second = load("train.glb"); expect(first).toBe(second);
    expect(await first).toBe(scene); expect(await load("train.glb")).toBe(scene); expect(calls).toBe(2);
  });
});
