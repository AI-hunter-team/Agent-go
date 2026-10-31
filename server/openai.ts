import { readChatStream } from "./chatStream";
import { modelHttpError } from "./modelError";
import type { AgentTurn, CreativeClassification, NormalizedGuidance, Observation, DecisionResult, CutInDialogueRequest, NpcReply } from "../src/shared/types";
import type { LlmService } from "./app";
import type { ClaudeConfig } from "./claude";
import { buildSystemPrompt, renderTurn } from "./prompts";
import type { Session } from "./sessions";
import { CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, GUIDANCE_SCHEMA, GUIDANCE_SYSTEM, NPC_SCHEMA, NPC_SYSTEM } from "./structured";
import { AGENT_TOOLS, parseToolUse } from "./tools";
import { assertSafeText, untrustedData, validateNormalized } from "./security";

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
  /** Provider-returned reasoning required by DeepSeek tool conversation history. */
  reasoning_content?: string;
}

interface Completion {
  id?: string;
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
  readonly isDeepSeek: boolean;

  constructor(
    baseURL: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly options: { stream?: boolean } = {},
  ) {
    const url = new URL(baseURL);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("OPENAI_BASE_URL 必须是不含凭据、查询参数的 HTTP(S) 地址");
    }
    this.endpoint = `${url.href.replace(/\/$/, "")}/chat/completions`;
    this.isDeepSeek = url.hostname === "api.deepseek.com";
  }

  async complete(params: Record<string, unknown>): Promise<Completion> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ ...params, ...(this.options.stream === false ? {} : { stream: true, stream_options: { include_usage: true } }) }),
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      });
    } catch {
      // Gateways and transports may echo prompts or credentials in error text.
      throw new Error("无法连接模型，请检查接口配置或稍后重试");
    }
    if (response.status === 401 || response.status === 403) throw new Error("模型认证失败，请检查 OPENAI_API_KEY 和模型权限");
    if (response.status === 429) throw new Error("模型限流或额度不足，请稍后再试");
    if (!response.ok) throw new Error(await modelHttpError(response));
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      return readChatStream(response);
    }
    // Some compatible gateways ignore stream:true and return a regular completion.
    try { return await response.json() as Completion; }
    catch { throw new Error("模型接口返回了无效 JSON"); }
  }
}

const CHAT_TOOLS = AGENT_TOOLS.map((tool) => ({
  type: "function",
  function: { name: tool.name, description: tool.description, parameters: tool.input_schema, strict: true },
}));

// DeepSeek strict tools require /beta and reject string length constraints.
// Use ordinary function tools on either endpoint; parseToolUse still enforces limits.
const DEEPSEEK_TOOLS = CHAT_TOOLS.map(({ function: fn, ...tool }) => ({
  ...tool,
  function: {
    name: fn.name, description: fn.description,
    parameters: { ...fn.parameters, properties: Object.fromEntries(
      Object.entries(fn.parameters.properties ?? {}).map(([name, definition]) => {
        const property = { ...definition as Record<string, unknown> };
        delete property.minLength;
        delete property.maxLength;
        return [name, property];
      }),
    ) },
  },
}));

export class OpenAILlmService implements LlmService {
  readonly model: string;

  constructor(private readonly client: OpenAIClient, private readonly cfg: ClaudeConfig) {
    this.model = cfg.model;
  }

  private completionOptions(maxTokens: number) {
    const effort = this.cfg.reasoningEffort ?? "low";
    return {
      model: this.model, reasoning_effort: effort,
      ...(this.client.isDeepSeek
        ? { max_tokens: maxTokens, thinking: { type: effort === "none" ? "disabled" : "enabled" } }
        : { max_completion_tokens: maxTokens }),
    };
  }

