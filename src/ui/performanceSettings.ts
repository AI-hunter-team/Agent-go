import { useEffect, useState } from "react";

export interface PerformanceSettings {
  quality: "standard" | "low";
  targetFps: 60 | 30 | 15;
  simpleCrowd: boolean;
  lowFrequencyHud: boolean;
  reducedMotion: boolean | null;
}

export const PERFORMANCE_STORAGE_KEY = "agent-go.display.v1";
export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  quality: "standard", targetFps: 60, simpleCrowd: false, lowFrequencyHud: false, reducedMotion: null,
};
export const ECONOMY_SETTINGS: PerformanceSettings = {
  quality: "low", targetFps: 30, simpleCrowd: true, lowFrequencyHud: true, reducedMotion: true,
};
export const MOBILE_PERFORMANCE_SETTINGS: PerformanceSettings = { ...ECONOMY_SETTINGS, reducedMotion: null };

/** Device defaults also apply in landscape; resizing a desktop window is not a mobile device. */
export function isMobileRenderer(userAgent: string, coarsePointer: boolean): boolean {
  return coarsePointer || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

/** 逐项校验本地偏好；缺失、损坏或旧字段均回到相应默认值。 */
export function parsePerformanceSettings(raw: string | null, defaults = DEFAULT_PERFORMANCE_SETTINGS): PerformanceSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaults };
    // Older clients saved the desktop defaults on every phone before any user choice.
    if (defaults === MOBILE_PERFORMANCE_SETTINGS && Object.entries(DEFAULT_PERFORMANCE_SETTINGS).every(([key, setting]) => value[key] === setting)) return { ...defaults };
    return {
      quality: value.quality === "low" || value.quality === "standard" ? value.quality : defaults.quality,
      targetFps: value.targetFps === 15 || value.targetFps === 30 || value.targetFps === 60 ? value.targetFps : defaults.targetFps,
      simpleCrowd: typeof value.simpleCrowd === "boolean" ? value.simpleCrowd : defaults.simpleCrowd,
      lowFrequencyHud: typeof value.lowFrequencyHud === "boolean" ? value.lowFrequencyHud : defaults.lowFrequencyHud,
      reducedMotion: typeof value.reducedMotion === "boolean" ? value.reducedMotion : defaults.reducedMotion,
    };
  } catch { return { ...defaults }; }
}

/** 保存显示偏好，并在用户未指定动效时跟随系统设置；存储禁用不影响使用。 */
export function usePerformanceSettings() {
  const [mobile] = useState(() => isMobileRenderer(navigator.userAgent, window.matchMedia("(pointer: coarse)").matches));
  const [settings, setSettings] = useState<PerformanceSettings>(() => {
    const defaults = mobile ? MOBILE_PERFORMANCE_SETTINGS : DEFAULT_PERFORMANCE_SETTINGS;
    try { return parsePerformanceSettings(window.localStorage.getItem(PERFORMANCE_STORAGE_KEY), defaults); }
    catch { return { ...defaults }; }
  });
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    try { window.localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(settings)); }
    catch { /* 隐私模式或存储已满时仍可在当前页面使用设置。 */ }
  }, [settings]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    /** 同步系统动效偏好，保留用户的显式选择。 */
    const change = () => setSystemReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return { settings, setSettings, mobile, reducedMotion: settings.reducedMotion ?? systemReducedMotion };
}
