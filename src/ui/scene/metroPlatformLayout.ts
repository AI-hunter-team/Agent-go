import { BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { METRO_PROFILE } from "../../shared/metro";

/** A parked, full-scale leading car; this is presentation, not a boarding rule. */
export function metroPlatformLayout(edgeX: number, length: number, floorY = -2) {
  if (![edgeX, length, floorY].every(Number.isFinite) || length < 24) throw new Error("Invalid metro platform dimensions");
  const halfWidth = METRO_PROFILE.exteriorHalfWidth, gap = METRO_PROFILE.platformGap;
  return { edgeX, length, floorY, halfWidth, gap, trackX: edgeX + halfWidth + gap, railY: floorY - 1.1, centreZ: length / 2,
    trainYaw: Math.PI / 2, platformSide: -1 } as const;
}
export type MetroPlatformLayout = ReturnType<typeof metroPlatformLayout>;

export interface ParkedDoor { name: string; side: number; closedX: number; x: number; travel: number; progress: number }
export function parkMetroDoors(root: Object3D, platformSide: number): ParkedDoor[] {
  const doors: ParkedDoor[] = [];
  root.traverse((node) => {
    if (node.userData.role !== "metroDoor") return;
    const { side, closedX, travel } = node.userData as { side: number; closedX: number; travel: number };
    const progress = side === platformSide ? 1 : 0; node.position.x = closedX + travel * progress;
    doors.push({ name: node.name, side, closedX, x: node.position.x, travel, progress });
  });
  return doors;
}

/** Bake the parked door pose into one draw per material; source GLB remains reusable. */
export function createParkedMetro(source: Group, platformSide: number): Group {
  const posed = source.clone(true), doors = parkMetroDoors(posed, platformSide), buckets = new Map<MeshStandardMaterial, BufferGeometry[]>();
  if (doors.length !== 20 || doors.filter((door) => door.progress === 1).length !== 10) throw new Error("列车门节点不完整");
  posed.updateMatrixWorld(true);
  posed.traverse((node) => {
    if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return;
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld), flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const list = buckets.get(node.material) ?? []; list.push(flat); buckets.set(node.material, list);
  });
  const result = new Group(); result.name = "metro-parked-car"; result.userData = { loaded: true, doors, scale: "metres", cars: 1, role: "parked-visible-leading-car" };
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries); geometries.forEach((item) => item.dispose());
    if (!geometry) { disposeMetroGeometry(result); throw new Error("列车几何合批失败"); }
    const mesh = new Mesh(geometry, material); mesh.name = material.name; mesh.receiveShadow = true; result.add(mesh);
  }
  return result;
}

/** Only baked geometries belong to the instance; GLB materials belong to the shared loader. */
export function disposeMetroGeometry(root: Object3D) { root.traverse((node) => { if (node instanceof Mesh) node.geometry.dispose(); }); }

export function createMetroTrack(layout: MetroPlatformLayout) {
  const root = new Group(); root.name = "metro-platform-structure";
  const materials = {
    concrete: new MeshStandardMaterial({ color: "#a4aba2", roughness: 0.95 }),
    edge: new MeshStandardMaterial({ color: "#dad7c9", roughness: 0.85 }),
    steel: new MeshStandardMaterial({ color: "#89968e", roughness: 0.38, metalness: 0.65 }),
    ballast: new MeshStandardMaterial({ color: "#414a47", roughness: 1 }),
    yellow: new MeshStandardMaterial({ color: "#d9b657", roughness: 0.8 }),
    dark: new MeshStandardMaterial({ color: "#202d2a", roughness: 1 }),
    light: new MeshStandardMaterial({ color: "#fff1ce", emissive: "#fff1ce", emissiveIntensity: 0.65, roughness: 0.4 }),
  };
  const buckets = new Map<MeshStandardMaterial, BufferGeometry[]>();
  const box = (size: number[], position: number[], material: MeshStandardMaterial) => {
    const geometry = new BoxGeometry(size[0], size[1], size[2]); geometry.translate(position[0], position[1], position[2]);
    const bucket = buckets.get(material) ?? []; bucket.push(geometry.toNonIndexed()); geometry.dispose(); buckets.set(material, bucket);
  };
  const { edgeX, length, floorY, trackX, railY, centreZ } = layout;
  box([3.65, 0.2, length + 4], [trackX, railY - 0.39, centreZ], materials.ballast);
  box([0.12, 1.17, length], [edgeX - 0.015, floorY - 0.585, centreZ], materials.concrete);
  box([0.25, 0.045, length], [edgeX - 0.08, floorY - 0.012, centreZ], materials.edge);
  // Paint and tactile relief sit on the existing floor rather than adding a new walkway.
  box([0.18, 0.008, length - 0.8], [edgeX - 0.44, floorY + 0.008, centreZ], materials.yellow);
  box([0.32, 0.008, length - 0.8], [edgeX - 0.84, floorY + 0.007, centreZ], materials.yellow);
  for (let z = 0.55; z < length - 0.4; z += 0.3) for (const x of [-0.94, -0.84, -0.74]) box([0.025, 0.009, 0.11], [edgeX + x, floorY + 0.016, z], materials.edge);
  for (const dx of [-0.8, 0.8]) {
    box([0.075, 0.12, length + 4], [trackX + dx, railY - 0.06, centreZ], materials.steel);
    box([0.14, 0.025, length + 4], [trackX + dx, railY - 0.137, centreZ], materials.steel);
  }
  for (let z = -1.5; z < length + 2; z += 0.65) box([2.4, 0.12, 0.22], [trackX, railY - 0.21, z], materials.concrete);
  for (const z of [-1.8, length + 1.8]) {
    // Tunnel portals remain beyond the walkable platform and frame the visible track segment.
    box([4.4, 4.9, 0.24], [trackX, railY + 2.0, z], materials.dark);
    for (const dx of [-2.2, 2.2]) box([0.18, 4.95, 0.45], [trackX + dx, railY + 2.0, z], materials.concrete);
    box([4.6, 0.18, 0.5], [trackX, railY + 4.5, z], materials.concrete);
  }
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries)!; geometries.forEach((item) => item.dispose());
    const mesh = new Mesh(geometry, material); mesh.name = `metro-track-${material.uuid}`; mesh.receiveShadow = true; root.add(mesh);
  }
  const canopy = new Group(); canopy.name = "metro-track-canopy";
  const roof = new Mesh(new BoxGeometry(4.6, 0.16, length + 4), materials.concrete); roof.position.set(trackX, floorY + 3.6, centreZ); canopy.add(roof);
  for (const dx of [-1.1, 1.1]) {
    const light = new Mesh(new BoxGeometry(0.08, 0.025, length - 2), materials.light); light.position.set(trackX + dx, floorY + 3.5, centreZ); canopy.add(light);
  }
  root.add(canopy);
  root.userData = { railY, floorY, platformEdge: edgeX, trackCentre: trackX };
  return root;
}
export function disposeMetroTrack(root: Group) {
  const materials = new Set<MeshStandardMaterial>();
  root.traverse((node) => { if (node instanceof Mesh) { node.geometry.dispose(); if (node.material instanceof MeshStandardMaterial) materials.add(node.material); } });
  materials.forEach((material) => material.dispose());
}
