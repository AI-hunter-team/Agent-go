import { isReasoningEffort, type ReasoningEffort } from "../shared/modelConfig";
export interface SavedModel { baseUrl: string; apiKey: string; model: string; reasoningEffort: ReasoningEffort; token?: string }
const storageKey = "agent-go.model-connection.v1";
export function loadLocalModel(): SavedModel | null {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return v && typeof v.baseUrl === "string" && typeof v.apiKey === "string" && typeof v.model === "string" && isReasoningEffort(v.reasoningEffort) ? v : null;
  } catch { return null; }
}
export function saveLocalModel(value: SavedModel) {
  try { localStorage.setItem(storageKey, JSON.stringify(value)); }
  catch { throw new Error("浏览器不允许本地保存，连接仍可使用；请检查浏览器存储权限"); }
}
export function clearLocalModel() { try { localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ } }
