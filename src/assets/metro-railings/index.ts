import {
  BoxGeometry, BufferGeometry, Curve, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Group, Mesh, MeshStandardMaterial, Object3D, Shape, SphereGeometry, TubeGeometry, Vector3,
} from "three";

export type RailingStyle = "metal" | "glass";
export const RAIL_HEIGHT = 1.1;
export const FOOTPRINT = 0.16;
const TOP = RAIL_HEIGHT - 0.025;
const UP = new Vector3(0, 1, 0);
const cylinder = new CylinderGeometry(1, 1, 1, 20);
const sphere = new SphereGeometry(1, 16, 10);
const box = new BoxGeometry(1, 1, 1);

export interface RailingMaterials {
  steel: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  edge: MeshStandardMaterial;
}
export interface SpanOptions {
  /** End elevation relative to the first foot; glass only. Posts remain vertical. */
  rise?: number;
  startPost?: boolean;
  endPost?: boolean;
  /** Set false at a shared metal joint to keep the top tube continuous. */
  startReturn?: boolean;
  endReturn?: boolean;
  /** Optional local foot elevation for stepped mounting; handrail/anchors retain their grade. */
  postBase?: (x: number, grade: number) => number;
}

export function makeRailingMaterials(): RailingMaterials {
  const steel = new MeshStandardMaterial({ color: "#b9bfc2", metalness: 0.94, roughness: 0.22 });
  const rubber = new MeshStandardMaterial({ color: "#303835", roughness: 0.94 });
  const glass = new MeshStandardMaterial({ color: "#b9d9ca", metalness: 0.02, roughness: 0.12, transparent: true, opacity: 0.17, side: DoubleSide, depthWrite: false });
  const edge = new MeshStandardMaterial({ color: "#80aca0", roughness: 0.25, transparent: true, opacity: 0.42, depthWrite: false });
  for (const [key, material] of Object.entries({ steel, rubber, glass, edge })) material.name = "metro.railing." + key;
  glass.userData = { depthWrite: false, purpose: "Clear panel; use alpha blending with depth writes disabled." };
  edge.userData = { depthWrite: false };
  return { steel, rubber, glass, edge };
}

function mesh(root: Object3D, name: string, geometry: BufferGeometry, material: MeshStandardMaterial) {
  const value = new Mesh(geometry, material); value.name = name;
  value.castShadow = !material.transparent; value.receiveShadow = !material.transparent;
  value.userData = { noShadow: material.transparent, component: name };
  root.add(value); return value;
}
function rod(root: Object3D, name: string, a: Vector3, b: Vector3, radius: number, material: MeshStandardMaterial) {
  const direction = b.clone().sub(a), length = direction.length();
  if (length < 0.00001) return;
  const value = mesh(root, name, cylinder, material);
  value.position.copy(a).add(b).multiplyScalar(0.5);
  value.quaternion.setFromUnitVectors(UP, direction.divideScalar(length)); value.scale.set(radius, length, radius);
  value.userData.diameterMetres = radius * 2; value.userData.axialLength = length;
}
function ball(root: Object3D, name: string, position: Vector3, radius: number, material: MeshStandardMaterial) {
  const value = mesh(root, name, sphere, material); value.position.copy(position); value.scale.setScalar(radius);
}
class Elbow extends Curve<Vector3> {
  constructor(private x: number, private y: number, private radius: number, private start: number, private end: number) { super(); }
  getPoint(t: number, target = new Vector3()) {
    const angle = this.start + (this.end - this.start) * t;
    return target.set(this.x + Math.cos(angle) * this.radius, this.y + Math.sin(angle) * this.radius, 0);
  }
}
function bend(root: Object3D, x: number, y: number, radius: number, start: number, end: number, steel: MeshStandardMaterial) {
  const geometry = new TubeGeometry(new Elbow(x, y, radius, start, end), 12, 0.025, 16, false);
  geometry.userData.metroTransient = true;
  mesh(root, "rounded_return", geometry, steel);
}
function post(root: Object3D, x: number, floor: number, top: number, materials: RailingMaterials) {
  const value = new Group(); value.name = "post"; value.userData.component = "post"; value.position.set(x, floor, 0); root.add(value);
  rod(value, "foot_gasket", new Vector3(0, 0, 0), new Vector3(0, 0.003, 0), 0.078, materials.rubber);
  rod(value, "fixed_flange", new Vector3(0, 0.003, 0), new Vector3(0, 0.018, 0), FOOTPRINT / 2, materials.steel);
  rod(value, "upright", new Vector3(0, 0.018, 0), new Vector3(0, top - floor, 0), 0.025, materials.steel);
  for (const [dx, dz] of [[0.045, 0.045], [-0.045, 0.045], [-0.045, -0.045], [0.045, -0.045]]) {
    rod(value, "anchor_bolt", new Vector3(dx, 0.018, dz), new Vector3(dx, 0.023, dz), 0.0055, materials.steel);
  }
}
function clamp(root: Object3D, postX: number, panelDirection: number, y: number, reach: number, materials: RailingMaterials) {
  const x = postX + panelDirection * reach;
  rod(root, "clip_arm", new Vector3(postX, y, 0), new Vector3(x, y, 0), 0.009, materials.steel);
  for (const sign of [-1, 1]) {
    rod(root, "clip_gasket", new Vector3(x, y, sign * 0.007), new Vector3(x, y, sign * 0.011), 0.021, materials.rubber);
    rod(root, "glass_clip", new Vector3(x, y, sign * 0.011), new Vector3(x, y, sign * 0.019), 0.023, materials.steel);
    rod(root, "clip_screw", new Vector3(x, y, sign * 0.019), new Vector3(x, y, sign * 0.021), 0.005, materials.steel);
  }
}
function panel(root: Object3D, left: number, right: number, floor: (x: number) => number, materials: RailingMaterials) {
  const a = left + 0.043, b = right - 0.043;
  const outline = new Shape();
  outline.moveTo(a, floor(a) + 0.14); outline.lineTo(b, floor(b) + 0.14);
  outline.lineTo(b, floor(b) + 0.99); outline.lineTo(a, floor(a) + 0.99); outline.closePath();
  const geometry = new ExtrudeGeometry(outline, { depth: 0.012, bevelEnabled: false, steps: 1 });
  const centerX = (a + b) / 2, centerY = floor(centerX) + 0.565;
  geometry.translate(-centerX, -centerY, -0.006); geometry.userData.metroTransient = true;
  mesh(root, "glass_panel", geometry, materials.glass).position.set(centerX, centerY, 0);
  for (const height of [0.14, 0.99]) {
    const start = new Vector3(a, floor(a) + height, 0), end = new Vector3(b, floor(b) + height, 0);
    const edge = mesh(root, "glass_edge", box, materials.edge);
    edge.position.copy(start).add(end).multiplyScalar(0.5);
    edge.rotation.z = Math.atan2(end.y - start.y, end.x - start.x);
    edge.scale.set(start.distanceTo(end), 0.002, 0.012);
  }
  const reach = Math.min(0.069, (right - left) / 4);
  for (const [x, direction] of [[left, 1], [right, -1]]) for (const height of [0.32, 0.82]) clamp(root, x, direction, floor(x) + height, reach, materials);
}
function anchor(root: Object3D, name: string, x: number, y: number, z = 0) {
  const value = new Object3D(); value.name = name; value.position.set(x, y, z); value.userData.role = "anchor"; root.add(value);
}

