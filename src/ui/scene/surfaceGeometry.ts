import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
export type XYZ = [number, number, number];
/** Project after dimensions/transforms: one texture tile always represents the same metres. */
export function metreUV(geometry: BufferGeometry, metres = 1, crossGrain = false) {
  const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal"), uv = geometry.getAttribute("uv");
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(n.getX(i)), y = Math.abs(n.getY(i)), z = Math.abs(n.getZ(i));
    const horizontal=y>x&&y>z;
    const u=(x>y&&x>z?p.getZ(i):p.getX(i))/metres,v=(horizontal?p.getZ(i):p.getY(i))/metres;
    uv.setXY(i,crossGrain&&horizontal?v:u,crossGrain&&horizontal?u:v);
  }
  return geometry;
}
export class SurfaceBuilder {
  private buckets = new Map<MeshStandardMaterial, BufferGeometry[]>();
  add(material: MeshStandardMaterial, geometry: BufferGeometry, matrix?: Matrix4) {
    if (matrix) geometry.applyMatrix4(matrix);
    metreUV(geometry, Number(material.userData.metres ?? 1), !!material.userData.crossGrain);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry; if (flat !== geometry) geometry.dispose();
    const list = this.buckets.get(material) ?? []; list.push(flat); this.buckets.set(material, list); return this;
  }
  box(material: MeshStandardMaterial, size: XYZ, at: XYZ, tilt = 0) {
    const geometry = new BoxGeometry(...size); if (tilt) geometry.rotateZ(tilt); geometry.translate(...at); return this.add(material, geometry);
  }
  bar(material: MeshStandardMaterial, from: XYZ, to: XYZ, radius = .028) {
    const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a);
    const geometry = new CylinderGeometry(radius, radius, direction.length(), 8);
    geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()));
    geometry.translate(...a.add(b).multiplyScalar(.5).toArray() as XYZ); return this.add(material, geometry);
  }
  finish(name: string) {
    const root = new Group(); root.name = name;
    for (const [material, pieces] of this.buckets) {
      const geometry = mergeGeometries(pieces); pieces.forEach(p => p.dispose()); if (!geometry) throw new Error(`Cannot merge ${name}/${material.name}`);
      const mesh = new Mesh(geometry, material); mesh.name = `${name}/${material.name}`; mesh.castShadow = !material.transparent; mesh.receiveShadow = !material.transparent; root.add(mesh);
    }
    this.buckets.clear(); return root;
  }
}
/** Geometry is owned here; palettes/loader textures are disposed by their own owners. */
export function disposeSurfaceGeometry(root: Object3D) { root.traverse(node => { if (node instanceof Mesh) node.geometry.dispose(); }); }
