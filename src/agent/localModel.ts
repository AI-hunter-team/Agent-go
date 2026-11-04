import { isReasoningEffort, type ReasoningEffort } from "../shared/modelConfig";
export interface ModelConnection { baseUrl: string; apiKey: string; model: string; reasoningEffort: ReasoningEffort; token?: string }
export interface SavedModel extends ModelConnection { rememberKey: boolean }
export interface StorageResult { saved: boolean; warning?: string }
const storageKey = "agent-go.model-connection.v2";
const legacyKey = "agent-go.model-connection.v1";
let current: SavedModel | null | undefined;

function valid(value: unknown): value is ModelConnection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.baseUrl === "string" && typeof v.apiKey === "string" && typeof v.model === "string"
    && isReasoningEffort(v.reasoningEffort) && (v.token === undefined || typeof v.token === "string");
}

/** Read without network calls. Legacy consent is preserved until the next explicit save. */
export function loadLocalModel(): SavedModel | null {
  try {
    const raw = localStorage.getItem(storageKey);
    const v: unknown = JSON.parse(raw ?? localStorage.getItem(legacyKey) ?? "null");
    if (!valid(v)) return null;
    if (raw !== null && (!("version" in v) || v.version !== 2 || !("rememberKey" in v) || v.rememberKey !== true)) return null;
    return { baseUrl: v.baseUrl, apiKey: v.apiKey, model: v.model, reasoningEffort: v.reasoningEffort, token: v.token, rememberKey: true };
  } catch { return null; }
}

/** Includes a temporary connection in this page, which never needs browser storage. */
export function getLocalModel(): SavedModel | null { return current === undefined ? loadLocalModel() : current; }

function removePersistent(): StorageResult {
  let failed = false;
  for (const key of [storageKey, legacyKey]) {
    try { localStorage.removeItem(key); } catch { failed = true; }
  }
  return failed ? { saved: false, warning: "浏览器无法清除已保存的凭据；当前连接仍可使用，请在浏览器设置中清除本站数据。" } : { saved: false };
}

/** Credentials and capability tokens always share the same explicit persistence choice. */
export function saveLocalModel(value: ModelConnection, rememberKey = false): StorageResult {
  const { baseUrl, apiKey, model, reasoningEffort, token } = value;
  current = { baseUrl, apiKey, model, reasoningEffort, token, rememberKey };
  if (!rememberKey) return removePersistent();
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 2, ...current }));
  } catch {
    return { saved: false, warning: "连接仍可使用，但浏览器未能保存凭据；刷新后可能需要重新填写，请检查浏览器存储权限。" };
  }
  try { localStorage.removeItem(legacyKey); }
  catch { return { saved: true, warning: "新配置已保存，但旧版副本未能清除；请在浏览器设置中检查本站数据。" }; }
  return { saved: true };
}

export function rememberLocalModel(rememberKey: boolean): StorageResult {
  const value = getLocalModel();
  return value ? saveLocalModel(value, rememberKey) : rememberKey ? { saved: false } : removePersistent();
}

export function clearLocalModel(): StorageResult { current = null; return removePersistent(); }
