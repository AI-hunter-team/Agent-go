import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AnimationClip, AnimationMixer, Bone, Box3, Color, CylinderGeometry, ExtrudeGeometry, Matrix4, Quaternion, QuaternionKeyframeTrack, Shape, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createProceduralLocomotion } from "../src/ui/scene/proceduralLocomotion";

interface GltfNode { name?: string; children?: number[]; mesh?: number; skin?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface GltfDocument {
  asset: Record<string, unknown>; nodes: GltfNode[]; buffers: { byteLength: number }[];
  bufferViews: Record<string, unknown>[]; accessors: Record<string, unknown>[];
  meshes: { name?: string; primitives: Record<string, unknown>[] }[];
  materials: Record<string, unknown>[]; animations?: Record<string, unknown>[];
  images?: unknown[]; textures?: unknown[];
}

/** 解开自包含 GLB，保留原始贴图和网格二进制，后续只追加帽子及动画。 */
function unpackGlb(bytes: Buffer): { json: GltfDocument; binary: Buffer } {
  if (bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2) throw new Error("输入必须为 GLB 2.0");
  const jsonLength = bytes.readUInt32LE(12);
  const binaryOffset = 20 + jsonLength;
  return { json: JSON.parse(bytes.subarray(20, binaryOffset).toString()), binary: bytes.subarray(binaryOffset + 8, binaryOffset + 8 + bytes.readUInt32LE(binaryOffset)) };
}

/** 写出完整 GLB，JSON/BIN 都按四字节对齐。 */
function packGlb(json: GltfDocument, binary: Buffer): Buffer {
  json.buffers[0].byteLength = binary.length;
  const text = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20); text.copy(paddedJson);
  const paddedBinary = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(paddedBinary);
  const header = Buffer.alloc(20);
  header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + paddedJson.length + paddedBinary.length, 8);
  header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(paddedBinary.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binaryHeader, paddedBinary]);
}

