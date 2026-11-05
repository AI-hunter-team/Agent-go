import type { Dispatch, SetStateAction } from "react";
import { DEFAULT_PERFORMANCE_SETTINGS, ECONOMY_SETTINGS, MOBILE_PERFORMANCE_SETTINGS, type PerformanceSettings } from "./performanceSettings";

/** 提供即时生效的显示选项与节能预设，所有选项只影响观战展示。 */
export function PerformanceSettingsPanel({ settings, onChange, reducedMotion, mobile = false }: {
  settings: PerformanceSettings;
  onChange: Dispatch<SetStateAction<PerformanceSettings>>;
  reducedMotion: boolean;
  mobile?: boolean;
}) {
  return <>
    <div className="row"><button onClick={() => onChange({ ...ECONOMY_SETTINGS })}>使用节能预设</button><button className="ghost" onClick={() => onChange({ ...(mobile ? MOBILE_PERFORMANCE_SETTINGS : DEFAULT_PERFORMANCE_SETTINGS) })}>恢复默认</button></div>
    <label className="field"><span>画面质量</span><select value={settings.quality} onChange={(event) => onChange((value) => ({ ...value, quality: event.target.value as PerformanceSettings["quality"] }))}><option value="standard">标准 · 动态阴影</option><option value="low">低画质 · 关闭阴影、降低分辨率</option></select></label>
    <label className="field"><span>目标帧率</span><select value={settings.targetFps} onChange={(event) => onChange((value) => ({ ...value, targetFps: Number(event.target.value) as PerformanceSettings["targetFps"] }))}><option value="60">60 FPS</option><option value="30">30 FPS · 节能</option><option value="15">15 FPS · 最低开销</option></select></label>
    <label className="check"><input type="checkbox" checked={settings.simpleCrowd} onChange={(event) => onChange((value) => ({ ...value, simpleCrowd: event.target.checked }))} />简化乘客外观</label>
    <label className="check"><input type="checkbox" checked={settings.lowFrequencyHud} onChange={(event) => onChange((value) => ({ ...value, lowFrequencyHud: event.target.checked }))} />降低面板刷新频率</label>
    <label className="check"><input type="checkbox" checked={reducedMotion} onChange={(event) => onChange((value) => ({ ...value, reducedMotion: event.target.checked }))} />减少镜头缓动与角色装饰动效</label>
    <p className="small muted">设置自动保存在此浏览器。简化外观保留全部乘客、角色和保安；低频面板每半秒刷新，决策与暂停仍即时显示。</p>
    <p className="small muted">拖动画面环绕角色，滚轮调整距离。点击“回正”恢复跟随镜头。</p>
  </>;
}
