import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Bone, Box3, Vector3 } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ScenePerformance } from "../src/ui/scene/scenePerformance";
import { AvatarAnimator, type AnimationFrame } from "../src/ui/scene/avatarAnimator";
import { createProceduralLocomotion } from "../src/ui/scene/proceduralLocomotion";
import { createAvatarRootMotionGuard } from "../src/ui/scene/avatarRootMotion";
import { VictoryCamera } from "../src/ui/scene/victoryCamera";
import { cameraFraction } from "../src/ui/scene/cameraCollision";
import { STAIRS_BOTTOM, ESCALATOR_BOTTOM } from "../src/sim/layout";
import { PLAYER_TRAIN_DOORS, TRAIN_CENTRE_X, TRAIN_AISLE_X } from "../src/sim/layout";
import { constrainCabinCamera } from "../src/ui/scene/trainCabin";
import { METRO_PROFILE } from "../src/shared/metro";

let asset: GLTF;
/** 在 Node 内读取真实骨架和动画，仅省略需要浏览器解码的材质贴图。 */
beforeAll(async () => {
  const original = readFileSync(new URL("../public/models/dafeiyu.glb", import.meta.url));
  const length = original.readUInt32LE(12), json = JSON.parse(original.subarray(20, 20 + length).toString());
  delete json.images; delete json.textures; delete json.materials;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const text = JSON.stringify(json), content = Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text) / 4) * 4, " "));
  const bin = original.subarray(20 + length), header = Buffer.from(original.subarray(0, 20));
  header.writeUInt32LE(20 + content.length + bin.length, 8); header.writeUInt32LE(content.length, 12);
  const buffer = Buffer.concat([header, content, bin]);
  asset = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "");
});

/** 为每个验证创建独立骨架，防止动画属性互相污染。 */
function player() {
  const model = clone(asset.scene);
  const animator = new AvatarAnimator(model, [...asset.animations, ...createProceduralLocomotion(model)]);
  const guard = createAvatarRootMotionGuard(model);
  const bones: Bone[] = []; model.traverse((node) => { if (node instanceof Bone) bones.push(node); });
  return { model, animator, guard, bones };
}

/** 统一普通展示参数，使各验证只设置实际变化的状态。 */
function frame(overrides: Partial<AnimationFrame> = {}): AnimationFrame {
  return { motion: "idle", delta: 1 / 30, speed: 1, frozen: false, reducedMotion: false, dance: "", victoryTime: 0, greetingTime: null,
    danceTime: overrides.victoryTime ?? 0, previousDance: "", previousDanceTime: 0, ...overrides };
}

