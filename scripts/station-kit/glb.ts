import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BufferAttribute, Mesh, MeshStandardMaterial, Object3D } from "three";

// Small glTF 2.0 writer for this static, uncompressed kit. No DOM/canvas/polyfills.
// Preserves the scene graph, hinge nodes, anchors, UVs, PBR materials and embedded maps.
export async function exportGlb(root: Object3D, textureDirectory: string) {
  type Json = Record<string, unknown>;
  const chunks: Buffer[] = [], views: Json[] = [], accessors: Json[] = [];
  const nodes: Json[] = [], meshes: Json[] = [], materials: Json[] = [], images: Json[] = [], textures: Json[] = [];
  let offset = 0;
  const geometryIds = new Map<string, number>(), materialIds = new Map<string, number>(), textureIds = new Map<string, number>();
  const append = (data: Buffer, target?: number) => {
    const view = views.length;
    views.push({ buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? { target } : {}) });
    const padding = (4 - data.length % 4) % 4; chunks.push(data, Buffer.alloc(padding)); offset += data.length + padding;
    return view;
  };
  const attribute = (attr: BufferAttribute, indices = false, bounds = false) => {
    const array = attr.array;
    const componentType = array instanceof Float32Array ? 5126 : array instanceof Uint32Array ? 5125 : array instanceof Uint16Array ? 5123 : 5121;
    const value: Json = { bufferView: append(Buffer.from(array.buffer, array.byteOffset, array.byteLength), indices ? 34963 : 34962), componentType, count: attr.count, type: ({ 1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4" } as Record<number, string>)[attr.itemSize] };
    if (bounds) {
      const min = Array(attr.itemSize).fill(Infinity), max = Array(attr.itemSize).fill(-Infinity);
      for (let i = 0; i < attr.count; i++) for (let j = 0; j < attr.itemSize; j++) {
        const v = Number(array[i * attr.itemSize + j]); min[j] = Math.min(min[j], v); max[j] = Math.max(max[j], v);
      }
      value.min = min; value.max = max;
    }
    accessors.push(value); return accessors.length - 1;
  };
  const texture = async (file: string) => {
    const known = textureIds.get(file); if (known !== undefined) return known;
    const data = await readFile(join(textureDirectory, file));
    images.push({ name: file, bufferView: append(data), mimeType: "image/png" });
    const id = textures.length; textures.push({ sampler: 0, source: images.length - 1 }); textureIds.set(file, id); return id;
  };
  const material = async (mat: MeshStandardMaterial) => {
    const known = materialIds.get(mat.uuid); if (known !== undefined) return known;
    const pbr: Json = { baseColorFactor: [mat.color.r, mat.color.g, mat.color.b, mat.opacity], metallicFactor: mat.metalness, roughnessFactor: mat.roughness };
    const value: Json = { name: mat.name, pbrMetallicRoughness: pbr, extras: mat.userData };
    if (mat.transparent) value.alphaMode = "BLEND";
    if (mat.side === 2) value.doubleSided = true;
    const maps = mat.userData.maps as { color: string; normal: string; roughness: string } | undefined;
    if (maps) {
      pbr.baseColorTexture = { index: await texture(maps.color) };
      pbr.metallicRoughnessTexture = { index: await texture(maps.roughness) };
      value.normalTexture = { index: await texture(maps.normal), scale: mat.normalScale.x };
    }
    if (mat.emissiveIntensity) value.emissiveFactor = [mat.emissive.r, mat.emissive.g, mat.emissive.b].map((v) => v * mat.emissiveIntensity);
    materials.push(value); materialIds.set(mat.uuid, materials.length - 1); return materials.length - 1;
  };
  const visit = async (object: Object3D): Promise<number> => {
    const index = nodes.length;
    const node: Json = {
      name: object.name, translation: object.position.toArray(), rotation: object.quaternion.toArray(),
      scale: object.scale.toArray(), extras: object.userData,
    };
    nodes.push(node);
    if (object instanceof Mesh) {
      if (!(object.material instanceof MeshStandardMaterial)) throw new Error("Unsupported material on " + object.name);
      const key = object.geometry.uuid + ":" + object.material.uuid;
      let meshId = geometryIds.get(key);
      if (meshId === undefined) {
        const geo = object.geometry;
        const primitive: Json = {
          attributes: {
            POSITION: attribute(geo.getAttribute("position") as BufferAttribute, false, true),
            NORMAL: attribute(geo.getAttribute("normal") as BufferAttribute),
            TEXCOORD_0: attribute(geo.getAttribute("uv") as BufferAttribute),
          },
          material: await material(object.material),
        };
        if (geo.index) primitive.indices = attribute(geo.index, true);
        if (geo.hasAttribute("tangent") && object.material.userData.maps) {
          (primitive.attributes as Json).TANGENT = attribute(geo.getAttribute("tangent") as BufferAttribute);
        }
        meshId = meshes.length; meshes.push({ name: object.name, primitives: [primitive] }); geometryIds.set(key, meshId);
      }
      node.mesh = meshId;
    }
    if (object.children.length) {
      const children: number[] = [];
      for (const child of object.children) children.push(await visit(child));
      node.children = children;
    }
    return index;
  };
  const rootId = await visit(root);
  const json: Json = {
    asset: { version: "2.0", generator: "AI Hunter station-kit v1" }, scene: 0,
    scenes: [{ name: root.name, nodes: [rootId] }], nodes, meshes, materials, accessors,
    bufferViews: views, buffers: [{ byteLength: offset }],
    ...(images.length ? { images, textures, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(json)), jsonPadding = (4 - encoded.length % 4) % 4;
  const jsonChunk = Buffer.concat([encoded, Buffer.alloc(jsonPadding, 32)]), binary = Buffer.concat(chunks);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);
  jsonHeader.writeUInt32LE(jsonChunk.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return { bytes: Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binary]), json };
}