  private jsonOptions(system: string, user: string, schema: object, name: string) {
    return {
      messages: [
        { role: "system", content: this.client.isDeepSeek
          ? `${system}\n只返回一个 JSON 对象，遵循以下 JSON Schema（字段、类型及限制均适用）：\n${JSON.stringify(schema)}`
          : system },
        { role: "user", content: user },
      ],
      response_format: this.client.isDeepSeek
        ? { type: "json_object" }
        : { type: "json_schema", json_schema: { name, strict: true, schema } },
    };
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
    const prompt = buildSystemPrompt(session.guidance, session.normalized, session.settings);
    try {
      const response = await this.client.complete({
        ...this.completionOptions(this.cfg.maxTokens),
        messages: [
          { role: "system", content: `${prompt.rules}\n本次思考预算不超过 ${this.cfg.maxThinkingTokens} token，动作输出另计。` },
          { role: "user", content: prompt.guidance },
          ...session.chatMessages,
        ],
        tools: this.client.isDeepSeek ? DEEPSEEK_TOOLS : CHAT_TOOLS,
        tool_choice: this.client.isDeepSeek ? "auto" : "required",
        ...(this.client.isDeepSeek ? {} : { parallel_tool_calls: false }),
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
      result.output = { id: response.id ?? null, stopReason: choice?.finish_reason ?? null, content: choice?.message ? [structuredClone(choice.message)] : [] };
      const exposed = choice?.message as (ChatMessage & { reasoning_content?: string; reasoning?: string }) | undefined;
      result.thinking = exposed?.reasoning_content ?? exposed?.reasoning ?? null;
      if (!choice?.message) throw new Error("模型返回中缺少 choices.message");
      if (choice.message.refusal || choice.finish_reason === "content_filter") throw new Error("模型拒绝了这次请求");
      const message = choice.message;
      const calls = message.tool_calls ?? [];
      if (calls.some((c) => !c.id || c.type !== "function" || !c.function?.name || typeof c.function.arguments !== "string")) {
        throw new Error("模型返回了无效的工具结构，未执行");
      }
      // Empty replies are still retained in result.output for diagnosis, but must not
      // become blank assistant turns in the next paid request. Keep every tool id,
      // including rejected/truncated calls, so the next turn can answer them.
      const empty = calls.length === 0 && !message.content?.trim();
      if (!empty) session.chatMessages.push({
        role: "assistant", content: message.content ?? null,
        ...(calls.length ? { tool_calls: calls } : {}),
        ...(this.client.isDeepSeek && typeof message.reasoning_content === "string"
          ? { reasoning_content: message.reasoning_content } : {}),
      });
      if ((result.usage?.thinkingTokens ?? 0) > this.cfg.maxThinkingTokens) {
        throw new Error(`思考用量 ${result.usage!.thinkingTokens} 超过 ${this.cfg.maxThinkingTokens} token，未执行`);
      }
      if (choice.finish_reason === "length") throw new Error(`超出单次决策 ${this.cfg.maxTokens} token 上限，未执行`);
      if (empty) throw new Error("模型返回空响应（无内容或工具），实际 0 个工具，未执行");
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

  async negotiate(request: CutInDialogueRequest): Promise<NpcReply> {
    let metadata: Pick<NpcReply, "model" | "usage" | "output"> = { model: this.model, usage: null };
    try {
      const response = await this.client.complete({
        // K2.6 uses a thinking toggle and does not accept reasoning_effort.
        ...(this.model === "kimi-k2.6"
          ? { model: this.model, max_completion_tokens: 1024, thinking: { type: "disabled" } }
          : this.completionOptions(1024)),
        ...this.jsonOptions(NPC_SYSTEM, untrustedData("NPC 对话资料", request), NPC_SCHEMA, "npc_reply"),
      });
      const choice = response.choices?.[0];
      const usage = response.usage;
      metadata = {
        model: response.model ?? this.model,
        usage: usage ? { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0,
          thinkingTokens: usage.completion_tokens_details?.reasoning_tokens ?? null, cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0 } : null,
        output: { id: response.id ?? null, stopReason: choice?.finish_reason ?? null, content: choice?.message ? [structuredClone(choice.message)] : [] },
      };
      if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new Error("模型拒绝了这次请求");
      if (choice?.finish_reason === "length") throw new Error("输出被截断");
      const value = JSON.parse(choice?.message?.content ?? "null");
      if (!value || typeof value.accepted !== "boolean" || typeof value.reply !== "string" || !value.reply.trim() || [...value.reply].length > 500
        || typeof value.reason !== "string" || !value.reason.trim() || [...value.reason].length > 300
        || Object.keys(value).some((key) => !["accepted", "reply", "reason"].includes(key))) throw new Error("模型未返回有效的 NPC 答复");
      return { accepted: value.accepted, reply: value.reply, reason: value.reason, source: "llm", ...metadata };
    } catch (error) {
      return { accepted: false, reply: "暂时无法答复，请保持原来的排队位置。", reason: `NPC 对话失败，未获得插队许可：${error instanceof Error ? error.message : String(error)}`, source: "error", ...metadata };
    }
  }

  private async structured(system: string, user: string, schema: object, name: string, maxTokens: number): Promise<unknown> {
    const response = await this.client.complete({
      ...this.completionOptions(maxTokens),
      ...this.jsonOptions(system, user, schema, name),
    });
    const choice = response.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new Error("模型拒绝了这次请求");
    if (choice?.finish_reason === "length") throw new Error("输出被截断");
    if (!choice?.message?.content) throw new Error("模型未返回结构化内容");
    return JSON.parse(choice.message.content);
  }

  async normalize(text: string): Promise<NormalizedGuidance> {
    assertSafeText(text);
    const data = await this.structured(GUIDANCE_SYSTEM, untrustedData("玩家指导原文", { text }), GUIDANCE_SCHEMA, "guidance", 4096) as NormalizedGuidance | null;
    const lists = ["priorities", "rules", "creativeIdeas", "notExecutable", "initialPlan"] as const;
    if (!data || typeof data.summary !== "string" || typeof data.risk !== "string" ||
      !lists.every((k) => Array.isArray(data[k]) && data[k].every((v) => typeof v === "string"))) {
      throw new Error("模型返回的指导格式无效");
    }
    validateNormalized(data);
    return data;
  }

  async classify(intent: string, observation: Observation | null): Promise<CreativeClassification> {
    assertSafeText(intent);
    const context = { intent, zone: observation?.self.zone, activity: observation?.self.activity };
    assertSafeText(JSON.stringify(context));
    const data = await this.structured(CLASSIFY_SYSTEM, untrustedData("行动及角色位置", context), CLASSIFY_SCHEMA, "classification", 1024) as CreativeClassification | null;
    if (!data || typeof data.reason !== "string" || !["cut_in_line", "jump_gate", "unsupported"].includes(data.mechanic)) {
      throw new Error("模型返回的意图分类格式无效");
    }
    return { mechanic: data.mechanic, reason: data.reason, source: "llm" };
  }
}
