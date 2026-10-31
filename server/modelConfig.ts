import { randomUUID } from "node:crypto";
import { debugFetch } from "./debug";
import type { LlmService } from "./app";
import { configFromEnv, normalizeBaseUrl, type ModelSettings } from "./modelSettings";
import { isReasoningEffort } from "../src/shared/modelConfig";
import { ResponsesClient, ResponsesLlmService } from "./responses";
import { Engine } from "../src/sim/engine";
import { SessionStore } from "./sessions";

export class ModelConfigError extends Error {
  /** 将配置错误映射到可读的 API 状态码。 */
  constructor(message: string, readonly status = 400) { super(message); }
}

interface Configuration {
  baseUrl: string;
  apiKey: string;
  models: string[];
  llm: LlmService | null;
  settings: Readonly<ModelSettings> | null;
  lastUsed: number;
}

const TTL = 30 * 60_000;

/** Per-browser credentials, held only in memory and never exposed by health/log APIs. */
export class ModelConfigStore {
  private configs = new Map<string, Configuration>();
  /** 允许测试注入传输，生产环境使用 fetch。 */
  constructor(private fetcher: typeof fetch = fetch) {}

  /** 验证凭据和模型发现，保持用户填写的 API 基础路径。 */
  async verify(baseUrl: unknown, apiKey: unknown) {
    if (typeof baseUrl !== "string" || typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) {
      throw new ModelConfigError("请填写有效的 API 域名和 API Key");
    }
    let normalizedUrl: string;
    try { normalizedUrl = normalizeBaseUrl(baseUrl); }
    catch { throw new ModelConfigError("API 域名需要包含 https:// 或 http://"); }
    let models: string[];
    try {
      const response = await this.fetcher(`${normalizedUrl}/models`, {
        headers: { authorization: `Bearer ${apiKey.trim()}` },
        signal: AbortSignal.timeout(20_000), redirect: "error",
      });
      if ([401, 403].includes(response.status)) throw new ModelConfigError("认证失败，请检查 API Key 和接口权限", 422);
      if (response.status === 429) throw new ModelConfigError("接口限流或额度不足，请稍后重试", 422);
      // Some compatible gateways do not implement model discovery; probe a manually entered model instead.
      if ([404, 405].includes(response.status)) models = [];
      else {
        if (!response.ok) throw new ModelConfigError(`获取模型列表失败（HTTP ${response.status}）`, 422);
        const data = await response.json();
        if (!Array.isArray(data?.data)) throw new ModelConfigError("模型列表格式不兼容，需要 OpenAI 兼容 API", 422);
        models = [...new Set<string>(data.data.map((m: { id?: unknown }) => m?.id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 200))].sort();
      }
    } catch (error) {
      if (error instanceof ModelConfigError) throw error;
      throw new ModelConfigError("无法连接模型 API，请检查域名、网络和接口协议", 422);
    }
    this.sweep();
    if (this.configs.size >= 100) throw new ModelConfigError("临时配置数量已达上限，请稍后重试", 429);
    const token = randomUUID();
    this.configs.set(token, { baseUrl: normalizedUrl, apiKey: apiKey.trim(), models, llm: null, settings: null, lastUsed: Date.now() });
    return { token, baseUrl: normalizedUrl, models };
  }

  /** 读取仍有效的临时配置，不对外暴露凭据。 */
  get(token: string) {
    this.sweep();
    const config = this.configs.get(token);
    if (!config) throw new ModelConfigError("API 配置已过期，请重新验证并启用模型", 401);
    config.lastUsed = Date.now();
    return config;
  }

  /** 用所选档位探测真实工具协议，成功后替换新对局的配置。 */
  async enable(token: string, model: unknown, reasoningEffort: unknown = "none") {
    const config = this.get(token);
    if (typeof model !== "string" || !model.trim() || model.length > 200 || /[\r\n]/.test(model)) {
      throw new ModelConfigError("请选择或填写有效的模型 ID");
    }
    if (!isReasoningEffort(reasoningEffort)) throw new ModelConfigError("思考强度必须是 none、low、high 或 max");
    const cfg = configFromEnv({ ...process.env, AGENT_MODEL: model.trim(), OPENAI_REASONING_EFFORT: reasoningEffort });
    const llm = new ResponsesLlmService(new ResponsesClient(config.baseUrl, config.apiKey, debugFetch(this.fetcher), { stream: cfg.openaiStream }), cfg);
    // Exercise the same tool-calling request as gameplay, without starting or changing a real game.
    const probe = await llm.decide(new SessionStore().create("", null), {
      triggers: [{ kind: "start", text: "连通性验证，请选择一个合法行动。" }],
      lastResult: null, observation: new Engine(1).observe(),
    });
    if (probe.error || !probe.action) throw new ModelConfigError(`模型验证失败：${probe.error?.replaceAll("OPENAI_API_KEY", "API Key") || "未返回有效工具调用"}`, 422);
    if (this.get(token) !== config) throw new ModelConfigError("配置已失效，请重新验证", 401);
    config.llm = llm;
    config.settings = llm.settings;
    return { llm: true as const, model: llm.model };
  }

  /** 主动撤销已丢弃的配置。 */
  delete(token: string) { this.configs.delete(token); }

  /** 删除闲置超过 TTL 的凭据。 */
  private sweep() {
    const cutoff = Date.now() - TTL;
    for (const [token, config] of this.configs) if (config.lastUsed < cutoff) this.configs.delete(token);
  }
}
