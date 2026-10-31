import { readFile } from "node:fs/promises";
import { Box3, Group, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, test } from "vitest";
import { HEIGHT, WIDTH, PLAYER_TRAIN_DOORS } from "../src/sim/layout";
import { createParkedMetro, disposeMetroGeometry, metroPlatformLayout, parkMetroDoors } from "../src/ui/scene/metroPlatformLayout";
import { createMetroTrainLoader } from "../src/ui/scene/metroTrainAssets";
import { createMetroCar, batchMetroCar } from "../src/assets/metro-train/index";

async function importedTrain() {
  const bytes = await readFile(new URL("../public/assets/metro-train/metro-head-car.glb", import.meta.url));
  // Node verifies the real GLB geometry/materials; embedded PNG decoding is checked in the browser.
  const jsonLength=bytes.readUInt32LE(12), json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  for(const material of json.materials) { delete material.normalTexture; delete material.pbrMetallicRoughness.baseColorTexture; delete material.pbrMetallicRoughness.metallicRoughnessTexture; }
  delete json.images; delete json.textures; delete json.samplers;
  const encoded=Buffer.from(JSON.stringify(json)), text=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]), bin=bytes.subarray(20+jsonLength), header=Buffer.from(bytes.subarray(0,20));
  header.writeUInt32LE(20+text.length+bin.length,8); header.writeUInt32LE(text.length,12);
  const geometryOnly=Buffer.concat([header,text,bin]);
  return (await new GLTFLoader().parseAsync(geometryOnly.buffer.slice(geometryOnly.byteOffset,geometryOnly.byteOffset+geometryOnly.byteLength), "")).scene;
}
describe("parked metro integration", () => {
  test("new body width and headroom leave the floor, rail gauge and boarding openings consistent", async () => {
    const source=await importedTrain(); source.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(source), dimensions=bounds.getSize(new Vector3());
    expect(dimensions.z).toBeGreaterThan(3.6); expect(dimensions.z).toBeLessThan(3.85);
    const top=source.getObjectByName("anchor_cabin-ceiling")!.getWorldPosition(new Vector3());
    const floor=source.getObjectByName("anchor_floor")!.getWorldPosition(new Vector3());
    const seat=source.getObjectByName("anchor_cabin-seat-top")!.getWorldPosition(new Vector3());
    expect(floor.y).toBeCloseTo(1.1); expect(top.y-floor.y).toBeCloseTo(2.6904);
    expect(top.y-floor.y-1.7).toBeGreaterThan(.9);
    expect(seat.y-floor.y).toBeCloseTo(.46);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(metroPlatformLayout(WIDTH,HEIGHT).halfWidth).toBeCloseTo(dimensions.z/2);
  });
  test("moulded seats, hollow handles and roof details survive material batching, with embedded floor maps", async () => {
    const root=createMetroCar("head"), seats:Mesh[]=[], handles:Mesh[]=[], vents:Mesh[]=[];
    root.traverse(node=>{if(node instanceof Mesh) { if(node.name==="moulded-seat")seats.push(node); if(node.name==="triangular-grab-handle")handles.push(node); if(node.name==="vent-louvre")vents.push(node); }});
    expect(seats).toHaveLength(32); expect(handles.length).toBeGreaterThan(30); expect(vents.length).toBeGreaterThan(200);
    const normal=seats[0].geometry.getAttribute("normal");
    expect(Array.from({length:normal.count},(_,i)=>Math.abs(normal.getY(i))).some(y=>y>.1&&y<.9)).toBe(true);
    const before=new Box3().setFromObject(root);batchMetroCar(root);const after=new Box3().setFromObject(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(.001);expect(after.max.distanceTo(before.max)).toBeLessThan(.001);
    const bytes=await readFile(new URL("../public/assets/metro-train/metro-head-car.glb",import.meta.url));
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    expect(json.images).toHaveLength(3);expect(json.images.every((image:{bufferView?:number})=>image.bufferView!==undefined)).toBe(true);
    const material=json.materials.find((m:{name:string})=>m.name==="metro.floor.speckle");
    expect(material.normalTexture).toBeDefined();expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();
  });
  test("player boarding targets align with the real GLB's platform-side door openings", async () => {
    const source = await importedTrain(), layout = metroPlatformLayout(WIDTH, HEIGHT);
    source.rotation.y = layout.trainYaw; source.position.set(layout.trackX, layout.railY, layout.centreZ); source.updateMatrixWorld(true);
    const openings = Array.from({ length: 5 }, (_, i) => source.getObjectByName(`anchor_door_-1_${i}`)!.getWorldPosition(new Vector3()));
    for (const door of PLAYER_TRAIN_DOORS) {
      const opening = openings.find(p => Math.abs(p.z - door.pos.y) < 0.001);
      expect(opening).toBeDefined();
      expect(opening!.x).toBeGreaterThan(WIDTH);
      expect(opening!.y).toBeCloseTo(-2);
    }
  });
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
