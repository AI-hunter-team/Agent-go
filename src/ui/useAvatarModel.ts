import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_AVATARS, MAX_AVATAR_BYTES, type AvatarRole } from "./avatarModel";
import { avatarStorage, type SavedAvatar } from "./avatarStorage";

/** 按角色独立管理外观恢复、导入预检、保存、朝向以及 Blob URL 生命周期。 */
export function useAvatarModel(role: AvatarRole) {
  const defaultAvatar = { ...DEFAULT_AVATARS[role], saved: null as SavedAvatar | null };
  const [avatar, setAvatar] = useState(defaultAvatar);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const locked = useRef(true);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    // 启动时只恢复当前浏览器保存的角色；失败仍可使用默认主角。
    async function restore() {
      try {
        const saved = await avatarStorage(role, "read");
        if (saved) {
          if (!(saved.blob instanceof Blob) || saved.blob.size > MAX_AVATAR_BYTES) throw new Error("已保存的角色文件不可用，请重新导入。");
          const { validateAvatarFile } = await import("./avatarValidation");
          await validateAvatarFile(saved.blob);
          if (!cancelled) setAvatar({ url: URL.createObjectURL(saved.blob), name: saved.name, rotation: saved.rotation || 0, saved });
        }
      } catch { if (!cancelled) setNotice(`未能恢复本机角色，正在使用${DEFAULT_AVATARS[role].name}。你可以重新导入。`); }
      finally { if (!cancelled) { locked.current = false; setBusy(false); } }
    }
    void restore();
    return () => { cancelled = true; active.current = false; };
  }, [role]);
  useEffect(() => () => { if (avatar.url.startsWith("blob:")) URL.revokeObjectURL(avatar.url); }, [avatar.url]);

  /** 预检成功后再替换角色，保存失败时继续本次使用并明确提示。 */
  async function importFile(file: File) {
    if (locked.current) return;
    setError(""); setNotice("");
    if (!/\.glb$/i.test(file.name)) { setError("请选择 .glb 文件，贴图需内嵌在文件中。"); return; }
    if (!file.size || file.size > MAX_AVATAR_BYTES) { setError("请选择非空且不超过 20 MB 的 GLB 文件。"); return; }
    locked.current = true; setBusy(true);
    try {
      const { validateAvatarFile } = await import("./avatarValidation");
      await validateAvatarFile(file);
      const saved = { name: file.name, blob: file, rotation: 0 };
      try { await avatarStorage(role, "write", saved); }
      catch { if (active.current) setNotice("角色已应用，但浏览器未能保存；本次页面内有效。"); }
      if (active.current) setAvatar({ url: URL.createObjectURL(file), name: file.name, rotation: 0, saved });
    } catch (failure) {
      if (active.current) setError(`导入失败：${(failure as Error).message} 当前角色已保留。`);
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }

  /** 立即恢复当前页默认模型，独立尝试清除本机记录，失败仍保留提示。 */
  async function reset() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    if (active.current) setAvatar(defaultAvatar);
    try {
      await avatarStorage(role, "clear");
    } catch { if (active.current) setNotice("本页已恢复默认，但未能清除本机记录；刷新后可能恢复旧模型。"); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }

  /** 旋转模型以适配不同导出朝向，不改变模拟器中的行进方向。 */
  async function rotate(rotation: number) {
    if (locked.current || !avatar.saved) return;
    locked.current = true; setBusy(true); setNotice("");
    const saved = { ...avatar.saved, rotation };
    setAvatar({ ...avatar, rotation, saved });
    try { await avatarStorage(role, "write", saved); }
    catch { if (active.current) setNotice("朝向已应用，但未能保存；刷新后可能恢复旧设置。"); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }

  /** 保留开发调试的站内路径加载和几何占位，不写入用户的外观记录。 */
  function applyPath(path: string) {
    if (locked.current) return;
    if (path && (!path.startsWith("/models/") || path.includes("..") || !/\.(gltf|glb)$/i.test(path))) { setError("请输入 /models/ 下的 .glb 或 .gltf 文件路径。"); return; }
    setError(""); setNotice("");
    setAvatar({ url: path ? `${path}?v=${Date.now()}` : "", name: path.split("/").at(-1) || "几何占位", rotation: 0, saved: null });
  }
  /** 将渲染失败反馈到对应角色的设置区域。 */
  const onError = useCallback((message: string) => setError(message), []);
  return { ...avatar, role, isDefault: avatar.url === defaultAvatar.url, busy, error, notice, importFile, reset, rotate, applyPath, onError };
}
