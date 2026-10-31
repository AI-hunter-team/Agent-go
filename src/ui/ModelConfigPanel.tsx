import { useEffect, useRef, useState } from "react";
import { Api } from "../agent/remoteAgent";

interface Props {
  health: { llm: boolean; model: string | null };
  onEnabled: (health: Props["health"]) => void;
  onClose: () => void;
}

export function ModelConfigPanel({ health, onEnabled, onClose }: Props) {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [verified, setVerified] = useState<{ token: string; models: string[] } | null>(null);
  const [model, setModel] = useState("");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState<"verify" | "enable" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const pendingToken = useRef<string | null>(null);

  useEffect(() => () => {
    if (pendingToken.current) void Api.discardModel(pendingToken.current).catch(() => undefined);
  }, []);

  const invalidate = () => {
    if (pendingToken.current) void Api.discardModel(pendingToken.current).catch(() => undefined);
    pendingToken.current = null;
    setVerified(null);
    setModel("");
    setEnabled(false);
    setError(null);
  };

  const verify = async () => {
    invalidate();
    setBusy("verify");
    try {
      const result = await Api.verifyModel(baseUrl.trim(), apiKey.trim());
      pendingToken.current = result.token;
      setBaseUrl(result.baseUrl);
      setVerified(result);
      setModel(health.model && result.models.includes(health.model) ? health.model : "");
      setManual(result.models.length === 0);
      setApiKey("");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const enable = async () => {
    if (!verified) return;
    setBusy("enable");
    setError(null);
    try {
      const result = await Api.enableModel(verified.token, model.trim());
      pendingToken.current = null;
      setEnabled(true);
      onEnabled(result);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

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
      <div className="row between">
        <h2 id="model-config-title">模型 API 配置</h2>
        <button className="ghost" disabled={busy !== null} onClick={onClose}>返回开局设置</button>
      </div>
      <p className="muted">连接你的 OpenAI 兼容 API，验证后选择模型来驱动 Agent。NPC 使用开发者配置的独立模型。</p>
      <ol className="config-steps" aria-label="配置步骤">
        <li className="on">1 填写接口</li>
        <li className={verified ? "on" : ""}>2 选择模型</li>
        <li className={enabled ? "on" : ""}>3 启用大模型</li>
      </ol>
      {health.llm && <p className="config-status" role="status">当前已启用：<strong>{health.model}</strong></p>}
      <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <fieldset disabled={busy !== null || enabled}>
          <label className="field" htmlFor="api-base-url">
            <span>API 域名 / Base URL</span>
            <input id="api-base-url" type="url" required value={baseUrl} placeholder="https://api.example.com/v1"
              autoComplete="off" spellCheck={false} onChange={(e) => { invalidate(); setBaseUrl(e.target.value); }} />
            <small className="muted">只填写域名时会自动补上 /v1；也可填写完整 API 基础路径。</small>
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
      {verified && !enabled && (
        <div className="config-model-selection">
          <p className="config-status" role="status">{verified.models.length ? `认证成功，已获取 ${verified.models.length} 个模型。` : "接口未提供模型列表，请手动填写模型 ID 并验证。"}</p>
          {verified.models.length > 0 && <label className="field" htmlFor="api-model">
            <span>选择模型</span>
            <select id="api-model" disabled={busy !== null} value={manual ? "__manual__" : model} onChange={(e) => {
              setManual(e.target.value === "__manual__"); setModel(e.target.value === "__manual__" ? "" : e.target.value); setError(null);
            }}>
              <option value="" disabled>请选择支持工具调用的对话模型</option>
              {verified.models.map((id) => <option key={id} value={id}>{id}</option>)}
              <option value="__manual__">手动填写模型 ID…</option>
            </select>
          </label>}
          {manual && <label className="field" htmlFor="api-model-manual"><span>模型 ID</span>
            <input id="api-model-manual" value={model} maxLength={200} disabled={busy !== null} placeholder="例如 gpt-6-luna" onChange={(e) => { setModel(e.target.value); setError(null); }} />
          </label>}
          <p className="muted">模型列表不代表账号拥有调用权限；图片模型不能驱动角色。启用时会进行一次真实工具调用，验证权限和兼容性，可能消耗少量 API 额度。</p>
          <button className="primary" disabled={busy !== null || !model.trim()} onClick={() => void enable()}>{busy === "enable" ? "正在验证模型…" : "验证模型并启用大模型"}</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {enabled && <div className="config-success" role="status"><strong>模型验证通过，已开启大模型</strong>
        <p>返回开局设置，填写指导后即可开始。</p>
        <div className="row"><button className="primary" onClick={onClose}>去开局</button><button onClick={invalidate}>更换配置</button></div>
      </div>}
      <p className="muted small">Key 不写入浏览器存储或 .env 文件。刷新页面后需重新填写；临时配置闲置 30 分钟后失效。</p>
      {health.llm && <button className="ghost" disabled={busy !== null} onClick={() => void clear()}>{busy === "clear" ? "正在清除…" : "清除页面配置"}</button>}
    </section>
  );
}
