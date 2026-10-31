import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STAIRS_BOTTOM, STAIRS_TOP } from "../../sim/layout";

export const STAIR_DETAILS = {
  count: 20, width: 4, drop: 2, slab: 0.035, grooveWidth: 0.008, grooveDepth: 0.003,
  grooveOffsets: [0.13, 0.095], edgeMargin: 0.1,
} as const;

/** Closed visual stair body; simulation endpoints and linear descent stay authoritative. */
export function createStationStairs(stone: MeshStandardMaterial): Group {
  const run = STAIRS_BOTTOM.x - STAIRS_TOP.x, going = run / STAIR_DETAILS.count, rise = STAIR_DETAILS.drop / STAIR_DETAILS.count;
  const { count, width, drop, slab, grooveWidth, grooveDepth, edgeMargin } = STAIR_DETAILS;
  const solids: BufferGeometry[] = [], inlays: BufferGeometry[] = [];
  const block = (list: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, bevel = 0) => {
    const geometry = bevel ? new RoundedBoxGeometry(w, h, d, 2, bevel) : new BoxGeometry(w, h, d);
    geometry.translate(x, y, z); list.push(geometry);
  };
  const profile = new Shape(); profile.moveTo(0, -rise - slab);
  for (let i = 0; i < count; i++) {
    const top = -(i + 1) * rise;
    profile.lineTo((i + 1) * going, top - slab);
    if (i < count - 1) profile.lineTo((i + 1) * going, top - rise - slab);
    // Top plates leave two real recesses, with stone borders at both sides.
    const start = i * going, end = (i + 1) * going;
    let cursor = start;
    for (const offset of STAIR_DETAILS.grooveOffsets) {
      const grooveStart = end - offset, grooveEnd = grooveStart + grooveWidth;
      block(solids, grooveStart - cursor, slab, width - edgeMargin * 2, (cursor + grooveStart) / 2, top - slab / 2, 0);
      block(inlays, grooveWidth, slab - grooveDepth, width - edgeMargin * 2, (grooveStart + grooveEnd) / 2, top - (slab + grooveDepth) / 2, 0);
      cursor = grooveEnd;
    }
    // The last strip forms a rounded stone nosing; it never extends past an endpoint.
    block(solids, end - cursor, slab, width - edgeMargin * 2, (cursor + end) / 2, top - slab / 2, 0, 0.003);
    for (const sign of [-1, 1]) block(solids, going, slab, edgeMargin, start + going / 2, top - slab / 2, sign * (width - edgeMargin) / 2);
  }
  profile.lineTo(run, -drop - 0.12); profile.lineTo(0, -drop - 0.12); profile.closePath();
  const body = new ExtrudeGeometry(profile, { depth: width, bevelEnabled: false, steps: 1 });
  body.translate(0, 0, -width / 2); solids.push(body);
  // Small landing caps and expansion joints sit clear of the existing floor surface.
  for (const [x, elevation, sign] of [[0, 0, -1], [run, -drop, 1]]) {
    block(solids, 0.048, 0.035, width, x + sign * 0.022, elevation - 0.0145, 0, 0.003);
    block(inlays, 0.008, 0.003, width - 0.04, x + sign * 0.075, elevation + 0.0025, 0);
  }
  // World-sized stone UVs keep the same grain scale on treads, risers and sides.
  for (const geometry of solids) {
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), uv = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
      uv.setXY(i, (nx > ny && nx > nz ? positions.getZ(i) : positions.getX(i)) / 3, (ny > nx && ny > nz ? positions.getZ(i) : positions.getY(i)) / 3);
    }
  }
  const merge = (parts: BufferGeometry[]) => {
    const triangles = parts.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry);
    const geometry = mergeGeometries(triangles)!;
    new Set([...parts, ...triangles]).forEach((part) => part.dispose()); return geometry;
  };
  const root = new Group(); root.name = "station-stairs"; root.position.set(STAIRS_TOP.x, 0, STAIRS_TOP.y);
  root.userData = { count, going, rise, width, drop, grooveCount: count * 2, grooveDepth, upper: [STAIRS_TOP.x, 0, STAIRS_TOP.y], lower: [STAIRS_BOTTOM.x, -drop, STAIRS_BOTTOM.y] };
  const bodyMesh = new Mesh(merge(solids), stone); bodyMesh.name = "stairs_stone";
  const grooveMaterial = new MeshStandardMaterial({ color: "#303632", roughness: 0.96 }); grooveMaterial.name = "stairs.anti-slip.charcoal";
  const grooves = new Mesh(merge(inlays), grooveMaterial); grooves.name = "stairs_anti_slip";
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; grooves.receiveShadow = true;
  root.add(bodyMesh, grooves); root.updateMatrixWorld(true); return root;
}

export function disposeStationStairs(root: Group) {
  root.traverse((node) => { if (node instanceof Mesh) node.geometry.dispose(); });
  (root.getObjectByName("stairs_anti_slip") as Mesh<BufferGeometry, MeshStandardMaterial>).material.dispose();
}