/** 在 Node 中加载真实骨架；仅移除临时副本的贴图，导出文件仍保留原始贴图字节。 */
async function loadRig(json: GltfDocument, binary: Buffer) {
  const copy = structuredClone(json);
  delete copy.images; delete copy.textures; copy.materials = [];
  for (const mesh of copy.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const bytes = packGlb(copy, binary);
  return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
}

/** 制作戴帽、闭合包握并低持警棍的完整角色，保留贴图并烘焙动画。 */
async function main() {
  const input = resolve(process.argv[2] ?? "public/models/naiwa.glb");
  const output = resolve(process.argv[3] ?? "public/models/naiwa-security.glb");
  const { json, binary } = unpackGlb(await readFile(input));
  const gltf = await loadRig(json, binary);
  gltf.scene.updateMatrixWorld(true);
  const head = gltf.scene.getObjectByName("mixamorigHead");
  if (!(head instanceof Bone)) throw new Error("未找到奶娃头部骨骼");
  const bounds = new Box3().setFromObject(gltf.scene);
  const height = bounds.max.y - bounds.min.y;
  const center = bounds.getCenter(new Vector3());
  const parts: Buffer[] = [binary];
  let byteLength = binary.length;

  /** 追加一个访问器及其二进制块，保留所有原访问器编号。 */
  function accessor(values: Float32Array | Uint32Array, type: string, target?: number, min?: number[], max?: number[]): number {
    const padding = (4 - byteLength % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); byteLength += padding; }
    const data = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
    const view = json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, ...(target ? { target } : {}) }) - 1;
    parts.push(data); byteLength += data.length;
    const size = type === "VEC3" ? 3 : type === "VEC4" ? 4 : 1;
    return json.accessors.push({ bufferView: view, componentType: values instanceof Uint32Array ? 5125 : 5126, count: values.length / size, type, ...(min ? { min, max } : {}) }) - 1;
  }

  /** 为帽子创建独立 PBR 材质，不更改角色原材质。 */
  function material(name: string, color: string, metallic = 0): number {
    return json.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...new Color(color).toArray(), 1], metallicFactor: metallic, roughnessFactor: metallic ? 0.4 : 0.65 } }) - 1;
  }
  const navy = material("Security navy", "#18304e");
  const black = material("Visor leather", "#101823");
  const gold = material("Warm brass", "#d6af53", 0.55);

  // 帽子以世界向上制作，再换算为头骨局部矩阵，头部转动时帽子一起跟随。
  const hatWorld = new Matrix4().compose(new Vector3(center.x, bounds.max.y - height * 0.075, center.z), new Quaternion(), new Vector3(0.88, 0.88, 0.88));
  const hatIndex = json.nodes.push({ name: "SecurityCap", matrix: head.matrixWorld.clone().invert().multiply(hatWorld).toArray(), children: [] }) - 1;
  const headIndex = json.nodes.findIndex((node) => node.name === "mixamorig:Head");
  (json.nodes[headIndex].children ??= []).push(hatIndex);
  const radius = height * 0.205;

  /** 把几何体追加为帽子或手持道具的网格子节点。 */
  function capPart(name: string, geometry: BufferGeometry, materialIndex: number, parent = hatIndex): void {
    const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const attributes = {
      POSITION: accessor(new Float32Array(position.array), "VEC3", 34962, box.min.toArray(), box.max.toArray()),
      NORMAL: accessor(new Float32Array(normal.array), "VEC3", 34962),
    };
    const indices = geometry.index ? accessor(new Uint32Array(geometry.index.array), "SCALAR", 34963) : undefined;
    const mesh = json.meshes.push({ name, primitives: [{ attributes, material: materialIndex, ...(indices !== undefined ? { indices } : {}) }] }) - 1;
    const node = json.nodes.push({ name, mesh }) - 1;
    json.nodes[parent].children!.push(node); geometry.dispose();
  }

  capPart("CapBand", new CylinderGeometry(radius, radius * 0.98, height * 0.045, 48).translate(0, height * 0.012, 0), black);
  capPart("CapCrown", new CylinderGeometry(radius * 1.12, radius, height * 0.075, 48).translate(0, height * 0.068, 0), navy);
  capPart("CapTop", new SphereGeometry(radius * 1.12, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.28, 1).translate(0, height * 0.105, 0), navy);
  capPart("GoldPiping", new TorusGeometry(radius * 1.015, height * 0.003, 6, 64).rotateX(Math.PI / 2).translate(0, height * 0.036, 0), gold);

  const visor = new Shape();
  visor.moveTo(-radius * 0.92, radius * 0.13);
  visor.bezierCurveTo(-radius * 1.1, radius, -radius * 0.9, radius * 1.6, 0, radius * 1.6);
  visor.bezierCurveTo(radius * 0.9, radius * 1.6, radius * 1.1, radius, radius * 0.92, radius * 0.13);
  visor.quadraticCurveTo(0, radius * 0.5, -radius * 0.92, radius * 0.13);
  capPart("PeakedVisor", new ExtrudeGeometry(visor, { depth: height * 0.009, bevelEnabled: true, bevelThickness: height * 0.002, bevelSize: height * 0.003, bevelSegments: 2, curveSegments: 20 }).rotateX(Math.PI / 2).translate(0, -height * 0.008, 0), black);
  capPart("BrassCord", new TorusGeometry(radius * 1.025, height * 0.004, 6, 32, Math.PI).rotateX(Math.PI / 2).translate(0, height * 0.005, 0), gold);

  const shield = new Shape();
  shield.moveTo(-0.027, 0.024); shield.lineTo(0.027, 0.024); shield.lineTo(0.024, -0.008);
  shield.quadraticCurveTo(0.018, -0.024, 0, -0.033); shield.quadraticCurveTo(-0.018, -0.024, -0.024, -0.008); shield.closePath();
  capPart("SecurityShield", new ExtrudeGeometry(shield, { depth: 0.006, bevelEnabled: false }).scale(height, height, height).translate(0, height * 0.047, radius * 1.075), gold);
  capPart("ShieldInset", new ExtrudeGeometry(shield, { depth: 0.005, bevelEnabled: false }).scale(height * 0.75, height * 0.75, height).translate(0, height * 0.048, radius * 1.075 + 0.006), navy);
  const star = new Shape();
  for (let index = 0; index < 10; index++) {
    const angle = Math.PI / 2 + index * Math.PI / 5, r = height * (index % 2 ? 0.006 : 0.014);
    if (index === 0) star.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else star.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  star.closePath();
  capPart("ShieldStar", new ExtrudeGeometry(star, { depth: height * 0.004, bevelEnabled: false }).translate(0, height * 0.047, radius * 1.075 + 0.012), gold);

  const clips = createProceduralLocomotion(gltf.scene);
  if (!clips.length) throw new Error("奶娃骨架无法生成巡逻步态");
  const idle = clips.find((clip) => clip.name === "Idle")!;
  idle.duration = 4.2;
  for (const track of idle.tracks) for (let index = 0; index < track.times.length; index++) track.times[index] *= idle.duration;
  const axis = new Vector3(0, 1, 0).applyQuaternion(head.parent!.getWorldQuaternion(new Quaternion()).invert());
  const times = new Float32Array(41), values = new Float32Array(164);
  for (let index = 0; index <= 40; index++) {
    times[index] = index / 40 * idle.duration;
    // 两侧接近 29°，平滑减速并稍作停留，便于看出警戒观察动作。
    const angle = Math.tanh(Math.sin(index / 40 * Math.PI * 2) * 2) / Math.tanh(2) * 0.5;
    new Quaternion().setFromAxisAngle(axis, angle).multiply(head.quaternion).toArray(values, index * 4);
  }
  values.set(values.subarray(0, 4), 160);
  idle.tracks.push(new QuaternionKeyframeTrack(`${head.uuid}.quaternion`, times, values));

  // 先略抬前臂形成持棍姿态，再用真正的掌心横轴定位握柄。
  const poseMixer = new AnimationMixer(gltf.scene);
  poseMixer.clipAction(idle).play(); poseMixer.setTime(0); gltf.scene.updateMatrixWorld(true);
  const forearm = gltf.scene.getObjectByName("mixamorigRightForeArm")!;
  const lateral = gltf.scene.getObjectByName("mixamorigRightUpLeg")!.getWorldPosition(new Vector3()).sub(gltf.scene.getObjectByName("mixamorigLeftUpLeg")!.getWorldPosition(new Vector3())).normalize();
  const elbowAxis = lateral.clone().applyQuaternion(forearm.parent!.getWorldQuaternion(new Quaternion()).invert());
  const elbowBend = new Quaternion().setFromAxisAngle(elbowAxis, 0.85);
  for (const clip of clips) {
    const track = clip.tracks.find((track) => track.name === `${forearm.uuid}.quaternion`)!;
    for (let offset = 0; offset < track.values.length; offset += 4) new Quaternion().fromArray(track.values, offset).premultiply(elbowBend).normalize().toArray(track.values, offset);
  }
  poseMixer.setTime(0); gltf.scene.updateMatrixWorld(true);
  const hand = gltf.scene.getObjectByName("mixamorigRightHand")!;
  const middle = gltf.scene.getObjectByName("mixamorigRightHandMiddle1")!;
  const index = gltf.scene.getObjectByName("mixamorigRightHandIndex1")!;
  const pinky = gltf.scene.getObjectByName("mixamorigRightHandPinky1")!;
  const fingerPoses = new Map<Object3D, Quaternion>();

  /** 固定握持关节的局部姿态，并及时更新子骨骼供后续手指定位。 */
  function setGripRotation(bone: Object3D, rotation: Quaternion): void {
    bone.quaternion.copy(rotation).normalize(); fingerPoses.set(bone, bone.quaternion.clone()); gltf.scene.updateMatrixWorld(true);
  }

  // 手腕顺着低持方向放松，让长棍朝外下方，呈日常巡逻姿态。
  const originalWidth = pinky.getWorldPosition(new Vector3()).sub(index.getWorldPosition(new Vector3())).normalize();
  const desiredWidth = new Vector3(0, 0.8, 0.6).addScaledVector(lateral, -0.18).normalize();
  const inverseWristParent = hand.parent!.getWorldQuaternion(new Quaternion()).invert();
  const wristAdjustment = new Quaternion().setFromUnitVectors(originalWidth.applyQuaternion(inverseWristParent), desiredWidth.applyQuaternion(inverseWristParent));
  setGripRotation(hand, wristAdjustment.multiply(hand.quaternion));
  const palmWidth = pinky.getWorldPosition(new Vector3()).sub(index.getWorldPosition(new Vector3())).normalize();
  const fingerDirection = middle.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3())).normalize();
  const palmNormal = palmWidth.clone().cross(fingerDirection).normalize();
  const grip = middle.getWorldPosition(new Vector3()).addScaledVector(palmNormal, height * 0.014).addScaledVector(fingerDirection, -height * 0.004);

  /** 沿掌心横轴弯曲指节，使四指围绕握柄闭合。 */
  function curlFinger(bone: Object3D, angle: number): void {
    const localAxis = palmWidth.clone().applyQuaternion(bone.parent!.getWorldQuaternion(new Quaternion()).invert());
    setGripRotation(bone, new Quaternion().setFromAxisAngle(localAxis, angle).multiply(bone.quaternion));
  }

  /** 将拇指朝握柄外侧的接触点对拢，形成压在四指外侧的包握。 */
  function aimThumb(bone: Object3D, child: Object3D, target: Vector3): void {
    const inverseParent = bone.parent!.getWorldQuaternion(new Quaternion()).invert();
    const origin = bone.getWorldPosition(new Vector3());
    const from = child.getWorldPosition(new Vector3()).sub(origin).normalize().applyQuaternion(inverseParent);
    const to = target.clone().sub(origin).normalize().applyQuaternion(inverseParent);
    setGripRotation(bone, new Quaternion().setFromUnitVectors(from, to).multiply(bone.quaternion));
  }

  for (const name of ["Index", "Middle", "Ring", "Pinky"]) for (const [joint, angle] of [[1, 0.96], [2, 1.22], [3, 0.61]]) {
    curlFinger(gltf.scene.getObjectByName(`mixamorigRightHand${name}${joint}`)!, angle);
  }
  const thumb1 = gltf.scene.getObjectByName("mixamorigRightHandThumb1")!;
  const thumb2 = gltf.scene.getObjectByName("mixamorigRightHandThumb2")!;
  const thumb3 = gltf.scene.getObjectByName("mixamorigRightHandThumb3")!;
  const thumb4 = gltf.scene.getObjectByName("mixamorigRightHandThumb4")!;
  aimThumb(thumb1, thumb2, grip.clone().addScaledVector(palmNormal, height * 0.018).addScaledVector(fingerDirection, height * 0.012).addScaledVector(palmWidth, -height * 0.012));
  aimThumb(thumb2, thumb3, grip.clone().addScaledVector(palmNormal, height * 0.017).addScaledVector(fingerDirection, height * 0.004).addScaledVector(palmWidth, height * 0.008));
  aimThumb(thumb3, thumb4, grip.clone().addScaledVector(palmNormal, height * 0.01).addScaledVector(fingerDirection, -height * 0.005).addScaledVector(palmWidth, height * 0.01));
  for (const clip of clips) for (const [bone, rotation] of fingerPoses) clip.tracks.push(new QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, [0, clip.duration], [...rotation.toArray(), ...rotation.toArray()]));
  const batonWorld = new Matrix4().compose(grip, new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), palmWidth), new Vector3(1, 1, 1));
  const batonIndex = json.nodes.push({ name: "SecurityBaton", matrix: hand.matrixWorld.clone().invert().multiply(batonWorld).toArray(), children: [] }) - 1;
  const handIndex = json.nodes.findIndex((node) => node.name === "mixamorig:RightHand");
  (json.nodes[handIndex].children ??= []).push(batonIndex);
  poseMixer.stopAllAction(); poseMixer.uncacheRoot(gltf.scene); gltf.scene.updateMatrixWorld(true);
  const rubber = material("Baton rubber", "#202831");
  capPart("BatonShaft", new CylinderGeometry(height * 0.013, height * 0.015, height * 0.27, 20).translate(0, -height * 0.19, 0), rubber, batonIndex);
  capPart("BatonHandle", new CylinderGeometry(height * 0.014, height * 0.014, height * 0.12, 20), black, batonIndex);
  capPart("BatonTip", new SphereGeometry(height * 0.015, 16, 8).translate(0, -height * 0.325, 0), rubber, batonIndex);
  capPart("BatonPommel", new SphereGeometry(height * 0.017, 16, 8).scale(1, 0.6, 1).translate(0, height * 0.06, 0), rubber, batonIndex);
  capPart("BatonGuard", new TorusGeometry(height * 0.02, height * 0.004, 6, 24).rotateX(Math.PI / 2).translate(0, -height * 0.055, 0), black, batonIndex);
  for (let index = 0; index < 5; index++) capPart(`GripRing${index}`, new TorusGeometry(height * 0.014, height * 0.0015, 5, 20).rotateX(Math.PI / 2).translate(0, height * (-0.035 + index * 0.018), 0), rubber, batonIndex);

  /** 把运行时四元数轨道烘焙为标准 glTF 动画，并把被动画驱动的矩阵节点展开为 TRS。 */
  function bakeClip(clip: AnimationClip): void {
    const channels: Record<string, unknown>[] = [], samplers: Record<string, unknown>[] = [];
    for (const track of clip.tracks) {
      const uuid = track.name.slice(0, track.name.lastIndexOf("."));
      const object = gltf.scene.getObjectByProperty("uuid", uuid) as Object3D;
      const association = gltf.parser.associations.get(object) as { nodes?: number } | undefined;
      const nodeIndex = association?.nodes;
      if (nodeIndex === undefined) throw new Error(`找不到动画节点：${object?.name}`);
      const node = json.nodes[nodeIndex];
      delete node.matrix;
      node.translation = object.position.toArray(); node.rotation = object.quaternion.toArray(); node.scale = object.scale.toArray();
      const input = accessor(new Float32Array(track.times), "SCALAR", undefined, [0], [clip.duration]);
      const output = accessor(new Float32Array(track.values), "VEC4");
      const sampler = samplers.push({ input, output, interpolation: "LINEAR" }) - 1;
      channels.push({ sampler, target: { node: nodeIndex, path: "rotation" } });
    }
    (json.animations ??= []).push({ name: clip.name, samplers, channels });
  }
  for (const clip of clips) bakeClip(clip);
  // 文件默认以放松站姿打开，帽子/警棍参与包围盒时不会被原来的平举双臂拉偏中心。
  for (const track of idle.tracks) {
    const object = gltf.scene.getObjectByProperty("uuid", track.name.slice(0, track.name.lastIndexOf(".")))!;
    const nodeIndex = (gltf.parser.associations.get(object) as { nodes: number }).nodes;
    json.nodes[nodeIndex].rotation = Array.from(track.values.slice(0, 4));
  }
  json.asset.extras = { ...(json.asset.extras as Record<string, unknown> ?? {}), agentGo: "奶娃保安：缩小保安帽、右手警棍、增强待机观察及 Idle/Walk，源模型贴图与蒙皮保留" };
  const result = packGlb(json, Buffer.concat(parts));
  await writeFile(output, result);
  console.log(JSON.stringify({ output: output.split(/[\\/]/).at(-1), bytes: result.length, animations: clips.map((clip) => clip.name), capParts: json.nodes[hatIndex].children!.length, batonParts: json.nodes[batonIndex].children!.length }));
}

await main();
