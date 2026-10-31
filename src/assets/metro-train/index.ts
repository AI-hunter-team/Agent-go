import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Object3D, Path, Shape, ShapeGeometry, Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { METRO_PROFILE } from "../../shared/metro";
import { createMetroInterior } from "./interior";

export type MetroCarKind = "head" | "trailer";
export const METRO = { length: 22.8, width: METRO_PROFILE.width, floor: METRO_PROFILE.floor, doorWidth: 1.3, doorHeight: 2.05 * METRO_PROFILE.upperHeightFactor, lineColor: "#247f76" } as const;

export function metroMaterials() {
  const mat = (name: string, color: string, roughness: number, metalness = 0) => {
    const result = new MeshStandardMaterial({ color, roughness, metalness }); result.name = `metro.${name}`; return result;
  };
  const result = {
    shell: mat("shell.silver", "#dfe4e5", 0.31, 0.48), roof: mat("roof.satin", "#bcc7ca", 0.5, 0.48),
    line: mat("line.jade", METRO.lineColor, 0.36, 0.25), rubber: mat("rubber.graphite", "#202c31", 0.79),
    glass: mat("glass.window", "#6b9aab", 0.16, 0.1), windshield: mat("glass.cab", "#112c38", 0.18, 0.35),
    steel: mat("steel.brushed", "#92a4ac", 0.34, 0.78), chassis: mat("chassis.dark", "#33434c", 0.67, 0.52),
    interior: mat("interior.ivory", "#ece9df", 0.68), floor: mat("floor.speckle", "#acb5b3", 0.82),
    seat: mat("line.seat", "#368f88", 0.42, 0.1), light: mat("light.warm", "#fff5df", 0.25),
    joint: mat("interior.joints", "#a4aaa6", 0.75, 0.18), screen: mat("screen.bluegreen", "#234c50", 0.4),
    red: mat("light.tail", "#ed6958", 0.3), amber: mat("light.amber", "#efb85c", 0.4),
  };
  result.glass.transparent = true; result.glass.opacity = 0.3; result.glass.depthWrite = false; result.glass.side = DoubleSide;
  result.floor.userData.maps = { color: "cabin-floor-color.png", normal: "cabin-floor-normal.png", roughness: "cabin-floor-roughness.png" };
  result.floor.normalScale.set(.12, .12);
  result.windshield.side = DoubleSide;
  result.light.emissive = new Color("#fff5d7"); result.light.emissiveIntensity = 0.8;
  result.red.emissive = new Color("#d74936"); result.red.emissiveIntensity = 0.35;
  result.amber.emissive = new Color("#db8a26"); result.amber.emissiveIntensity = 0.5;
  return result;
}
type Palette = ReturnType<typeof metroMaterials>;

