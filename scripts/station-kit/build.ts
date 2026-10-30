import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Box3, Mesh, Vector3 } from "three";
import { ASSETS, createAsset, makeMaterials, type FacilityState } from "../../src/assets/station-kit/index";
import { generateTextures } from "./textures";
import { exportGlb } from "./glb";

const directory = fileURLToPath(new URL("../../public/assets/station-kit/", import.meta.url));
const materialsDirectory = join(directory, "materials");
await mkdir(join(directory, "models"), { recursive: true });
const maps = await generateTextures(materialsDirectory, Number(process.env.KIT_TEXTURE_SIZE ?? 512));
const palette = makeMaterials(), entries: object[] = [];
for (const asset of ASSETS) {
  const states: FacilityState[] = asset.category === "facility" ? ["open", "closed", "broken"] : ["open"];
  for (const state of states) {
    const root = createAsset(asset.id, palette, state);
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root), size = bounds.getSize(new Vector3());
    const { bytes } = await exportGlb(root, materialsDirectory);
    const file = "models/" + asset.id + (asset.category === "facility" ? "-" + state : "") + ".glb";
    await writeFile(join(directory, file), bytes);
    let triangles = 0, meshCount = 0; const slots = new Set<string>(), anchors: object[] = [];
    root.traverse((node) => {
      if (node instanceof Mesh) {
        meshCount++; triangles += (node.geometry.index?.count ?? node.geometry.getAttribute("position").count) / 3;
        if (!Array.isArray(node.material)) slots.add(node.material.name);
      }
      if (node.userData.role === "anchor") anchors.push({ name: node.name, position: node.position.toArray() });
    });
    entries.push({
      ...asset, state, file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
      meshCount, triangles, materialSlots: [...slots].sort(), anchors,
    });
  }
}
const manifest = {
  version: 2, title: "AI猎人 · 站厅空间与模块素材 V2", units: "metres", upAxis: "Y",
  rootConvention: "Footprint centre; floor top is Y=0. Ceiling/light assets use mounting-plane Y=0. Devices face +Z; approach +Z, exit -Z.",
  source: "Original procedural geometry and seeded textures; no third-party textures or character models included.",
  gridMetres: 3, wallHeightMetres: 3.5, pillarFootprintMetres: [2, 2],
  showroomCeilingMetres: 4.25, structuralFrameHeightMetres: 4.2,
  gateAnimation: { nodeRoles: "gateHinge", property: "rotation.y", angleRadians: "sign * progress * PI * 0.48", progress: [0, 1] },
  currentGameMapping: "Rotate device roots -PI/2 about Y to face the existing -X station approach; simulation anchors remain authoritative.",
  materials: maps, assets: entries,
};
await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(join(directory, "sources.json"), JSON.stringify({
  generatedFrom: ["scripts/station-kit/", "src/assets/station-kit/"],
  thirdPartyAssets: [], attribution: "Geometry and textures created for this project; see project distribution terms.",
  note: "Three.js is a code dependency governed by its own MIT license, not a third-party art asset.",
}, null, 2) + "\n");
console.log(JSON.stringify({ models: entries.length, maps: maps.length, output: "public/assets/station-kit", modelBytes: entries.reduce((n, a) => n + (a as { bytes: number }).bytes, 0) }));
