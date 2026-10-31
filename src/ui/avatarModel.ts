import type { AnimationClip, Object3D, Material, Texture } from "three";

export const DEFAULT_AVATAR_URL = "/models/dafeiyu.glb";
export type AvatarRole = "player" | "guard";
export const DEFAULT_AVATARS = {
  player: { url: DEFAULT_AVATAR_URL, name: "大肥鱼", rotation: 0 },
  guard: { url: "/models/naiwa-security.glb", name: "奶娃保安", rotation: 0 },
};
export const MAX_AVATAR_BYTES = 20 * 1024 * 1024;

/** 校验单文件 GLB 2.0，拒绝损坏文件与依赖外部贴图/缓冲区的文件。 */
export function validateAvatarBuffer(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 20) throw new Error("文件不完整，请重新导出 GLB 2.0。");
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a ||
      jsonLength > buffer.byteLength - 20) throw new Error("不是有效的 GLB 2.0 文件，请重新导出。");
  let json: { asset?: { version?: string } };
  try {
    json = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength)), (key, value: unknown) => {
      if (key === "uri" && typeof value === "string" && !value.startsWith("data:")) {
        throw new Error("请将贴图与缓冲区嵌入 GLB，再重新导入。");
      }
      return value;
    });
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("GLB 内容损坏，请重新导出。");
    throw error;
  }
  if (json?.asset?.version !== "2.0") throw new Error("仅支持 GLB 2.0 文件。");
}

/** 优先匹配标准动作名，再兼容导出器前缀、数字后缀和中英文描述。 */
export function findAvatarClip(clips: AnimationClip[], motion: "idle" | "walk" | "interact" | "jump"): string {
  const patterns = {
    idle: /idle|stand|rest|待机|站立|静止/i,
    walk: /walk|run|行走|走动|走路|步行|跑步/i,
    interact: /interact|action|交互|操作|办理/i,
    jump: /jump|跳跃|翻越/i,
  };
  return (clips.find((clip) => clip.name.toLowerCase() === motion) ?? clips.find((clip) => patterns[motion].test(clip.name)))?.name ?? "";
}

/** 释放自定义模型和预检模型的 GPU 资源，同一共享资源只释放一次。 */
export function disposeAvatar(scene: Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  scene.traverse((object) => {
    const mesh = object as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    if (mesh.geometry) resources.add(mesh.geometry);
    for (const material of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : []) {
      resources.add(material);
      for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) resources.add(value as Texture);
    }
  });
  resources.forEach((resource) => resource.dispose());
}
