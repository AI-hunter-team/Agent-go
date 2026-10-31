import { useRef } from "react";
import type { useAvatarModel } from "./useAvatarModel";
import styles from "./AvatarSettings.module.css";

/** 将文件选择、当前角色、恢复默认与必要的导出朝向设置放在同一处。 */
export function AvatarSettings({ avatar }: { avatar: ReturnType<typeof useAvatarModel> }) {
  const input = useRef<HTMLInputElement>(null);
  const label = avatar.role === "guard" ? "保安模型" : "主角模型";
  return <section className={styles.settings} aria-label={label} aria-busy={avatar.busy}>
    <h3>{label}</h3>
    <p className={styles.name}>{avatar.name}</p>
    <input ref={input} type="file" accept=".glb,model/gltf-binary" hidden aria-label={`选择${label} GLB 文件`} onChange={(event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void avatar.importFile(file);
    }} />
    <div className="row">
      <button disabled={avatar.busy} onClick={() => input.current?.click()}>{avatar.busy ? "正在加载模型…" : "导入模型"}</button>
      <button className="ghost" disabled={avatar.busy || avatar.isDefault} onClick={() => void avatar.reset()}>恢复默认</button>
    </div>
    {avatar.saved && <label className="field"><span>模型朝向</span><select value={avatar.rotation} onChange={(event) => void avatar.rotate(Number(event.target.value))} disabled={avatar.busy}>
      <option value={0}>原始朝向</option><option value={90}>旋转 90°</option><option value={180}>旋转 180°</option><option value={270}>旋转 270°</option>
    </select></label>}
    {avatar.notice && <p className="small muted" role="status">{avatar.notice}</p>}
    {avatar.error && <p className="error" role="alert">{avatar.error}</p>}
  </section>;
}
