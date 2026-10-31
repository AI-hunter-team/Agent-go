import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AnimationClip, Bone, Group, Vector3 } from "three";
import { findAvatarClip, validateAvatarBuffer } from "../src/ui/avatarModel";
import { createAvatarRootMotionGuard } from "../src/ui/scene/avatarRootMotion";

/** 构造最小 GLB 容器，覆盖损坏格式与外部资源边界。 */
function glb(json: object): ArrayBuffer {
  const text = JSON.stringify(json);
  const bytes = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4, " "));
  const buffer = new ArrayBuffer(20 + bytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, bytes.length, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).set(bytes);
  return buffer;
}

describe("主角导入边界", () => {
  it("接受默认模型、原始资产与内嵌资源", () => {
    for (const name of ["dafeiyu", "naiwa", "naiwa-security"]) {
      const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
      expect(() => validateAvatarBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))).not.toThrow();
    }
    expect(() => validateAvatarBuffer(glb({ asset: { version: "2.0" }, images: [{ uri: "data:image/png;base64,AA==" }] }))).not.toThrow();
  });
  it("拒绝改扩展名、截断文件和外部依赖", () => {
    expect(() => validateAvatarBuffer(new ArrayBuffer(4))).toThrow("不完整");
    const buffer = glb({ asset: { version: "2.0" } });
    new DataView(buffer).setUint32(8, 1, true);
    expect(() => validateAvatarBuffer(buffer)).toThrow("不是有效");
    expect(() => validateAvatarBuffer(glb({ asset: { version: "2.0" }, images: [{ uri: "https://example.com/texture.png" }] }))).toThrow("嵌入");
  });
  it("识别实际资产的动画名并优先采用标准命名", () => {
    const clips = [new AnimationClip("行走，双臂自然摆动.001", 1, []), new AnimationClip("walk.001", 1, []), new AnimationClip("Walk", 1, [])];
    expect(findAvatarClip(clips, "walk")).toBe("Walk");
    expect(findAvatarClip(clips.slice(0, 1), "walk")).toBe(clips[0].name);
    expect(findAvatarClip(clips, "idle")).toBe("");
  });
  // 导出器旋转 Armature 后，局部 Z 可是竖直轴；地面平移仍必须被约束。
  it("在旋转缩放骨架中剔除模型水平根位移，并保留竖直动作", () => {
    const world = new Group(), model = new Group(), armature = new Group(), hips = new Bone();
    world.position.set(20, 3, -7); world.rotation.y = 0.6; world.scale.setScalar(1.7);
    world.add(model); model.add(armature); armature.add(hips);
    armature.rotation.x = -Math.PI / 2; armature.scale.set(2, 3, 4);
    hips.position.set(1, 2, 3);
    const constrain = createAvatarRootMotionGuard(model);
    world.updateMatrixWorld(true);
    const bind = hips.position.clone().applyMatrix4(armature.matrix);
    hips.position.add(new Vector3(5, 6, 7));
    const animated = hips.position.clone().applyMatrix4(armature.matrix);
    constrain();
    const result = hips.position.clone().applyMatrix4(armature.matrix);
    expect(result.x).toBeCloseTo(bind.x, 8);
    expect(result.z).toBeCloseTo(bind.z, 8);
    expect(result.y).toBeCloseTo(animated.y, 8);
    const once = hips.position.clone();
    constrain();
    expect(hips.position.distanceTo(once)).toBeLessThan(1e-8);
  });
});
