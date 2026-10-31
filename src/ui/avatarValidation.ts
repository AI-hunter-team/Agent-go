import { Box3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeAvatar, validateAvatarBuffer } from "./avatarModel";

/** 在替换当前角色前完成真实 GLB 加载及可见几何检查，并释放临时资源。 */
export async function validateAvatarFile(blob: Blob): Promise<void> {
  const buffer = await blob.arrayBuffer();
  validateAvatarBuffer(buffer);
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  try {
    gltf.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(gltf.scene);
    let hasMesh = false;
    gltf.scene.traverse((object) => { if ("isMesh" in object) hasMesh = true; });
    if (!hasMesh || bounds.isEmpty() || !Number.isFinite(bounds.max.y - bounds.min.y) || bounds.max.y - bounds.min.y < 0.00001) {
      throw new Error("模型没有可显示的立体网格，请检查导出内容。");
    }
  } finally { disposeAvatar(gltf.scene); }
}
