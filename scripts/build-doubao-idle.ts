import { readFile, writeFile } from "node:fs/promises";
import { AnimationMixer, Bone, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createProceduralLocomotion } from "../src/ui/scene/proceduralLocomotion";

/** 保留原始网格与贴图二进制，将JSON和BIN打包为四字节对齐的GLB。 */
function pack(json: Record<string, any>, binary: Buffer): Buffer {
  json.buffers[0].byteLength = binary.length;
  const text = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20); text.copy(paddedJson);
  const paddedBin = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(paddedBin);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + paddedJson.length + paddedBin.length, 8);
  header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(paddedBin.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binHeader, paddedBin]);
}

/** 从用户原始豆包制作双脚站稳、双臂下垂的固定Idle，同时保留原行走动画。 */
async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("用法：npx tsx scripts/build-doubao-idle.ts <原始豆包.glb> [输出.glb]");
  const bytes = await readFile(input), length = bytes.readUInt32LE(12), offset = 20 + length;
  if (bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2) throw new Error("输入必须为GLB2.0");
  const json = JSON.parse(bytes.subarray(20, offset).toString());
  const binary = bytes.subarray(offset + 8, offset + 8 + bytes.readUInt32LE(offset));
  const stripped = structuredClone(json);
  delete stripped.images; delete stripped.textures; delete stripped.materials;
  for (const mesh of stripped.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const model = (await new GLTFLoader().parseAsync(new Uint8Array(pack(stripped, binary)).buffer, "")).scene;
  const idle = createProceduralLocomotion(model).find(clip => clip.name === "Idle");
  if (!idle) throw new Error("未识别到豆包人形骨架");
  const mixer = new AnimationMixer(model); mixer.clipAction(idle).play(); mixer.update(0);
  model.updateMatrixWorld(true);
  const leftThigh = model.getObjectByName("mixamorigLeftUpLeg")!, rightThigh = model.getObjectByName("mixamorigRightUpLeg")!;
  const up = new Vector3(0, 1, 0), right = rightThigh.getWorldPosition(new Vector3()).sub(leftThigh.getWorldPosition(new Vector3()));
  right.addScaledVector(up, -right.dot(up)).normalize();
  for (const [side, sign] of [["Left", -1], ["Right", 1]] as const) {
    const arm = model.getObjectByName(`mixamorig${side}Arm`)!, elbow = model.getObjectByName(`mixamorig${side}ForeArm`)!;
    const parentInverse = arm.parent!.getWorldQuaternion(new Quaternion()).invert();
    const direction = elbow.getWorldPosition(new Vector3()).sub(arm.getWorldPosition(new Vector3())).normalize().applyQuaternion(parentInverse);
    const target = up.clone().negate().addScaledVector(right, sign * 0.16).normalize().applyQuaternion(parentInverse);
    arm.quaternion.premultiply(new Quaternion().setFromUnitVectors(direction, target)).normalize();
  }
  const parts = [binary]; let size = binary.length;
  /** 追加Float32访问器，不覆盖原资产的任何缓冲视图。 */
  function accessor(values: number[], type: string, min?: number[], max?: number[]): number {
    const padding = (4 - size % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); size += padding; }
    const array = new Float32Array(values), data = Buffer.from(array.buffer);
    const view = json.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: data.length }) - 1;
    parts.push(data); size += data.length;
    return json.accessors.push({ bufferView: view, componentType: 5126, count: values.length / (type === "VEC4" ? 4 : type === "VEC3" ? 3 : 1), type, ...(min ? { min, max } : {}) }) - 1;
  }
  const time = accessor([0, 2], "SCALAR", [0], [2]);
  const samplers: object[] = [], channels: object[] = [];
  for (const node of json.skins[0].joints as number[]) {
    const source = json.nodes[node], bone = model.getObjectByName(source.name.replace(/[:.\[\]\/]/g, ""));
    if (!(bone instanceof Bone)) throw new Error(`找不到骨骼 ${source.name}`);
    for (const [path, values] of [["translation", bone.position.toArray()], ["rotation", bone.quaternion.toArray()], ["scale", bone.scale.toArray()]] as const) {
      source[path] = values;
      const sampler = samplers.push({ input: time, output: accessor([...values, ...values], path === "rotation" ? "VEC4" : "VEC3"), interpolation: "LINEAR" }) - 1;
      channels.push({ sampler, target: { node, path } });
    }
  }
  json.animations = [...(json.animations ?? []).filter((clip: { name: string }) => clip.name !== "Idle"), { name: "Idle", samplers, channels }];
  await writeFile(process.argv[3] ?? "public/models/doubao.glb", pack(json, Buffer.concat(parts)));
  mixer.stopAllAction(); mixer.uncacheRoot(model);
  console.log("豆包Idle已写入，保留原始行走片段、网格和贴图。");
}

// 生成失败时输出原因并返回非零状态，避免误把旧模型当作新产物。
void main().catch(error => { console.error(error); process.exitCode = 1; });
