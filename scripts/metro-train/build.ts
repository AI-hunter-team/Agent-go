import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Box3, Mesh, Vector3 } from "three";
import { batchMetroCar, createMetroCar, METRO, type MetroCarKind } from "../../src/assets/metro-train/index";
import { exportGlb } from "../station-kit/glb";

const directory = fileURLToPath(new URL("../../public/assets/metro-train/", import.meta.url));
await mkdir(directory, { recursive: true });
const assets = [];
for (const kind of ["head", "trailer"] as MetroCarKind[]) {
  const root = batchMetroCar(createMetroCar(kind)); root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root), size = box.getSize(new Vector3());
  let meshes = 0, triangles = 0, doors = 0;
  const slots = new Set<string>(), anchors: object[] = [];
  root.traverse((node) => {
    if (node.userData.role === "metroDoor") doors++;
    if (node.userData.role === "anchor") anchors.push({ name: node.name, position: node.position.toArray() });
    if (node instanceof Mesh) {
      meshes++; triangles += (node.geometry.index?.count ?? node.geometry.getAttribute("position").count) / 3;
      if (!Array.isArray(node.material)) slots.add(node.material.name);
      const positions = node.geometry.getAttribute("position");
      for (let i = 0; i < positions.array.length; i++) if (!Number.isFinite(positions.array[i])) throw new Error(`Nonfinite vertex: ${node.name}`);
    }
  });
  if (doors !== 20) throw new Error(`Expected 20 independently moving door leaves, got ${doors}`);
  if (size.z > 3.2 || size.x < 22.7 || size.x > 23.6) throw new Error("Unexpected car proportions");
  const { bytes } = await exportGlb(root, directory), file = `metro-${kind}-car.glb`;
  await writeFile(join(directory, file), bytes);
  assets.push({ kind, file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), bounds: { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() }, meshes, triangles, doorLeaves: doors, materialSlots: [...slots], anchors });
}
const manifest = {
  version: 1, title: "Agent Go · 青绿线地铁外观小样", status: "design-prototype", units: "metres", upAxis: "Y", forward: "+X",
  railTop: 0, passengerFloor: METRO.floor, nominal: METRO,
  doorMotion: { role: "metroDoor", formula: "position.x = closedX + travel * clamp(progress, 0, 1)", range: [0, 1] },
  previewConsist: "Three-car display only; not an assertion of a real operating formation", assets,
};
await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(join(directory, "sources.json"), JSON.stringify({
  geometry: "Original procedural geometry authored for Agent Go; Chinese metro inspired, not an exact vehicle replica",
  sourceFiles: ["src/assets/metro-train/index.ts", "scripts/metro-train/build.ts"], exporter: "scripts/station-kit/glb.ts",
  thirdPartyArt: [], referencesOnly: [
    "https://www.crrcgc.cc/zj/2025-01/06/article_2025010615113095490.html",
    "https://crrcgc.cc/pz/2023-08/04/article_30174B96C76E4BF186517B4E720C420E.html",
    "https://ishare.ifeng.com/c/s/7pt2sqfz9QL",
  ], note: "No reference photos, operator logos or third-party textures embedded",
}, null, 2) + "\n");
console.log(JSON.stringify({ assets: assets.map(({ kind, file, bytes, meshes, triangles, bounds }) => ({ kind, file, bytes, meshes, triangles, size: bounds.size })) }, null, 2));
