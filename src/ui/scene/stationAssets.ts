import { Group, InstancedMesh, Matrix4, Mesh, Object3D, type Material, type BufferGeometry, type MeshStandardMaterial, type Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fitRailingSpan } from "../../assets/station-kit/railing";
import { fitMetroRailingSpan } from "../../assets/metro-railings/index";
import type { Placement } from "./stationLayout";
import { STAIR_DETAILS } from "./staircase";

export interface StationKit { models: Map<string, Group>; materials: Map<string, MeshStandardMaterial> }
let pending: Promise<StationKit> | undefined;
export function loadStationKit(): Promise<StationKit> {
  if (!pending) pending = (async () => {
    const entries = (await Promise.all(["station-kit", "metro-railings", "station-detail"].map(async (directory) => {
      const base = new URL(`${import.meta.env.BASE_URL}assets/${directory}/`, location.origin);
      const response = await fetch(new URL("manifest.json", base));
      if (!response.ok) throw new Error(`站厅清单 ${directory} HTTP ${response.status}`);
      const manifest = await response.json() as { assets: { id: string; state?: string; file: string }[] };
      return manifest.assets.filter((entry) => !entry.state || entry.state === "open").map((entry) => ({ ...entry, url: new URL(entry.file, base).href }));
    }))).flat();
    const loader = new GLTFLoader(), materials = new Map<string, MeshStandardMaterial>();
    const attempts = await Promise.allSettled(entries.map(async (entry) => {
      const { scene } = await loader.loadAsync(entry.url);
      scene.userData = { ...scene.children[0]?.userData, assetId: entry.id };
      return [entry.id, scene] as const;
    }));
    const loaded = attempts.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
    const discarded = new Set<MeshStandardMaterial>(), textures = new Set<Texture>();
    const textureList = (mat: MeshStandardMaterial) => [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap].filter((map): map is Texture => !!map);
    const failed = attempts.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") {
      const geometries = new Set<BufferGeometry>(), mats = new Set<MeshStandardMaterial>();
      loaded.forEach(([, root]) => root.traverse((node) => { if (node instanceof Mesh) { geometries.add(node.geometry); mats.add(node.material as MeshStandardMaterial); } }));
      mats.forEach((mat) => { textureList(mat).forEach((map) => textures.add(map)); mat.dispose(); });
      textures.forEach((map) => map.dispose()); geometries.forEach((geo) => geo.dispose());
      throw failed.reason;
    }
    for (const [, root] of loaded) root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mat = node.material as MeshStandardMaterial;
      if (materials.has(mat.name)) {
        const shared = materials.get(mat.name)!;
        if (mat !== shared) discarded.add(mat);
        node.material = shared;
      } else materials.set(mat.name, mat);
      if (mat.transparent) mat.depthWrite = false;
      node.castShadow = !node.userData.noShadow && !["floor-", "ceiling-"].some((prefix) => root.userData.assetId?.startsWith(prefix)); node.receiveShadow = true;
    });
    const retained = new Set([...materials.values()].flatMap(textureList));
    discarded.forEach((mat) => { textureList(mat).forEach((map) => { if (!retained.has(map)) textures.add(map); }); mat.dispose(); });
    textures.forEach((map) => map.dispose());
    return { models: new Map(loaded), materials };
  })().catch((error: unknown) => { pending = undefined; throw error; });
  return pending;
}

export function placedModel(kit: StationKit, placement: Placement): Object3D {
  const source = kit.models.get(placement.id);
  if (!source) throw new Error("Missing station model: " + placement.id);
  const metro = !!source.userData.railingStyle;
  const run = (placement.railLength ?? 0) - 0.16;
  const steps = placement.railSteps ?? STAIR_DETAILS.count;
  const root = placement.railLength ? metro ? fitMetroRailingSpan(source, placement.railLength, {
    rise: placement.slope ?? 0, startPost: placement.railStartPost,
    postBase: placement.id === "glass-stairs" && steps > 0 ? (x) => (placement.slope ?? 0) * Math.ceil((x / run + 0.5) * steps - 0.000001) / steps : undefined,
  }) : fitRailingSpan(source, placement.railLength) : source.clone(true);
  if (!metro && placement.slope && placement.railLength) {
    const span = placement.railLength, drop = placement.slope;
    for (const node of root.children) {
      node.position.y += drop * (node.position.x / span + 0.5);
      if (node.name === "railing_handrail" || node.name === "railing_lower_rail") {
        node.rotation.z = Math.atan2(drop, span); node.scale.x *= Math.hypot(span, drop) / span;
      }
    }
  }
  root.position.set(...placement.position); root.rotation.y = placement.yaw; root.scale.set(...placement.scale);
  root.updateMatrixWorld(true); return root;
}

/** A GLB may contain many parts; batch equal geometry/material pairs across every placement. */
export function batchStation(kit: StationKit, placements: Placement[]): Group {
  const batches = new Map<string, { geometry: BufferGeometry; material: Material; shadow: boolean; matrices: Matrix4[] }>();
  const group = new Group(); group.name = "station-kit-static";
  for (const placement of placements) {
    const root = placedModel(kit, placement);
    root.traverse((node) => {
      if (!(node instanceof Mesh) || Array.isArray(node.material)) return;
      // Keep each clear panel's sorting centre; an opaque batch cannot sort glass correctly.
      if (node.material.transparent) {
        const pane = new Mesh(node.geometry, node.material); pane.name = node.name;
        pane.matrix.copy(node.matrixWorld); pane.matrixAutoUpdate = false;
        pane.castShadow = false; pane.receiveShadow = false; group.add(pane); return;
      }
      const key = `${node.geometry.uuid}:${node.material.uuid}:${node.castShadow}`;
      let batch = batches.get(key);
      if (!batch) { batch = { geometry: node.geometry, material: node.material, shadow: node.castShadow, matrices: [] }; batches.set(key, batch); }
      batch.matrices.push(node.matrixWorld.clone());
    });
  }
  group.userData = { placementCount: placements.length, batchCount: batches.size, modelIds: [...new Set(placements.map((p) => p.id))] };
  for (const batch of batches.values()) {
    const mesh = new InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = batch.shadow; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  return group;
}
export function disposeBatches(group: Group) {
  const temporary = new Set<BufferGeometry>();
  group.traverse((node) => {
    if (node instanceof InstancedMesh) node.dispose();
    if (node instanceof Mesh && node.geometry.userData.metroTransient) temporary.add(node.geometry);
  });
  temporary.forEach((geometry) => geometry.dispose());
}