function rounded(path: Shape | Path, x: number, y: number, width: number, height: number, radius: number) {
  path.moveTo(x + radius, y); path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius); path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius); path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y); path.closePath();
}
function rectangle(x: number, y: number, w: number, h: number, r = 0.08) { const s = new Shape(); rounded(s, x, y, w, h, r); return s; }
function hole(s: Shape, x: number, y: number, w: number, h: number, r = 0.08) { const p = new Path(); rounded(p, x, y, w, h, r); s.holes.push(p); }
function mesh(parent: Object3D, name: string, geometry: BufferGeometry, material: MeshStandardMaterial, position = [0, 0, 0]) {
  const node = new Mesh(geometry, material); node.name = name; node.position.set(position[0], position[1], position[2]); node.castShadow = true; node.receiveShadow = true; parent.add(node); return node;
}
function box(parent: Object3D, name: string, size: number[], position: number[], material: MeshStandardMaterial) { return mesh(parent, name, new BoxGeometry(size[0], size[1], size[2]), material, position); }
function bar(parent: Object3D, name: string, from: number[], to: number[], radius: number, material: MeshStandardMaterial) {
  const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a);
  const node = mesh(parent, name, new CylinderGeometry(radius, radius, direction.length(), 8), material, a.clone().add(b).multiplyScalar(0.5).toArray());
  node.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()); return node;
}
function panel(parent: Object3D, name: string, shape: Shape, z: number, material: MeshStandardMaterial, depth = 0.045) {
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 });
  return mesh(parent, name, geo, material, [0, 0, z]);
}
function frame(parent: Object3D, name: string, x: number, y: number, w: number, h: number, z: number, palette: Palette) {
  const border = rectangle(x - 0.045, y - 0.045, w + 0.09, h + 0.09, 0.13); hole(border, x, y, w, h, 0.09);
  panel(parent, `${name}_seal`, border, z, palette.rubber, 0.018);
  mesh(parent, `${name}_glass`, new ShapeGeometry(rectangle(x, y, w, h, 0.09), 5), palette.glass, [0, 0, z + 0.009]);
}
function loft(parent: Object3D, name: string, rings: number[][][], material: MeshStandardMaterial, cap = false) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], n = rings[0].length;
  for (let r = 0; r < rings.length; r++) for (let j = 0; j < n; j++) { positions.push(...rings[r][j]); uvs.push(r / (rings.length - 1), j / (n - 1)); }
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < n - 1; j++) {
    const i = r * n + j; indices.push(i, i + n, i + 1, i + 1, i + n, i + n + 1);
  }
  if (cap) { const start = (rings.length - 1) * n; for (let j = 1; j < n - 2; j++) indices.push(start, start + j + 1, start + j); }
  const geo = new BufferGeometry(); geo.setAttribute("position", new Float32BufferAttribute(positions, 3)); geo.setAttribute("uv", new Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  return mesh(parent, name, geo, material);
}
function anchor(parent: Object3D, name: string, position: number[]) { const point = new Object3D(); point.name = `anchor_${name}`; point.userData.role = "anchor"; point.position.set(...position as [number, number, number]); parent.add(point); }

function makeDoor(parent: Object3D, x: number, side: number, index: number, palette: Palette) {
  for (const direction of [-1, 1]) {
    const root = new Group(); root.name = `door_${side < 0 ? "left" : "right"}_${index}_${direction < 0 ? "a" : "b"}`;
    root.position.x = x + direction * METRO.doorWidth / 4;
    root.userData = { role: "metroDoor", closedX: root.position.x, travel: direction * 0.665, side, index };
    parent.add(root);
    const w = 0.642, y = METRO.floor + 0.022, h = 2.05 - 0.03, z = side * 1.493;
    const skin = rectangle(-w / 2, y, w, h, 0.035); hole(skin, -0.224, y + 0.88, 0.448, 0.92, 0.08);
    panel(root, "door_skin", skin, z - 0.023, palette.shell, 0.046);
    frame(root, "door_window", -0.224, y + 0.88, 0.448, 0.92, z + side * 0.028, palette);
    box(root, "door_line", [w - 0.008, 0.23, 0.009], [0, 1.53, z + side * 0.032], palette.line);
    box(root, "door_seam", [0.014, h - 0.05, 0.01], [-direction * w / 2, y + h / 2, z + side * 0.035], palette.rubber);
    box(root, "door_warning", [0.11, 0.045, 0.012], [0, 1.91, z + side * 0.04], palette.amber);
  }
}

