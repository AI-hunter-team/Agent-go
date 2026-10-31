import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { AnimationMixer, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createProceduralLocomotion } from "../src/ui/scene/proceduralLocomotion";

/** 读取真实 GLB 的骨架和蒙皮；仅在 Node 验证中去除贴图，避免依赖浏览器图像解码。 */
async function loadPlayerRig(name = "dafeiyu") {
  const buffer = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const binaryOffset = 20 + jsonLength;
  delete json.images; delete json.textures; delete json.materials;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(paddedJson);
  const header = Buffer.from(buffer.subarray(0, 20));
  header.writeUInt32LE(paddedJson.length, 12);
  header.writeUInt32LE(20 + paddedJson.length + buffer.length - binaryOffset, 8);
  const glb = Buffer.concat([header, paddedJson, buffer.subarray(binaryOffset)]);
  return new GLTFLoader().parseAsync(new Uint8Array(glb).buffer, "");
}

it("为真实大肥鱼骨架生成闭合步态，驱动脚和手臂且不产生世界位移", async () => {
  const { scene: model } = await loadPlayerRig();
  const bones = new Map<string, Object3D>();
  model.traverse((object) => bones.set(object.name, object));
  const leftFoot = [...bones.values()].find((bone) => /LeftFoot$/.test(bone.name))!;
  const leftHand = [...bones.values()].find((bone) => /LeftHand$/.test(bone.name))!;
  const originalRotation = leftFoot.quaternion.clone();
  const originalPosition = model.position.clone();
  const clips = createProceduralLocomotion(model);
  expect(clips.map((clip) => clip.name)).toEqual(["Idle", "Walk"]);
  expect(leftFoot.quaternion.equals(originalRotation)).toBe(true);
  for (const clip of clips) for (const track of clip.tracks) {
    expect(track.name.endsWith(".quaternion")).toBe(true);
    expect([...track.values.slice(-4)]).toEqual([...track.values.slice(0, 4)]);
  }
  const mixer = new AnimationMixer(model);
  mixer.clipAction(clips[1]).play();
  mixer.setTime(0.25); model.updateMatrixWorld(true);
  const foot = leftFoot.getWorldPosition(new Vector3());
  const hand = leftHand.getWorldPosition(new Vector3());
  mixer.setTime(0.75); model.updateMatrixWorld(true);
  expect(leftFoot.getWorldPosition(new Vector3()).distanceTo(foot)).toBeGreaterThan(0.1);
  expect(leftHand.getWorldPosition(new Vector3()).distanceTo(hand)).toBeGreaterThan(0.03);
  expect(model.position.equals(originalPosition)).toBe(true);
  expect(createProceduralLocomotion(new Object3D())).toEqual([]);
  mixer.stopAllAction(); mixer.uncacheRoot(model);
});

it("独立保安 GLB 自带闭合动画，帽子绑定头骨并随待机观察转动", async () => {
  const { scene: model, animations } = await loadPlayerRig("naiwa-security");
  const hat = model.getObjectByName("SecurityCap")!;
  const baton = model.getObjectByName("SecurityBaton")!;
  expect(hat.parent?.name).toMatch(/Head$/);
  expect(hat.scale.x).toBeCloseTo(0.88, 2);
  expect(baton.parent?.name).toMatch(/RightHand$/);
  expect(hat.children).toHaveLength(9);
  expect(animations.map((clip) => clip.name)).toEqual(["Idle", "Walk"]);
  for (const clip of animations) for (const track of clip.tracks) {
    expect([...track.values.slice(-4)]).toEqual([...track.values.slice(0, 4)]);
  }
  const mixer = new AnimationMixer(model);
  mixer.clipAction(animations[0]).play();
  mixer.setTime(0); model.updateMatrixWorld(true);
  const rotation = hat.getWorldQuaternion(hat.quaternion.clone());
  mixer.setTime(0.8); model.updateMatrixWorld(true);
  expect(hat.getWorldQuaternion(hat.quaternion.clone()).angleTo(rotation)).toBeGreaterThan(0.35);
  mixer.setTime(0); model.updateMatrixWorld(true);
  const hand = model.getObjectByName("mixamorigRightHand")!, middle = model.getObjectByName("mixamorigRightHandMiddle1")!;
  const pinky = model.getObjectByName("mixamorigRightHandPinky1")!, index = model.getObjectByName("mixamorigRightHandIndex1")!;
  const palmWidth = pinky.getWorldPosition(new Vector3()).sub(index.getWorldPosition(new Vector3())).normalize();
  const batonAxis = new Vector3(0, 1, 0).applyQuaternion(baton.getWorldQuaternion(baton.quaternion.clone()));
  expect(Math.abs(batonAxis.dot(palmWidth))).toBeGreaterThan(0.98);
  expect(batonAxis.y).toBeGreaterThan(0.5); // 棍身沿局部 -Y 延伸，低持时长端朝下。
  expect(baton.getWorldPosition(new Vector3()).distanceTo(middle.getWorldPosition(new Vector3()))).toBeLessThan(0.025);
  const openDirection = middle.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3())).normalize();
  const finger = model.getObjectByName("mixamorigRightHandMiddle3")!.getWorldPosition(new Vector3()).sub(middle.getWorldPosition(new Vector3())).normalize();
  expect(finger.dot(openDirection)).toBeLessThan(0.25);
  mixer.stopAllAction(); mixer.uncacheRoot(model);
});
