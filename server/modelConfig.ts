import { randomUUID } from "node:crypto";
import { debugFetch } from "./debug";
import type { LlmService } from "./app";
import { configFromEnv } from "./claude";
import { OpenAIClient, OpenAILlmService } from "./openai";
import { Engine } from "../src/sim/engine";
import { SessionStore } from "./sessions";

export class ModelConfigError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

interface Configuration {
  baseUrl: string;
  apiKey: string;
  models: string[];
  llm: LlmService | null;
  lastUsed: number;
}

const TTL = 30 * 60_000;

/** Per-browser credentials, held only in memory and never exposed by health/log APIs. */
export class ModelConfigStore {
  private configs = new Map<string, Configuration>();
  constructor(private fetcher: typeof fetch = fetch) {}

  async verify(baseUrl: unknown, apiKey: unknown) {
    if (typeof baseUrl !== "string" || typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) {
      throw new ModelConfigError("请填写有效的 API 域名和 API Key");
    }
    let url: URL;
    try { url = new URL(baseUrl.trim()); }
    catch { throw new ModelConfigError("API 域名需要包含 https:// 或 http://"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new ModelConfigError("API 地址必须是无账号、查询参数和片段的 HTTP(S) 地址");
    }
    if (url.pathname === "/") url.pathname = "/v1";
    const normalizedUrl = url.href.replace(/\/+$/, "");
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
    this.configs.set(token, { baseUrl: normalizedUrl, apiKey: apiKey.trim(), models, llm: null, lastUsed: Date.now() });
    return { token, baseUrl: normalizedUrl, models };
  }

  get(token: string) {
    this.sweep();
    const config = this.configs.get(token);
    if (!config) throw new ModelConfigError("API 配置已过期，请重新验证并启用模型", 401);
    config.lastUsed = Date.now();
    return config;
  }

  async enable(token: string, model: unknown) {
    const config = this.get(token);
    if (typeof model !== "string" || !model.trim() || model.length > 200 || /[\r\n]/.test(model)) {
      throw new ModelConfigError("请选择或填写有效的模型 ID");
    }
    const cfg = configFromEnv({ ...process.env, AGENT_MODEL: model.trim(), AGENT_FALLBACK: "off" });
    const llm = new OpenAILlmService(new OpenAIClient(config.baseUrl, config.apiKey, debugFetch(this.fetcher), { stream: cfg.openaiStream }), cfg);
    // Exercise the same tool-calling request as gameplay, without starting or changing a real game.
    const probe = await llm.decide(new SessionStore().create("", null), {
      triggers: [{ kind: "start", text: "连通性验证，请选择一个合法行动。" }],
      lastResult: null, observation: new Engine(1).observe(),
    });
    if (probe.error || !probe.action) throw new ModelConfigError(`模型验证失败：${probe.error?.replaceAll("OPENAI_API_KEY", "API Key") || "未返回有效工具调用"}`, 422);
    if (this.get(token) !== config) throw new ModelConfigError("配置已失效，请重新验证", 401);
    config.llm = llm;
    return { llm: true as const, model: llm.model };
  }

  delete(token: string) { this.configs.delete(token); }

  private sweep() {
    const cutoff = Date.now() - TTL;
    for (const [token, config] of this.configs) if (config.lastUsed < cutoff) this.configs.delete(token);
  }
}