export function createMetroCar(kind: MetroCarKind, palette = metroMaterials()): Group {
  const root = new Group(); root.name = `metro-${kind}-car`;
  root.userData = { kind, units: "metres", forward: "+X", railTop: 0, passengerFloor: METRO.floor, design: "Original Chinese metro inspired game asset; not a certified real vehicle replica" };
  const bodyEnd = kind === "head" ? 8.9 : 11.15;
  const doorXs = kind === "head" ? [-8, -4.45, -0.9, 2.65, 6.2] : [-8.1, -4.05, 0, 4.05, 8.1];
  const windows = doorXs.slice(0, -1).map((v, i) => ({ x: (v + doorXs[i + 1]) / 2, w: doorXs[i + 1] - v - 1.62 }));
  for (const side of [-1, 1]) {
    const shell = rectangle(-11.15, 1.06, bodyEnd + 11.15, 2.24, 0.06);
    doorXs.forEach((x) => hole(shell, x - 0.675, 1.075, 1.35, 2.105, 0.035));
    windows.forEach(({ x, w }) => hole(shell, x - w / 2, 2.04, w, 1.05, 0.1));
    const z = side * 1.47;
    panel(root, "body_side", shell, z - 0.03, palette.shell, 0.06);
    windows.forEach(({ x, w }, i) => frame(root, `passenger_window_${side}_${i}`, x - w / 2, 2.04, w, 1.05, z + side * 0.04, palette));
    const spans: [number, number][] = [];
    let start = -11.15;
    for (const x of doorXs) { spans.push([start, x - 0.675]); start = x + 0.675; }
    spans.push([start, bodyEnd]);
    for (const [a, b] of spans) if (b > a) {
      box(root, "body_line", [b - a, 0.23, 0.014], [(a + b) / 2, 1.53, side * 1.509], palette.line);
      box(root, "lower_skirt", [b - a, 0.3, 0.055], [(a + b) / 2, 0.93, side * 1.43], palette.roof);
    }
    box(root, "roof_line", [bodyEnd + 11.15, 0.047, 0.02], [(bodyEnd - 11.15) / 2, 3.25, side * 1.506], palette.line);
    doorXs.forEach((x, i) => {
      makeDoor(root, x, side, i, palette); anchor(root, `door_${side}_${i}`, [x, 1.1, side * 1.5]);
      box(root, "door_header", [1.4, 0.09, 0.025], [x, 3.215, side * 1.51], palette.rubber);
      box(root, "door_status", [0.17, 0.04, 0.033], [x, 3.221, side * 1.53], palette.amber);
    });
  }
  const roofRing = (x: number) => Array.from({ length: 25 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 24; return [x, 3.25 + Math.cos(a) * 0.48, Math.sin(a) * 1.5]; });
  // Ring winding is outward; the roof has a separate interior ceiling.
  loft(root, "curved_roof", [roofRing(-11.2), roofRing(bodyEnd)].map((r) => r.reverse()), palette.roof);
  for (const x of [-5.4, 4.7]) {
    box(root, "hvac_housing", [2.75, 0.26, 1.62], [x, 3.77, 0], palette.roof);
    for (let j = 0; j < 11; j++) box(root, "hvac_grille", [0.07, 0.012, 1.25], [x - 1.05 + j * 0.21, 3.907, 0], palette.chassis);
  }
  box(root, "underfloor_equipment", [10.6, 0.43, 1.98], [-0.2, 0.73, 0], palette.chassis);
  for (const bx of [-7.75, 7.5]) {
    box(root, "bogie_frame", [2.65, 0.29, 1.72], [bx, 0.61, 0], palette.chassis);
    for (const dx of [-0.88, 0.88]) {
      bar(root, "axle", [bx + dx, 0.425, -1.04], [bx + dx, 0.425, 1.04], 0.085, palette.chassis);
      for (const side of [-1, 1]) {
        const wheel = mesh(root, "wheel", new CylinderGeometry(0.425, 0.425, 0.14, 20), palette.chassis, [bx + dx, 0.425, side * 0.8]); wheel.rotation.x = Math.PI / 2;
        const rim = mesh(root, "wheel_rim", new CylinderGeometry(0.325, 0.325, 0.018, 20), palette.steel, [bx + dx, 0.425, side * 0.881]); rim.rotation.x = Math.PI / 2;
        box(root, "axle_box", [0.31, 0.27, 0.21], [bx + dx, 0.53, side * 1.03], palette.chassis);
      }
    }
    for (const side of [-1, 1]) for (const dx of [-0.45, 0.45]) {
      mesh(root, "air_spring", new CylinderGeometry(0.19, 0.21, 0.23, 12), palette.rubber, [bx + dx, 0.84, side * 0.7]);
    }
  }
  const ends = kind === "head" ? [-1] : [-1, 1];
  for (const sign of ends) {
    const x = sign * 11.16;
    const end = box(root, "end_bulkhead", [0.08, 2.23, 2.9], [x, 2.19, 0], palette.interior);
    // Real gangway aperture, with a floor bridge and ribs outside the end wall.
    root.remove(end); end.geometry.dispose();
    const shape = rectangle(-1.45, 1.09, 2.9, 2.2, 0.1); hole(shape, -0.63, 1.095, 1.26, 1.98, 0.08);
    const wall = mesh(root, "gangway_wall", new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }), palette.interior, [x, 0, 0]); wall.rotation.y = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const rib = rectangle(-0.76, 1.08, 1.52, 2.13, 0.12); hole(rib, -0.65, 1.12, 1.3, 1.92, 0.08);
      const node = mesh(root, "gangway_bellow", new ExtrudeGeometry(rib, { depth: 0.034, bevelEnabled: false, curveSegments: 4 }), palette.rubber, [x + sign * (0.04 + i * 0.041), 0, 0]); node.rotation.y = Math.PI / 2;
    }
    box(root, "gangway_bridge", [0.4, 0.05, 1.32], [x + sign * 0.13, 1.075, 0], palette.steel);
    box(root, "coupler", [0.5, 0.18, 0.24], [x + sign * 0.24, 0.68, 0], palette.chassis);
    anchor(root, `coupler_${sign}`, [sign * 11.4, 0.68, 0]);
  }
  if (kind === "head") {
    const profile = [[-1.34, 1.02], [-1.49, 1.25], [-1.5, 2.99], [-1.43, 3.27], [-1.19, 3.57], [-0.7, 3.71], [0, 3.73], [0.7, 3.71], [1.19, 3.57], [1.43, 3.27], [1.5, 2.99], [1.49, 1.25], [1.34, 1.02], [-1.34, 1.02]];
    // A planar raked face keeps the independently triangulated glazing flush.
    const frontX = (y: number) => 11.38 - (y - 1.3) * 0.31;
    const rings = [0, 0.45, 0.8, 1].map((t) => profile.map(([z, y]) => [8.9 * (1 - t) + frontX(y) * t, y - 0.05 * t, z * (1 - 0.07 * t)]).reverse());
    loft(root, "cab_nose", rings, palette.shell, true);
    function frontPatch(name: string, shape: Shape, material: MeshStandardMaterial, offset = 0.022) {
      const geo = new ShapeGeometry(shape, 8), p = geo.getAttribute("position");
      for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i); p.setXYZ(i, frontX(y + 0.05) + offset, y, z); }
      // Shape is mapped from XY into the forward-facing YZ plane.
      const index = geo.index!; for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a); }
      geo.computeVertexNormals(); return mesh(root, name, geo, material);
    }
    frontPatch("windshield_border", rectangle(-1.19, 2.03, 2.38, 1.32, 0.25), palette.rubber);
    frontPatch("windshield", rectangle(-1.135, 2.09, 2.27, 1.2, 0.22), palette.windshield, 0.027);
    frontPatch("front_jade_mask", rectangle(-1.27, 1.35, 2.54, 0.46, 0.19), palette.line, 0.028);
    for (const side of [-1, 1]) {
      frontPatch("lamp_housing", rectangle(side * 0.91 - 0.23, 1.48, 0.46, 0.2, 0.08), palette.rubber, 0.034);
      frontPatch("headlamp", rectangle(side * 0.91 - 0.18, 1.535, 0.36, 0.08, 0.035), palette.light, 0.04);
      frontPatch("tail_lamp", rectangle(side * 1.16 - 0.055, 1.86, 0.11, 0.1, 0.045), palette.red, 0.04);
      // Driver side glazing follows the converging nose side.
      const sideGeometry = new ShapeGeometry(rectangle(8.98, 2.12, 1.12, 0.8, 0.12)), sidePositions = sideGeometry.getAttribute("position");
      for (let i = 0; i < sidePositions.count; i++) {
        const x = sidePositions.getX(i), y = sidePositions.getY(i), t = (x - 8.9) / (frontX(y + 0.05) - 8.9);
        const edge = y + 0.05 <= 2.99 ? 1.5 : 1.5 - 0.07 * (y + 0.05 - 2.99) / 0.28;
        sidePositions.setXYZ(i, x, y, side * (edge * (1 - 0.07 * t) + 0.025));
      }
      sideGeometry.computeVertexNormals(); mesh(root, "cab_side_window", sideGeometry, palette.windshield);
    }
    frontPatch("destination_display", rectangle(-0.77, 3.03, 1.54, 0.2, 0.045), palette.rubber, 0.04);
    frontPatch("destination_leds", rectangle(-0.59, 3.095, 1.18, 0.04, 0.01), palette.amber, 0.045);
    frontPatch("front_badge", rectangle(-0.12, 1.91, 0.24, 0.045, 0.02), palette.steel, 0.04);
    frontPatch("coupler_hatch", rectangle(-0.48, 1.075, 0.96, 0.18, 0.065), palette.roof);
    bar(root, "wiper", [frontX(2.2) + 0.065, 2.18, -0.72], [frontX(2.7) + 0.065, 2.68, 0.08], 0.012, palette.rubber);
    box(root, "cab_console", [0.62, 0.3, 2.23], [10.1, 1.97, 0], palette.chassis);
    box(root, "cab_partition", [0.06, 2.22, 2.87], [8.83, 2.21, 0], palette.interior);
    anchor(root, "front", [11.4, 1.1, 0]);
  } else {
    box(root, "pantograph_base", [1.2, 0.12, 1.05], [8.5, 3.8, 0], palette.chassis);
    for (const z of [-0.34, 0.34]) {
      bar(root, "pantograph_lower", [8.0, 3.89, z], [8.95, 4.21, z], 0.026, palette.steel);
      bar(root, "pantograph_upper", [8.95, 4.21, z], [8.25, 4.57, z], 0.022, palette.steel);
    }
    box(root, "pantograph_contact", [0.18, 0.055, 1.55], [8.25, 4.6, 0], palette.chassis);
  }
  anchor(root, "floor", [0, 1.1, 0]); anchor(root, "rear", [-11.4, 1.1, 0]);
  // Widen the body and raise its upper shell around the unchanged passenger floor.
  // Running gear keeps its rail gauge; seats and handholds are newly authored below.
  const envelope = new Group(); envelope.name = "metro-body-envelope";
  for (const node of [...root.children]) {
    if (/^(underfloor|bogie|axle|wheel|air_spring|coupler|anchor_coupler)/.test(node.name)) continue;
    envelope.add(node);
  }
  envelope.scale.set(1, METRO_PROFILE.upperHeightFactor, METRO_PROFILE.widthFactor);
  envelope.position.y = METRO.floor * (1 - METRO_PROFILE.upperHeightFactor);
  root.add(envelope);
  root.add(createMetroInterior(bodyEnd, doorXs, windows, palette));
  root.userData.cabin = { version: 2, clearWidth: METRO_PROFILE.interiorHalfWidth * 2, clearHeight: METRO_PROFILE.ceiling - METRO.floor, seatHeight: METRO_PROFILE.seatHeight, mouldedSeats: windows.length * 8, doorBays: doorXs.length };
  return root;
}

