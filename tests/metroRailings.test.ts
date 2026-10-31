import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Box3, Group, InstancedMesh, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, test } from "vitest";
import {
  createMetroRailingAsset, createMetroRailingSpan, fitMetroRailingSpan, makeRailingMaterials, METRO_RAILING_ASSETS,
} from "../src/assets/metro-railings/index";
import { exportGlb } from "../scripts/station-kit/glb";
import { batchStation, disposeBatches, placedModel } from "../src/ui/scene/stationAssets";
import { stationPlacements } from "../src/ui/scene/stationLayout";
import { GATE_BARRIERS, SECURITY_BARRIERS } from "../src/sim/layout";

const materials = makeRailingMaterials();
const dimensions = (root: Parameters<Box3["setFromObject"]>[0]) => new Box3().setFromObject(root).getSize(new Vector3());

test.each(["metal", "glass"] as const)("%s modules keep a 1.1m height and compact fixed foot envelope", (style) => {
  for (const length of [0.32, 0.8, 3, 9.6, 13]) {
    const root = createMetroRailingSpan(style, length, materials);
    expect(dimensions(root).toArray()).toEqual([expect.closeTo(length, 5), expect.closeTo(1.1, 5), expect.closeTo(0.16, 5)]);
    root.traverse((node) => {
      if (node instanceof Mesh && node.name === "upright") expect(dimensions(node).x).toBeCloseTo(0.05, 5);
    });
    const posts = root.children.filter((node) => node.name === "post");
    for (let i = 1; i < posts.length; i++) expect(posts[i].position.x - posts[i - 1].position.x).toBeLessThanOrEqual(style === "glass" ? 1.350001 : 1.500001);
  }
});

test("joined runs share the same flange and have a continuous top tube", () => {
  const a = createMetroRailingSpan("metal", 3, materials, { endReturn: false });
  const b = createMetroRailingSpan("metal", 2, materials, { startPost: false, startReturn: false });
  b.position.x = a.getObjectByName("anchor_end")!.position.x - b.getObjectByName("anchor_start")!.position.x;
  a.updateMatrixWorld(true); b.updateMatrixWorld(true);
  expect(a.getObjectByName("anchor_end")!.getWorldPosition(new Vector3()).toArray()).toEqual(b.getObjectByName("anchor_start")!.getWorldPosition(new Vector3()).toArray());
  const handA = new Box3().setFromObject(a.getObjectByName("handrail")!);
  const handB = new Box3().setFromObject(b.getObjectByName("handrail")!);
  expect(handA.max.x).toBeCloseTo(handB.min.x, 6);
  expect(b.children.filter((node) => node.name === "post")).toHaveLength(2);
});

test.each([-2, 2])("glass incline %sm preserves vertical posts, panel thickness and end elevations", (rise) => {
  const root = createMetroRailingSpan("glass", 9, materials, { rise }); root.updateMatrixWorld(true);
  expect(root.getObjectByName("anchor_start")!.position.y).toBe(0);
  expect(root.getObjectByName("anchor_end")!.position.y).toBe(rise);
  const bounds = new Box3().setFromObject(root);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(3.1, 5);
  const posts = root.children.filter((node) => node.name === "post");
  expect(posts.at(-1)!.position.y).toBe(rise);
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    for (const value of node.matrixWorld.elements) expect(Number.isFinite(value)).toBe(true);
    if (node.name === "upright") {
      expect(new Vector3(0, 1, 0).applyQuaternion(node.quaternion).toArray()).toEqual([0, 1, 0]);
      expect(node.scale.x).toBe(0.025); expect(node.scale.z).toBe(0.025);
    }
    if (node.name === "glass_panel") {
      expect(dimensions(node).z).toBeCloseTo(0.012, 6);
      expect(node.castShadow).toBe(false);
    }
  });
});

test.each(["metal", "glass"] as const)("%s corner fits the old 1.5m envelope and has one shared corner post", (style) => {
  const root = createMetroRailingAsset(style + "-corner", materials);
  expect(dimensions(root).toArray()).toEqual([expect.closeTo(1.5, 5), expect.closeTo(1.1, 5), expect.closeTo(1.5, 5)]);
  let posts = 0; root.traverse((node) => { if (node.name === "post") posts++; }); expect(posts).toBe(3);
  expect(root.getObjectByName("anchor_start")!.position.toArray()).toEqual([0.67, 0, -0.67]);
  expect(root.getObjectByName("anchor_end")!.position.toArray()).toEqual([-0.67, 0, 0.67]);
});

test.each([NaN, Infinity, -1, 0.31, 101])("invalid span %s is rejected before allocating geometry", (length) => {
  expect(() => createMetroRailingSpan("glass", length, materials)).toThrow("length");
});
test("invalid slopes and unsupported metal inclines are rejected", () => {
  expect(() => createMetroRailingSpan("glass", 3, materials, { rise: NaN })).toThrow("incline");
  expect(() => createMetroRailingSpan("glass", 3, materials, { rise: 8 })).toThrow("incline");
  expect(() => createMetroRailingSpan("metal", 3, materials, { rise: 1 })).toThrow("glass railing");
});

