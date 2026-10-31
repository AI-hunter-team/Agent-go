import { Matrix3, Matrix4, Vector3, type Object3D } from "three";

/** 捕获根骨骼绑定位置，复用矩阵缓冲在模型坐标系剔除水平根运动。 */
export function createAvatarRootMotionGuard(model: Object3D): () => void {
  const anchors: { bone: Object3D; bind: Vector3 }[] = [];
  model.traverse((bone) => {
    if ("isBone" in bone && !(bone.parent && "isBone" in bone.parent)) anchors.push({ bone, bind: bone.position.clone() });
  });
  const modelInverse = new Matrix4(), parentToModel = new Matrix4();
  const axes = new Matrix3(), inverseAxes = new Matrix3(), displacement = new Vector3();
  /** 每帧保留模型 Y 方向的动画位移，再转换回骨骼父节点局部坐标。 */
  return function constrainRootMotion() {
    model.updateWorldMatrix(true, false);
    modelInverse.copy(model.matrixWorld).invert();
    for (const { bone, bind } of anchors) {
      if (!bone.parent) continue;
      bone.parent.updateWorldMatrix(true, false);
      parentToModel.multiplyMatrices(modelInverse, bone.parent.matrixWorld);
      axes.setFromMatrix4(parentToModel);
      displacement.subVectors(bone.position, bind).applyMatrix3(axes);
      displacement.x = 0; displacement.z = 0;
      inverseAxes.copy(axes).invert();
      bone.position.copy(bind).add(displacement.applyMatrix3(inverseAxes));
    }
  };
}