export function setMetroDoorProgress(root: Object3D, progress: number) {
  const value = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  root.traverse((node) => { if (node.userData.role === "metroDoor") node.position.x = Number(node.userData.closedX) + Number(node.userData.travel) * value; });
}
export function setMetroLineColor(root: Object3D, color: string) {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) if (material instanceof MeshStandardMaterial && material.name.startsWith("metro.line.")) material.color.set(color);
  });
}

/** Batch static details per material, preserving doors and asset anchors. */
export function batchMetroCar(root: Group) {
  root.updateMatrixWorld(true);
  const collect = (target: Object3D, skipDoors: boolean) => {
    const buckets = new Map<MeshStandardMaterial, BufferGeometry[]>(), remove: Mesh[] = [];
    target.traverse((node) => {
      if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return;
      if (skipDoors) { let parent = node.parent; while (parent && parent !== target) { if (parent.userData.role === "metroDoor") return; parent = parent.parent; } }
      const geo = node.geometry.clone(); node.updateMatrix();
      const relative = target.matrixWorld.clone().invert().multiply(node.matrixWorld); geo.applyMatrix4(relative);
      const flat = geo.index ? geo.toNonIndexed() : geo; if (flat !== geo) geo.dispose();
      const bucket = buckets.get(node.material) ?? []; bucket.push(flat); buckets.set(node.material, bucket); remove.push(node);
    });
    remove.forEach((node) => node.removeFromParent());
    for (const [material, geometries] of buckets) {
      const merged = mergeGeometries(geometries); geometries.forEach((geo) => geo.dispose());
      if (!merged) throw new Error(`Unable to batch ${material.name}`);
      const compact = mergeVertices(merged, .00001); merged.dispose();
      mesh(target, `${target.name}_${material.name}`, compact, material);
    }
    remove.forEach((node) => node.geometry.dispose());
  };
  const doors: Object3D[] = []; root.traverse((node) => { if (node.userData.role === "metroDoor") doors.push(node); });
  doors.forEach((door) => collect(door, false)); collect(root, true); return root;
}
