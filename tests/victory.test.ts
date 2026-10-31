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

  it("楼梯和扶梯终点的镜头均保持在正面安全弧线，减少动态效果时固定", () => {
    for (const end of [STAIRS_BOTTOM, ESCALATOR_BOTTOM]) {
      const camera = new VictoryCamera(), pose = { x: end.x, y: -2, z: end.y, yaw: Math.PI / 2 };
      for (const time of [6, 10, 14, 18, 22]) {
        camera.update(pose, time, 1.5, false);
        expect(camera.position.x).toBeGreaterThan(pose.x);
        expect(cameraFraction(camera.target, camera.position)).toBeCloseTo(1);
        expect(camera.position.distanceTo(camera.target)).toBeGreaterThan(3);
      }
      camera.update(pose, 1, 1.5, true); const fixed = camera.position.clone();
      camera.update(pose, 20, 1.5, true); expect(camera.position.equals(fixed)).toBe(true);
    }
  });
});
