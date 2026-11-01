import { useEffect, useRef, useState } from "react";
import { Api } from "../agent/remoteAgent";
import { loadLocalModel } from "../agent/localModel";
import { isReasoningEffort, type ReasoningEffort } from "../shared/modelConfig";

interface Props {
  health: { llm: boolean; model: string | null };
  onEnabled: (health: Props["health"]) => void;
  onClose: () => void;
  closeLabel?: string;
}

/** 配置模型与思考档位；重新启用只影响之后创建的对局。 */
export function ModelConfigPanel({ health, onEnabled, onClose, closeLabel = "返回开局设置" }: Props) {
  const [saved] = useState(loadLocalModel);
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? "https://api.deepseek.com");
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [verified, setVerified] = useState<{ token: string; models: string[] } | null>(null);
  const [model, setModel] = useState(saved?.model ?? "");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(saved?.reasoningEffort ?? "none");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState<"verify" | "enable" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const pendingToken = useRef<string | null>(null);

  useEffect(() => () => {
    if (pendingToken.current) void Api.discardModel(pendingToken.current).catch(() => undefined);
  }, []);

  /** 丢弃未启用的临时凭据，重置表单验证状态。 */
  const invalidate = () => {
    if (pendingToken.current) void Api.discardModel(pendingToken.current).catch(() => undefined);
    pendingToken.current = null;
    setVerified(null);
    setModel("");
    setEnabled(false);
    setError(null);
  };

  /** 获取模型列表，并优先选择 DeepSeek Flash。 */
  const verify = async () => {
    invalidate();
    setBusy("verify");
    try {
      const result = await Api.verifyModel(baseUrl.trim(), apiKey.trim());
      pendingToken.current = result.token;
      setBaseUrl(result.baseUrl);
      setVerified(result);
      setModel(saved?.model && (!result.models.length || result.models.includes(saved.model)) ? saved.model : health.model && result.models.includes(health.model) ? health.model : result.models.includes("deepseek-flash") ? "deepseek-flash" : result.models.length === 0 ? "deepseek-flash" : "");
      setManual(result.models.length === 0);
      setApiKey("");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  /** 用所选档位验证并启用配置，不更改已有对局。 */
  const enable = async () => {
    if (!verified) return;
    setBusy("enable");
    setError(null);
    try {
      const result = await Api.enableModel(verified.token, model.trim(), reasoningEffort);
      pendingToken.current = null;
      setEnabled(true);
      onEnabled(result);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  /** 清除之后新建对局使用的页面配置。 */
  const clear = async () => {
    setBusy("clear");
    setError(null);
    try {
      const result = await Api.clearModel();
      invalidate();
      setApiKey("");
      onEnabled(result);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <section className="card model-config" aria-labelledby="model-config-title" aria-busy={busy !== null}>
      <div className="row between config-heading">
        <h2 id="model-config-title">模型 API 配置</h2>
        <button className="ghost" disabled={busy !== null} onClick={onClose}>{closeLabel}</button>
      </div>
      <p className="muted">连接 DeepSeek 或兼容 Responses 的 API。本局 Agent 与 NPC 对话使用同一模型配置。</p>
      <ol className="config-steps" aria-label="配置步骤">
        <li className="on" aria-current={!verified ? "step" : undefined}>1 填写接口</li>
        <li className={verified ? "on" : ""} aria-current={verified && !enabled ? "step" : undefined}>2 选择模型</li>
        <li className={enabled ? "on" : ""} aria-current={enabled ? "step" : undefined}>3 启用大模型</li>
      </ol>
      {health.llm && <p className="config-status" role="status">当前已启用：<strong>{health.model}</strong></p>}
      <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <fieldset disabled={busy !== null || enabled}>
          <label className="field" htmlFor="api-base-url">
            <span>API 域名 / Base URL</span>
            <input id="api-base-url" type="url" required value={baseUrl} placeholder="https://api.example.com/v1"
              autoComplete="off" spellCheck={false} onChange={(e) => { invalidate(); setBaseUrl(e.target.value); }} />
            <small className="muted">填写服务商提供的基础地址，无需添加 /responses。</small>
          </label>
          <div className="field">
            <label htmlFor="api-key">API Key</label>
            <div className="key-input">
              <input id="api-key" type={showKey ? "text" : "password"} required={!verified} value={apiKey}
                placeholder={verified ? "Key 已验证，保存在临时内存中" : "输入你的 API Key"} autoComplete="off" spellCheck={false}
                onChange={(e) => { invalidate(); setApiKey(e.target.value); }} />
              <button type="button" aria-label={showKey ? "隐藏 API Key" : "显示 API Key"} aria-pressed={showKey}
                onClick={() => setShowKey((x) => !x)}>{showKey ? "隐藏" : "显示"}</button>
            </div>
          </div>
          <button type="submit" disabled={!baseUrl.trim() || !apiKey.trim()}>{busy === "verify" ? "正在连接…" : verified ? "重新验证连接" : "验证连接并获取模型"}</button>
        </fieldset>
      </form>
      {verified && (
        <div className="config-model-selection">
          <p className="config-status" role="status">{verified.models.length ? `认证成功，已获取 ${verified.models.length} 个模型。` : "接口未提供模型列表，请手动填写模型 ID 并验证。"}</p>
          {verified.models.length > 0 && <label className="field" htmlFor="api-model">
            <span>选择模型</span>
            <select id="api-model" disabled={busy !== null} value={manual ? "__manual__" : model} onChange={(e) => {
              setManual(e.target.value === "__manual__"); setModel(e.target.value === "__manual__" ? "" : e.target.value); setEnabled(false); setError(null);
            }}>
              <option value="" disabled>请选择支持工具调用的对话模型</option>
              {verified.models.map((id) => <option key={id} value={id}>{id}</option>)}
              <option value="__manual__">手动填写模型 ID…</option>
            </select>
          </label>}
          {manual && <label className="field" htmlFor="api-model-manual"><span>模型 ID</span>
            <input id="api-model-manual" value={model} maxLength={200} disabled={busy !== null} placeholder="例如 deepseek-flash" onChange={(e) => { setModel(e.target.value); setEnabled(false); setError(null); }} />
          </label>}
          <label className="field" htmlFor="api-reasoning-effort">
            <span>思考强度</span>
            <select id="api-reasoning-effort" value={reasoningEffort} disabled={busy !== null} onChange={(e) => {
              if (isReasoningEffort(e.target.value)) { setReasoningEffort(e.target.value); setEnabled(false); setError(null); }
            }}>
              <option value="none">关闭</option><option value="low">低</option><option value="high">高</option><option value="max">最高</option>
            </select>
          </label>
          <small className="muted">重新启用后用于新对局；档位不代表固定思考长度。</small>
          <p className="muted">模型列表不代表账号拥有调用权限；图片模型不能驱动角色。启用时会进行一次真实工具调用，验证模型权限和兼容性，可能消耗少量 API 额度。</p>
          <button className="primary" disabled={busy !== null || !model.trim() || enabled} onClick={() => void enable()}>{busy === "enable" ? "正在验证模型…" : "验证模型、启用并保存本地"}</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {enabled && <div className="config-success" role="status"><strong>模型验证通过，已开启大模型</strong>
        <p>返回开局设置，填写指导后即可开始。</p>
        <div className="row"><button className="primary" onClick={onClose}>去开局</button><button onClick={invalidate}>更换配置</button></div>
      </div>}
      <p className="muted small">启用后将地址、密钥、模型和思考设置保存到当前浏览器，刷新自动恢复有效连接；会话过期后保留填写内容。清除页面配置也会删除本地保存。</p>
      {(health.llm || saved) && <button className="ghost" disabled={busy !== null} onClick={() => void clear()}>{busy === "clear" ? "正在清除…" : "清除本地保存与页面配置"}</button>}
    </section>
  );
}
