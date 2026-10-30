export interface GameSettings { timeLimitSeconds: number; extraQueuePeople: number }
export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = Object.freeze({ timeLimitSeconds: 120, extraQueuePeople: 3 });
/** Reports exported before settings were recorded used the original scenario. */
export const LEGACY_GAME_SETTINGS: Readonly<GameSettings> = Object.freeze({ timeLimitSeconds: 180, extraQueuePeople: 0 });
export function gameSettingsError(value: unknown): string | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "难度设置必须是对象";
  const settings = value as Record<string, unknown>;
  if (Object.keys(settings).some((key) => !["timeLimitSeconds", "extraQueuePeople"].includes(key))) return "难度设置包含未知字段";
  if (typeof settings.timeLimitSeconds !== "number" || !Number.isInteger(settings.timeLimitSeconds) || settings.timeLimitSeconds < 60 || settings.timeLimitSeconds > 300) return "本局时限须为 60–300 秒的整数";
  if (typeof settings.extraQueuePeople !== "number" || !Number.isInteger(settings.extraQueuePeople) || settings.extraQueuePeople < 0 || settings.extraQueuePeople > 8) return "每条队列额外人数须为 0–8 的整数";
  return null;
}
export function resolveGameSettings(value: Partial<GameSettings> = {}): Readonly<GameSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RangeError("难度设置必须是对象");
  const settings = { ...DEFAULT_GAME_SETTINGS, ...value };
  const error = gameSettingsError(settings);
  if (error) throw new RangeError(error);
  return Object.freeze(settings);
}
