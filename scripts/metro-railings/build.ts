import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Box3, Mesh, Vector3 } from "three";
import { createMetroRailingAsset, disposeRailingGeometry, makeRailingMaterials, METRO_RAILING_ASSETS } from "../../src/assets/metro-railings/index";
import { exportGlb } from "../station-kit/glb";

const directory = fileURLToPath(new URL("../../public/assets/metro-railings/", import.meta.url));
await mkdir(join(directory, "models"), { recursive: true });
const materials = makeRailingMaterials(), entries = [];
for (const entry of METRO_RAILING_ASSETS) {
  const root = createMetroRailingAsset(entry.id, materials); root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root), slots = new Set<string>(), anchors: object[] = [];
  let triangles = 0;
  root.traverse((node) => {
    if (node instanceof Mesh) {
      triangles += (node.geometry.index?.count ?? node.geometry.getAttribute("position").count) / 3;
      slots.add(node.material.name);
    }
    if (node.userData.role === "anchor") anchors.push({ name: node.name, position: node.getWorldPosition(new Vector3()).toArray() });
  });
  const { bytes } = await exportGlb(root, directory), file = "models/" + entry.id + ".glb";
  await writeFile(join(directory, file), bytes);
  entries.push({ ...entry, file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new Vector3()).toArray() }, materialSlots: [...slots].sort(), triangles, anchors });
  disposeRailingGeometry(root);
}
await writeFile(join(directory, "manifest.json"), JSON.stringify({
  version: 1, units: "metres", upAxis: "Y", heightMetres: 1.1, fixedFootDiameterMetres: 0.16,
  spanConvention: "length includes both foot radii; anchor_start/end are post-centre ground points. rise is end minus start elevation. Keep post/rail cross sections unscaled.",
  transparency: "GLB alpha BLEND; disable depthWrite for transparent materials after import. Glass does not cast opaque shadows.",
  source: "Original procedural geometry/materials; photographs referenced for structure only, not redistributed.",
  assets: entries,
}, null, 2) + "\n");
await writeFile(join(directory, "sources.json"), JSON.stringify({
  geometry: "src/assets/metro-railings/index.ts", thirdPartyAssets: [],
  references: [
    { style: "A", url: "https://www.sohu.com/picture/458382092", use: "Round tube frame, rounded returns, two horizontal rails; compact fixed feet adapt the photograph to the existing simulation." },
    { style: "B", url: "https://www.eguangzhou.gov.cn/gznewsphotos/content/post_33604.html", use: "Stainless handrail, slim upright, clear panels and round clamps." },
  ],
}, null, 2) + "\n");
Object.values(materials).forEach((material) => material.dispose());
console.log(JSON.stringify({ models: entries.length, bytes: entries.reduce((total, entry) => total + entry.bytes, 0), directory: "public/assets/metro-railings" }));