describe("胜利和问候的独立展示", () => {
  it("各车门登车后桌面和窄屏的庆祝镜头始终留在车厢过道内", () => {
    for (const door of PLAYER_TRAIN_DOORS) for (const aspect of [16 / 9, 390 / 844, 320 / 568]) {
      const pose = { x: TRAIN_AISLE_X, y: -2, z: door.pos.y + 1.25, yaw: 0 };
      const camera = new VictoryCamera();
      camera.capture(new Vector3(86, 3, pose.z), new Vector3(1, 0, 0));
      for (const seconds of [0, .1, 1.5, 4, 12, 30, 60]) {
        camera.update(pose, seconds, aspect, false, 0, true);
        expect(Math.abs(camera.position.x - TRAIN_CENTRE_X)).toBeLessThanOrEqual(.65 + 1e-8);
        expect(camera.position.y).toBeGreaterThanOrEqual(-1.55);
        expect(camera.position.y).toBeLessThanOrEqual(-2+METRO_PROFILE.ceiling-METRO_PROFILE.floor-.2);
        expect(camera.position.z).toBeGreaterThanOrEqual(6.8);
        expect(camera.position.z).toBeLessThanOrEqual(25.7);
        expect(Math.abs(camera.position.z - pose.z)).toBeGreaterThanOrEqual(2.4 - 1e-8);
      }
      const manual = new Vector3(130, 20, pose.z);
      constrainCabinCamera(manual, pose);
      expect(Math.abs(manual.x - TRAIN_CENTRE_X)).toBeLessThanOrEqual(.65 + 1e-8);
      expect(manual.y).toBeLessThanOrEqual(-2+METRO_PROFILE.ceiling-METRO_PROFILE.floor-.2);
      camera.update(pose, 4, aspect, true, 0, true); const fixed = camera.position.clone();
      camera.update(pose, 40, aspect, true, 0, true); expect(camera.position.equals(fixed)).toBe(true);
    }
  });
  it("每段完整播完重新随机，重挂载不打断当前段，新局清理", () => {
    let calls = 0;
    const state = new ScenePerformance(() => {}, () => { calls++; return 0.55; });
    const dances = ["dance_02", "dance_03", "dance_05"].map((name) => ({ name, duration: 1 }));
    state.setClips(dances, 2.83);
    state.sync(1, false); expect(state.dance).toBe("");
    expect(state.greet(false)).toBe(true); expect(state.greet(false)).toBe(false);
    state.advance(0.1); state.advance(0.1); state.setClips(dances, 2.83);
    expect(state.greetingTime).toBeCloseTo(0.1);
    state.sync(1, true); expect(state.greetingTime).toBeNull(); expect(state.dance).toBe("dance_03");
    state.setClips(dances, 2.83);
    state.sync(1, true); expect(calls).toBe(1); expect(state.dance).toBe("dance_03");
    for (let i = 0; i < 9; i++) state.advance(0.1);
    expect(state.dance).toBe("dance_03"); expect(calls).toBe(1);
    state.advance(0.1); expect(calls).toBe(2); expect(state.dance).toBe("dance_05"); expect(state.previousDance).toBe("dance_03");
    expect(state.previousDanceTime).toBe(1); expect(state.danceTime).toBe(0);
    state.setClips(dances, 2.83); expect(calls).toBe(2);
    for (let i = 0; i < 10; i++) state.advance(0.1);
    expect(calls).toBe(3); expect(state.dance).toBe("dance_03");
    for (let i = 0; i < 20; i++) state.advance(0.1, true);
    expect(calls).toBe(3); expect(state.danceTime).toBeCloseTo(0);
    state.dismissCamera(); expect(state.cinematic).toBe(false); expect(state.needsFrames(false)).toBe(true);
    state.sync(2, false); expect(state.dance).toBe(""); expect(state.cinematicDismissed).toBe(false); expect(state.greetingTime).toBeNull();
  });

  it("隐藏时不推进，恢复跳过休眠间隔，减少动态效果不循环问候", () => {
    const state = new ScenePerformance(); state.sync(1, false); state.setClips([], 0.5);
    state.greet(false); state.advance(0.1); state.advance(0.1);
    state.setVisible(false); state.advance(20); expect(state.time).toBeCloseTo(0.1);
    state.setVisible(true); state.advance(20); expect(state.time).toBeCloseTo(0.1);
    for (let i = 0; i < 8; i++) state.advance(0.1);
    expect(state.greetingTime).toBeNull(); expect(state.needsFrames(false)).toBe(false);
    state.greet(true); expect(state.greetingTime).toBeNull();
  });

  it("真实资产三舞蹈均运动、水平位置固定，循环接缝没有姿态硬跳", () => {
    const { model, animator, guard, bones } = player();
    expect(animator.performances.dances).toEqual(["dance_02.001", "dance_03.001", "dance_05.001"]);
    expect(animator.performances.greeting?.name).toBe("greet_04.001");
    const hips = bones.find((b) => /Hips$/.test(b.name))!;
    model.updateMatrixWorld(true); const anchor = hips.getWorldPosition(new Vector3());
    for (const dance of animator.performances.dances) {
      animator.update(frame({ dance, victoryTime: 1, frozen: true })); guard(); model.updateMatrixWorld(true);
      const before = bones.map((b) => b.quaternion.clone());
      animator.update(frame({ dance, victoryTime: 1.5, frozen: true })); guard(); model.updateMatrixWorld(true);
      expect(bones.some((b, i) => b.quaternion.angleTo(before[i]) > 0.05)).toBe(true);
      const position = hips.getWorldPosition(new Vector3());
      expect(position.x).toBeCloseTo(anchor.x, 5); expect(position.z).toBeCloseTo(anchor.z, 5);
      const duration = asset.animations.find((clip) => clip.name === dance)!.duration;
      const next = animator.performances.dances[(animator.performances.dances.indexOf(dance) + 1) % 3];
      animator.update(frame({ dance, victoryTime: duration - 0.0001 })); const tail = bones.map((b) => b.quaternion.clone());
      animator.update(frame({ dance: next, victoryTime: duration + 0.0001, danceTime: 0.0001, previousDance: dance, previousDanceTime: duration }));
      expect(Math.max(...bones.map((b, i) => b.quaternion.angleTo(tail[i])))).toBeLessThan(0.02);
    }
    expect(new Box3().setFromObject(model).getSize(new Vector3()).y).toBeGreaterThan(0);
    animator.dispose();
  });

  it("行走问候保持腿部步态，结束后全身回到基础动作，重挂载后仍能播放", () => {
    const ordinary = player(), greeting = player();
    for (let i = 0; i < 30; i++) {
      ordinary.animator.update(frame({ motion: "walk" }));
      greeting.animator.update(frame({ motion: "walk", greetingTime: i / 30 }));
    }
    for (const suffix of ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]) {
      const a = ordinary.bones.find((b) => b.name.endsWith(suffix))!, b = greeting.bones.find((b) => b.name.endsWith(suffix))!;
      expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(0.001);
    }
    const arm = greeting.bones.find((b) => /RightArm$/.test(b.name))!;
    expect(arm.quaternion.angleTo(ordinary.bones.find((b) => /RightArm$/.test(b.name))!.quaternion)).toBeGreaterThan(0.05);
    ordinary.animator.update(frame({ motion: "walk" })); greeting.animator.update(frame({ motion: "walk" }));
    expect(arm.quaternion.angleTo(ordinary.bones.find((b) => /RightArm$/.test(b.name))!.quaternion)).toBeLessThan(0.001);
    greeting.animator.dispose(); greeting.animator.update(frame({ dance: "dance_03.001", victoryTime: 1 }));
    expect(arm.quaternion.angleTo(ordinary.bones.find((b) => /RightArm$/.test(b.name))!.quaternion)).toBeGreaterThan(0.05);
    ordinary.animator.dispose(); greeting.animator.dispose();
  });

  it("电影镜头改变景别、高度及焦距，保持双终点安全并从手动视角连续恢复", () => {
    for (const end of [STAIRS_BOTTOM, ESCALATOR_BOTTOM]) {
      const camera = new VictoryCamera(), pose = { x: end.x, y: -2, z: end.y, yaw: Math.PI / 2 };
      const heights: number[] = [], distances: number[] = [], lenses: number[] = [];
      for (const time of [1.5, 7.5, 13.5, 19.5, 25.5, 31.5, 37.5]) {
        camera.update(pose, time, 1.5, false);
        expect(camera.position.x).toBeGreaterThan(pose.x);
        expect(cameraFraction(camera.target, camera.position)).toBeCloseTo(1);
        expect(camera.position.distanceTo(camera.target)).toBeGreaterThan(3);
        heights.push(camera.position.y); distances.push(camera.position.distanceTo(camera.target)); lenses.push(camera.fov);
      }
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(2);
      expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThan(1.5);
      expect(Math.max(...lenses) - Math.min(...lenses)).toBeGreaterThan(6);
      const manual = new Vector3(end.x + 4, 0.4, end.y + 1), target = new Vector3(end.x, -1, end.y);
      camera.capture(manual, target.clone().sub(manual).normalize(), 50, 51, manual.distanceTo(target));
      camera.update(pose, 50, 1.5, false);
      expect(camera.position.distanceTo(manual)).toBeLessThan(1e-8); expect(camera.fov).toBe(51);
      camera.update(pose, 50.01, 1.5, false);
      expect(camera.position.distanceTo(manual)).toBeLessThan(0.01);
      camera.update(pose, 1, 1.5, true); const fixed = camera.position.clone();
      camera.update(pose, 20, 1.5, true); expect(camera.position.equals(fixed)).toBe(true);
    }
  });

  it("拖动按住不抢回，松开四秒恢复，滚轮续期且隐藏时暂停倒计时", () => {
    const state = new ScenePerformance(); state.sync(1, true); state.advance(0);
    state.interactCamera(true);
    for (let i = 0; i < 60; i++) state.advance(0.1);
    expect(state.cinematic).toBe(false); expect(state.cameraResumeIn).toBeNull();
    state.releaseCamera();
    for (let i = 0; i < 30; i++) state.advance(0.1);
    expect(state.cinematic).toBe(false);
    state.interactCamera();
    state.setVisible(false); state.advance(30); expect(state.cameraResumeIn).toBeCloseTo(4);
    state.setVisible(true); state.advance(30);
    for (let i = 0; i < 39; i++) state.advance(0.1);
    expect(state.cinematic).toBe(false); expect(state.needsFrames(true)).toBe(true);
    state.advance(0.1); expect(state.cinematic).toBe(true);
    state.interactCamera(); state.dismissCamera();
    for (let i = 0; i < 50; i++) state.advance(0.1);
    expect(state.cinematic).toBe(false); expect(state.cameraResumeIn).toBeNull();
    const time = state.victoryTime;
    state.restoreCamera();
    expect(state.cinematic).toBe(true); expect(state.victoryTime).toBe(time);
    state.sync(2, false); expect(state.cameraResumeIn).toBeNull();
  });
});
