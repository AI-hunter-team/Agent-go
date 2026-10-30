import { DEFAULT_GAME_SETTINGS, gameSettingsError, type GameSettings } from "../shared/gameSettings";

const presets = [
  { label: "原版对照", settings: DEFAULT_GAME_SETTINGS },
  { label: "紧凑", settings: { timeLimitSeconds: 120, extraQueuePeople: 0 } },
  { label: "拥挤", settings: { timeLimitSeconds: 120, extraQueuePeople: 2 } },
  { label: "高压", settings: { timeLimitSeconds: 100, extraQueuePeople: 2 } },
];

export function DifficultyControls({ settings, onChange, disabled }: {
  settings: GameSettings; onChange: (value: GameSettings) => void; disabled: boolean;
}) {
  const error = gameSettingsError(settings);
  const number = (value: string) => value.trim() ? Number(value) : NaN;
  return <fieldset className="difficulty-settings" disabled={disabled}>
    <legend>本局难度</legend>
    <div className="segmented" aria-label="难度预设">
      {presets.map((preset) => {
        const selected = settings.timeLimitSeconds === preset.settings.timeLimitSeconds && settings.extraQueuePeople === preset.settings.extraQueuePeople;
        return <button key={preset.label} type="button" aria-pressed={selected} className={selected ? "on" : ""} onClick={() => onChange({ ...preset.settings })}>{preset.label}</button>;
      })}
    </div>
    <div className="difficulty-fields">
      <label className="field"><span>本局时限（秒）</span><input aria-label="本局时限（秒）" type="number" min={60} max={300} step={1} value={Number.isFinite(settings.timeLimitSeconds) ? settings.timeLimitSeconds : ""} onChange={(e) => onChange({ ...settings, timeLimitSeconds: number(e.target.value) })} /><small className="muted">60–300 秒，只计游戏时间</small></label>
      <label className="field"><span>每条队列额外人数</span><input aria-label="每条队列额外人数" type="number" min={0} max={8} step={1} value={Number.isFinite(settings.extraQueuePeople) ? settings.extraQueuePeople : ""} onChange={(e) => onChange({ ...settings, extraQueuePeople: number(e.target.value) })} /><small className="muted">0–8 人，初始开放队列各增加</small></label>
    </div>
    <p className="small muted">可独立调整两项。原版为 180 秒、额外 0 人；途中客流保持原样。</p>
    {error && <p role="alert" className="error">{error}</p>}
  </fieldset>;
}
