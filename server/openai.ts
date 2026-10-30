import type { AgentTurn, CreativeClassification, NormalizedGuidance, Observation, DecisionResult } from "../src/shared/types";
import type { LlmService } from "./app";
import type { ClaudeConfig } from "./claude";
import { buildSystemPrompt, renderTurn } from "./prompts";
import type { Session } from "./sessions";
import { CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, GUIDANCE_SCHEMA, GUIDANCE_SYSTEM } from "./structured";
import { AGENT_TOOLS, parseToolUse } from "./tools";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface Completion {
  model?: string;
  choices?: { finish_reason: string; message: ChatMessage & { refusal?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

/** OpenAI-compatible Chat Completions; credentials stay in the server process. */
export class OpenAIClient {
  private readonly endpoint: string;

  constructor(
    baseURL: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(baseURL);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("OPENAI_BASE_URL 必须是不含凭据、查询参数的 HTTP(S) 地址");
    }
    this.endpoint = `${url.href.replace(/\/$/, "")}/chat/completions`;
  }

  async complete(params: Record<string, unknown>): Promise<Completion> {
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      });
      if (response.status === 401 || response.status === 403) throw new Error("模型认证失败，请检查 OPENAI_API_KEY 和模型权限");
      if (response.status === 429) throw new Error("模型限流或额度不足，请稍后再试");
      if (!response.ok) throw new Error(`模型接口错误 ${response.status}：${(await response.text()).slice(0, 1000)}`);
      return await response.json() as Completion;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Some gateways echo request data in errors. Never return the credential.
      throw new Error(this.apiKey ? message.split(this.apiKey).join("[REDACTED]") : message);
    }
  }
}

const CHAT_TOOLS = AGENT_TOOLS.map((tool) => ({
  type: "function",
  function: { name: tool.name, description: tool.description, parameters: tool.input_schema, strict: true },
}));

export class OpenAILlmService implements LlmService {
  readonly model: string;

  constructor(private readonly client: OpenAIClient, private readonly cfg: ClaudeConfig) {
    this.model = cfg.model;
  }

  async decide(session: Session, turn: AgentTurn): Promise<DecisionResult> {
    const started = Date.now();
    const result: DecisionResult = { action: null, thinking: null, usage: null, model: null, latencyMs: 0, error: null };
    const last = session.chatMessages.at(-1);
    const content = renderTurn(turn);
    if (last?.role === "assistant" && last.tool_calls?.length) {
      // Even rejected/truncated/batched requests must have every tool id answered.
      for (const call of last.tool_calls) {
        session.chatMessages.push({ role: "tool", tool_call_id: call.id, content });
      }
    } else {
      session.chatMessages.push({ role: "user", content });
    }
    const prompt = buildSystemPrompt(session.guidance, session.normalized);
    try {
      const response = await this.client.complete({
        model: this.model,
        max_completion_tokens: this.cfg.maxTokens,
        reasoning_effort: "low",
        messages: [{ role: "system", content: `${prompt.rules}\n\n${prompt.guidance}\n本次思考预算不超过 ${this.cfg.maxThinkingTokens} token，动作输出另计。` }, ...session.chatMessages],
        tools: CHAT_TOOLS,
        tool_choice: "required",
        parallel_tool_calls: false,
      });
      const usage = response.usage;
      result.model = response.model ?? this.model;
      result.usage = usage ? {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        thinkingTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
        cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      } : null;
      const choice = response.choices?.[0];
      if (!choice?.message) throw new Error("模型返回中缺少 choices.message");
      if (choice.message.refusal || choice.finish_reason === "content_filter") throw new Error("模型拒绝了这次请求");
      const message = choice.message;
      const calls = message.tool_calls ?? [];
      if (calls.some((c) => !c.id || c.type !== "function" || !c.function?.name || typeof c.function.arguments !== "string")) {
        throw new Error("模型返回了无效的工具结构，未执行");
      }
      session.chatMessages.push({ role: "assistant", content: message.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
      if ((result.usage?.thinkingTokens ?? 0) > this.cfg.maxThinkingTokens) {
        throw new Error(`思考用量 ${result.usage!.thinkingTokens} 超过 ${this.cfg.maxThinkingTokens} token，未执行`);
      }
      if (choice.finish_reason === "length") throw new Error(`超出单次决策 ${this.cfg.maxTokens} token 上限，未执行`);
      if (calls.length !== 1) throw new Error(`模型必须调用且只调用一个工具，实际 ${calls.length} 个，未执行`);
      let input: unknown;
      try { input = JSON.parse(calls[0].function.arguments); }
      catch { throw new Error("工具参数不是有效 JSON，未执行"); }
      const parsed = parseToolUse(calls[0].function.name, input);
      if ("error" in parsed) throw new Error(parsed.error);
      result.action = parsed.action;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    result.latencyMs = Date.now() - started;
    return result;
  }

  private async structured(system: string, user: string, schema: object, name: string, maxTokens: number): Promise<unknown> {
    const response = await this.client.complete({
      model: this.model,
      max_completion_tokens: maxTokens,
      reasoning_effort: "low",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    });
    const choice = response.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new Error("模型拒绝了这次请求");
    if (choice?.finish_reason === "length") throw new Error("输出被截断");
    if (!choice?.message?.content) throw new Error("模型未返回结构化内容");
    return JSON.parse(choice.message.content);
  }

  async normalize(text: string): Promise<NormalizedGuidance> {
    const data = await this.structured(GUIDANCE_SYSTEM, `玩家指导原文：\n${text}`, GUIDANCE_SCHEMA, "guidance", 4096) as NormalizedGuidance | null;
    const lists = ["priorities", "rules", "creativeIdeas", "notExecutable", "initialPlan"] as const;
    if (!data || typeof data.summary !== "string" || typeof data.risk !== "string" ||
      !lists.every((k) => Array.isArray(data[k]) && data[k].every((v) => typeof v === "string"))) {
      throw new Error("模型返回的指导格式无效");
    }
    return data;
  }

  async classify(intent: string, observation: Observation | null): Promise<CreativeClassification> {
    const where = observation ? `角色当前位置：${observation.self.zone}，${observation.self.activity}` : "";
    const data = await this.structured(CLASSIFY_SYSTEM, `角色想做的行动：「${intent}」\n${where}`, CLASSIFY_SCHEMA, "classification", 1024) as CreativeClassification | null;
    if (!data || typeof data.reason !== "string" || !["cut_in_line", "jump_gate", "unsupported"].includes(data.mechanic)) {
      throw new Error("模型返回的意图分类格式无效");
    }
    return { mechanic: data.mechanic, reason: data.reason, source: "llm" };
  }
}