/** Rebuilds geometry at metre scale; horizontal length includes both 80 mm foot radii. */
export function createMetroRailingSpan(style: RailingStyle, length: number, materials: RailingMaterials, options: SpanOptions = {}): Group {
  const rise = options.rise ?? 0;
  if (!Number.isFinite(length) || length < 0.32 || length > 100) throw new Error("Railing length must be between 0.32m and 100m.");
  if (!Number.isFinite(rise) || Math.abs(rise) > (length - FOOTPRINT) * 0.75) throw new Error("Invalid railing incline (maximum rise/run: 0.75).");
  if (style !== "metal" && style !== "glass") throw new Error("Unknown railing style.");
  if (style === "metal" && rise !== 0) throw new Error("Use the glass railing for stairs.");
  const root = new Group(); root.name = "metro-" + style + "-span";
  root.userData = { railingStyle: style, lengthMetres: length, riseMetres: rise, heightMetres: RAIL_HEIGHT, units: "metres", footDiameterMetres: FOOTPRINT };
  const run = length - FOOTPRINT, left = -run / 2, right = run / 2;
  const floor = (x: number) => rise * (x - left) / run;
  const count = Math.max(1, Math.ceil(run / (style === "glass" ? 1.35 : 1.5)));
  const positions = Array.from({ length: count + 1 }, (_, i) => left + run * i / count);
  const startReturn = style === "metal" && (options.startReturn ?? true);
  const endReturn = style === "metal" && (options.endReturn ?? true);
  const radius = Math.min(0.11, run / 3);
  for (const [i, x] of positions.entries()) {
    if ((i === 0 && options.startPost === false) || (i === count && options.endPost === false)) continue;
    const returned = (i === 0 && startReturn) || (i === count && endReturn);
    const grade = floor(x), base = options.postBase?.(x, grade) ?? grade;
    if (!Number.isFinite(base) || Math.abs(base - grade) > 0.3) throw new Error("Invalid stepped mounting elevation.");
    post(root, x, base, grade + TOP - (returned ? radius : 0), materials);
  }
  if (style === "metal") {
    if (startReturn) bend(root, left + radius, TOP - radius, radius, Math.PI, Math.PI / 2, materials.steel);
    if (endReturn) bend(root, right - radius, TOP - radius, radius, Math.PI / 2, 0, materials.steel);
    rod(root, "handrail", new Vector3(left + (startReturn ? radius : 0), TOP, 0), new Vector3(right - (endReturn ? radius : 0), TOP, 0), 0.025, materials.steel);
    for (let i = 0; i < count; i++) for (const height of [0.34, 0.69]) {
      rod(root, "horizontal_rail", new Vector3(positions[i] + 0.016, height, 0), new Vector3(positions[i + 1] - 0.016, height, 0), 0.016, materials.steel);
    }
  } else {
    rod(root, "handrail", new Vector3(left, TOP, 0), new Vector3(right, rise + TOP, 0), 0.025, materials.steel);
    ball(root, "handrail_end", new Vector3(left, TOP, 0), 0.025, materials.steel);
    ball(root, "handrail_end", new Vector3(right, rise + TOP, 0), 0.025, materials.steel);
    for (let i = 0; i < count; i++) panel(root, positions[i], positions[i + 1], floor, materials);
  }
  anchor(root, "anchor_start", left, 0); anchor(root, "anchor_end", right, rise);
  return root;
}

