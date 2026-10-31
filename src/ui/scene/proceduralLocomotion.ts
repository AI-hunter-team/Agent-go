import { AnimationClip, Bone, Quaternion, QuaternionKeyframeTrack, Vector3, type Object3D } from "three";

const CYCLE_SECONDS = 1;
interface JointMotion { bone: Bone; base: Quaternion; axis: Vector3; angle: (phase: number) => number; idleAngle: number }

/** 为已绑定的 Mixamo 人形骨架生成原地行走和放松站立，不改模型文件及世界位置。 */
export function createProceduralLocomotion(model: Object3D): AnimationClip[] {
  model.updateMatrixWorld(true);
  const bones: Bone[] = [];
  model.traverse((object) => { if (object instanceof Bone) bones.push(object); });

  /** 兼容 GLTFLoader 对冒号、命名空间和大小写的处理。 */
  function findBone(suffix: string): Bone | undefined {
    return bones.find((bone) => bone.name.toLowerCase().replace(/[^a-z0-9]/g, "").endsWith(suffix.toLowerCase()));
  }

  const leftThigh = findBone("LeftUpLeg"), rightThigh = findBone("RightUpLeg");
  const leftKnee = findBone("LeftLeg"), rightKnee = findBone("RightLeg");
  const leftArm = findBone("LeftArm"), rightArm = findBone("RightArm");
  if (!leftThigh || !rightThigh || !leftKnee || !rightKnee || !leftArm || !rightArm) return [];

  // 用实际骨架推导横向轴，兼容 FBX/GLB 导出时额外的坐标旋转。
  const up = new Vector3(0, 1, 0).applyQuaternion(model.getWorldQuaternion(new Quaternion()));
  const right = rightThigh.getWorldPosition(new Vector3()).sub(leftThigh.getWorldPosition(new Vector3()));
  right.addScaledVector(up, -right.dot(up));
  if (right.lengthSq() < 0.000001) return [];
  right.normalize();
  const motions: JointMotion[] = [];

  /** 把世界中的摆动轴转成骨骼父节点的局部轴，保留原始绑定旋转。 */
  function add(bone: Bone | undefined, axis: Vector3, angle: (phase: number) => number, idleAngle = 0, base = bone?.quaternion) {
    if (!bone || !base) return;
    const parentRotation = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    motions.push({ bone, base: base.clone(), axis: axis.clone().applyQuaternion(parentRotation.invert()).normalize(), angle, idleAngle });
  }

  /** 将 A/T 字形手臂放低并向裙子外侧留出空间，避免待机时平举双臂。 */
  function relaxedArm(bone: Bone, elbow: Bone | undefined, side: number): Quaternion {
    if (!elbow || !bone.parent) return bone.quaternion.clone();
    const inverseParent = bone.parent.getWorldQuaternion(new Quaternion()).invert();
    const direction = elbow.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize().applyQuaternion(inverseParent);
    const target = up.clone().negate().addScaledVector(right, side * 0.8).normalize().applyQuaternion(inverseParent);
    return new Quaternion().setFromUnitVectors(direction, target).multiply(bone.quaternion);
  }

  add(leftThigh, right, (phase) => -Math.sin(phase) * 0.48);
  add(rightThigh, right, (phase) => Math.sin(phase) * 0.48);
  add(leftKnee, right, (phase) => 0.06 + Math.max(0, Math.sin(phase)) ** 2 * 0.62, 0.06);
  add(rightKnee, right, (phase) => 0.06 + Math.max(0, -Math.sin(phase)) ** 2 * 0.62, 0.06);
  add(findBone("LeftFoot"), right, (phase) => Math.sin(phase) * 0.2 - Math.max(0, Math.sin(phase)) ** 2 * 0.3);
  add(findBone("RightFoot"), right, (phase) => -Math.sin(phase) * 0.2 - Math.max(0, -Math.sin(phase)) ** 2 * 0.3);
  add(leftArm, right, (phase) => Math.sin(phase) * 0.28, 0, relaxedArm(leftArm, findBone("LeftForeArm"), -1));
  add(rightArm, right, (phase) => -Math.sin(phase) * 0.28, 0, relaxedArm(rightArm, findBone("RightForeArm"), 1));
  add(findBone("LeftForeArm"), right, (phase) => -0.15 - Math.max(0, -Math.sin(phase)) * 0.12, -0.15);
  add(findBone("RightForeArm"), right, (phase) => -0.15 - Math.max(0, Math.sin(phase)) * 0.12, -0.15);
  add(findBone("Hips"), up, (phase) => Math.sin(phase) * 0.035);
  add(findBone("Spine2"), up, (phase) => -Math.sin(phase) * 0.045);

  /** 将一整个步态周期采样为可被现有 AnimationMixer 播放的四元数轨道。 */
  function makeClip(name: string, walking: boolean): AnimationClip {
    const count = walking ? 40 : 1;
    const times = Array.from({ length: count + 1 }, (_, index) => index / count * CYCLE_SECONDS);
    const tracks = motions.map((motion) => {
      const values: number[] = [];
      const rotation = new Quaternion();
      for (let index = 0; index <= count; index++) {
        const angle = walking ? motion.angle(index / count * Math.PI * 2) : motion.idleAngle;
        rotation.setFromAxisAngle(motion.axis, angle).multiply(motion.base).normalize().toArray(values, index * 4);
      }
      // 显式闭合首尾，循环边界不产生姿态跳变。
      values.splice(count * 4, 4, ...values.slice(0, 4));
      return new QuaternionKeyframeTrack(`${motion.bone.uuid}.quaternion`, times, values);
    });
    return new AnimationClip(name, CYCLE_SECONDS, tracks);
  }

  return [makeClip("Idle", false), makeClip("Walk", true)];
}