test("short glass spans keep opposing clips apart and locate panels at their sorting centres", () => {
  const root = createMetroRailingSpan("glass", 0.32, materials);
  const clips = root.children.filter((node) => node.name === "glass_clip" && node.position.z > 0 && node.position.y < 0.4);
  expect(clips).toHaveLength(2);
  expect(Math.abs(clips[0].position.x - clips[1].position.x)).toBeGreaterThan(0.046);
  const slope = createMetroRailingSpan("glass", 9, materials, { rise: -2 });
  slope.traverse((node) => {
    if (!(node instanceof Mesh) || node.name !== "glass_panel") return;
    node.geometry.computeBoundingBox();
    expect(node.geometry.boundingBox!.getCenter(new Vector3()).length()).toBeLessThan(0.00001);
  });
});

test("export/import preserves geometry, clear glass and the resizing contract", async () => {
  const root = createMetroRailingAsset("glass-straight", materials);
  const { bytes } = await exportGlb(root, "");
  const parsed = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
  expect(dimensions(parsed.scene).toArray()).toEqual([expect.closeTo(3, 5), expect.closeTo(1.1, 5), expect.closeTo(0.16, 5)]);
  const glass = parsed.scene.getObjectByName("glass_panel") as Mesh;
  expect(Array.isArray(glass.material)).toBe(false);
  if (Array.isArray(glass.material)) throw new Error("Unexpected material array");
  expect(glass.material.transparent).toBe(true); expect(glass.material.opacity).toBeCloseTo(0.17);
  const fitted = fitMetroRailingSpan(parsed.scene, 9, { rise: -2 });
  expect(dimensions(fitted).y).toBeCloseTo(3.1, 5);
  const fittedGlass = fitted.getObjectByName("glass_panel") as Mesh;
  if (Array.isArray(fittedGlass.material)) throw new Error("Unexpected material array");
  expect(fittedGlass.material.depthWrite).toBe(false);
});

test("all shipped GLBs match their manifest hashes and load with their named connection anchors", async () => {
  const base = new URL("../public/assets/metro-railings/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8"));
  expect(manifest.assets.map((a: { id: string }) => a.id)).toEqual(METRO_RAILING_ASSETS.map((a) => a.id));
  for (const entry of manifest.assets) {
    const data = await readFile(new URL(entry.file, base));
    expect(createHash("sha256").update(data).digest("hex")).toBe(entry.sha256);
    expect(data.byteLength).toBe(entry.bytes);
    const { scene } = await new GLTFLoader().parseAsync(new Uint8Array(data).buffer, "");
    expect(dimensions(scene).toArray()).toEqual(entry.bounds.size.map((value: number) => expect.closeTo(value, 5)));
    for (const anchor of entry.anchors) expect(scene.getObjectByName(anchor.name)!.getWorldPosition(new Vector3()).toArray()).toEqual(anchor.position.map((value: number) => expect.closeTo(value, 5)));
  }
});

test("formal placement uses A for security/gates and B for landing/stairs without double-applying the incline", () => {
  const models = new Map(METRO_RAILING_ASSETS.map((entry) => [entry.id, createMetroRailingAsset(entry.id, materials)] as const));
  const kit = { models: models as Map<string, Group>, materials: new Map() };
  const rails = stationPlacements().filter((placement) => /^(metal|glass)-/.test(placement.id));
  expect(rails.filter((p) => p.id === "metal-straight")).toHaveLength(SECURITY_BARRIERS.length + GATE_BARRIERS.length);
  expect(rails.filter((p) => p.id === "glass-straight")).toHaveLength(2);
  for (const placement of rails.filter((p) => p.id === "glass-stairs")) {
    const root = placedModel(kit, placement);
    expect(dimensions(root).y).toBeCloseTo(3.1, 5);
    expect(root.getObjectByName("anchor_end")!.getWorldPosition(new Vector3()).y).toBeCloseTo(-2, 5);
    expect(root.getObjectByName("anchor_start")!.getWorldPosition(new Vector3()).x).toBeCloseTo(48, 5);
    expect(root.getObjectByName("anchor_end")!.getWorldPosition(new Vector3()).x).toBeCloseTo(57, 5);
    expect(root.children.filter((node) => node.name === "post")).toHaveLength(7);
    for (const post of root.children.filter((node) => node.name === "post")) {
      const position = post.getWorldPosition(new Vector3());
      const step = Math.ceil((position.x - 48) / 0.45 - 0.000001);
      expect(position.y).toBeCloseTo(-step * 0.1, 5);
    }
  }
  expect(stationPlacements().some((p) => p.id.startsWith("railing-"))).toBe(false);
});

test("batching keeps glass individually sortable and releases only generated railing geometry", () => {
  const prototype = createMetroRailingAsset("glass-straight", materials); prototype.userData.railingStyle = "glass";
  const group = batchStation({ models: new Map([["glass-straight", prototype]]), materials: new Map() }, [{ id: "glass-straight", position: [0, 0, 0], yaw: 0, scale: [1, 1, 1], railLength: 4.2 }]);
  const glass = group.children.filter((node) => node instanceof Mesh && !Array.isArray(node.material) && node.material.transparent);
  expect(glass.length).toBeGreaterThan(0); expect(glass.every((node) => !(node instanceof InstancedMesh))).toBe(true);
  let released = 0;
  const temporary = new Set(group.children.filter((node) => node instanceof Mesh && node.geometry.userData.metroTransient).map((node) => (node as Mesh).geometry));
  for (const geometry of temporary) geometry.addEventListener("dispose", () => { released++; });
  disposeBatches(group); expect(released).toBe(temporary.size); expect(released).toBeGreaterThan(0);
});