export function createMetroRailingCorner(style: RailingStyle, materials: RailingMaterials): Group {
  const root = new Group(); root.name = "metro-" + style + "-corner";
  root.userData = { railingStyle: style, units: "metres", cornerDegrees: 90 };
  const a = createMetroRailingSpan(style, 1.5, materials, { startReturn: false });
  const b = createMetroRailingSpan(style, 1.5, materials, { startPost: false, startReturn: false });
  a.position.z = -0.67; b.position.x = -0.67; b.rotation.y = -Math.PI / 2;
  for (const span of [a, b]) for (const child of [...span.children]) if (child.userData.role === "anchor") span.remove(child);
  root.add(a, b); ball(root, "corner_joint", new Vector3(-0.67, TOP, -0.67), 0.025, materials.steel);
  anchor(root, "anchor_start", 0.67, 0, -0.67); anchor(root, "anchor_end", -0.67, 0, 0.67);
  return root;
}

/** Accepts either an in-memory module or a GLTFLoader scene wrapper. */
export function fitMetroRailingSpan(prototype: Object3D, length: number, options: SpanOptions = {}): Group {
  let style: RailingStyle | undefined;
  const palette = new Map<string, MeshStandardMaterial>();
  prototype.traverse((node) => {
    if (node.userData.railingStyle) style = node.userData.railingStyle;
    if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) palette.set(node.material.name, node.material);
  });
  if (!style) throw new Error("Prototype does not declare a railing style.");
  const required = (key: keyof RailingMaterials) => {
    const material = palette.get("metro.railing." + key);
    if (!material) throw new Error("Span prototype is missing material: " + key);
    if (material.transparent) material.depthWrite = false;
    return material;
  };
  const steel = required("steel"), rubber = required("rubber");
  return createMetroRailingSpan(style, length, { steel, rubber, glass: style === "glass" ? required("glass") : steel, edge: style === "glass" ? required("edge") : steel }, options);
}

export function disposeRailingGeometry(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  root.traverse((node) => { if (node instanceof Mesh && node.geometry.userData.metroTransient) geometries.add(node.geometry); });
  geometries.forEach((geometry) => geometry.dispose());
}

export const METRO_RAILING_ASSETS = [
  { id: "metal-straight", style: "metal", label: "A 圆管固定栏杆", kind: "straight" },
  { id: "metal-corner", style: "metal", label: "A 圆管转角", kind: "corner" },
  { id: "metal-end", style: "metal", label: "A 固定端柱", kind: "end" },
  { id: "glass-straight", style: "glass", label: "B 玻璃护栏", kind: "straight" },
  { id: "glass-corner", style: "glass", label: "B 玻璃转角", kind: "corner" },
  { id: "glass-end", style: "glass", label: "B 固定端柱", kind: "end" },
  { id: "glass-stairs", style: "glass", label: "B 楼梯斜段（9m / −2m）", kind: "stairs" },
] as const;

export function createMetroRailingAsset(id: string, materials: RailingMaterials): Group {
  const entry = METRO_RAILING_ASSETS.find((asset) => asset.id === id);
  if (!entry) throw new Error("Unknown metro railing asset: " + id);
  if (entry.kind === "corner") return createMetroRailingCorner(entry.style, materials);
  if (entry.kind === "end") {
    const root = new Group(); root.name = entry.id; root.userData = { railingStyle: entry.style, units: "metres" };
    post(root, 0, 0, TOP, materials); ball(root, "post_cap", new Vector3(0, TOP, 0), 0.025, materials.steel);
    anchor(root, "anchor_start", 0, 0); anchor(root, "anchor_end", 0, 0); return root;
  }
  return createMetroRailingSpan(entry.style, entry.kind === "stairs" ? 9 : 3, materials, entry.kind === "stairs" ? { rise: -2 } : {});
}
