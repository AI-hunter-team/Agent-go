import { interpret, type Structured } from "./boss";
import { respond } from "./npcDialogue";
import type { AgentTurn, CreativeClassification, NormalizedGuidance, Observation, DecisionResult, CutInDialogueRequest, NpcReply } from "../src/shared/types";
import type { LlmService } from "./app";
import type { JourneyInput, JourneyPlan } from "../src/shared/journey";
import { validPlan } from "../src/shared/journey";
import { normalizeBaseUrl, type ModelSettings } from "./modelSettings";
import { buildSystemPrompt, renderTurn } from "./prompts";
import type { Session } from "./sessions";
import { buildJourneySystem, CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, GUIDANCE_SCHEMA, GUIDANCE_SYSTEM, NPC_SCHEMA, NPC_SYSTEM } from "./structured";
import { AGENT_TOOLS, parseToolUse } from "./tools";
import { assertSafeText, untrustedData, validateNormalized } from "./security";
import { readResponsesStream } from "./responsesStream";
import { modelHttpError } from "./modelError";
import { assertCompleted, parseResponse, responseOutput, responseText, responseThinking, responseUsage, type ModelResponse } from "./responsesTypes";
import { DRAFT_SCHEMA, DRAFT_SYSTEM, REVIEW_SCHEMA, buildReviewSystem } from "./review";
import { ReviewFailure, validateDraft, validateReview, type DraftResult, type ReviewInput, type ReviewMetadata, type ReviewResult, type ReviewStrategy } from "../src/shared/review";

/** 通用 Responses HTTP 客户端，凭据只保留在服务端。 */
export class ResponsesClient {
  private readonly endpoint: string;

  /** 固定基础地址、凭据和传输，不探测或退回其他模型协议。 */
  constructor(baseURL: string, private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch, private readonly options: { stream?: boolean } = {}) {
    this.endpoint = normalizeBaseUrl(baseURL) + "/responses";
  }

  /** 发送一次请求；同时接受 SSE 和兼容网关返回的普通 JSON。 */
  async create(params: Record<string, unknown>): Promise<ModelResponse> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { authorization: "Bearer " + this.apiKey, "content-type": "application/json" },
        body: JSON.stringify({ ...params, store: false, include: ["reasoning.encrypted_content"], stream: this.options.stream !== false }),
        signal: AbortSignal.timeout(20_000), redirect: "error",
      });
    } catch {
      throw new Error("无法连接模型，请检查接口配置或稍后重试");
    }
    if (response.status === 401 || response.status === 403) throw new Error("模型认证失败，请检查 API Key 和模型权限");
    if (response.status === 429) throw new Error("模型限流或额度不足，请稍后再试");
    if (!response.ok) throw new Error(await modelHttpError(response, [400, 422].includes(response.status) ? "模型不接受 Responses 请求，请检查模型、思考档位和接口兼容性" : undefined));
    if (response.headers.get("content-type")?.includes("text/event-stream")) return readResponsesStream(response);
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new Error("模型接口返回了无效 JSON"); }
    return parseResponse(value);
  }
}

/** 只重放协议完整的已知条目；失败输出仍在报告里保留原文。 */
function rememberResponse(session: Session, response: ModelResponse): string[] {
  const calls = response.output.filter((item) => item.type === "function_call");
  const ids = new Set(session.responseItems.filter((item) => item.type === "function_call").map((item) => item.call_id));
  for (const call of calls) {
    if (typeof call.call_id !== "string" || !call.call_id.trim() || ids.has(call.call_id)
      || typeof call.name !== "string" || !call.name.trim() || typeof call.arguments !== "string") {
      throw new Error("模型返回了无效或重复的工具结构，未执行");
    }
    ids.add(call.call_id);
  }
  if (response.output.some((item) => !["function_call", "message", "reasoning"].includes(item.type))) {
    throw new Error("模型返回了未授权的输出类型，未执行");
  }
  const items = response.output.filter((item) => {
    if (item.status === "in_progress" || item.status === "incomplete") return false;
    if (item.type === "function_call" || item.type === "reasoning") return true;
    return Array.isArray(item.content) && item.content.some((part) =>
      (part.type === "output_text" && typeof part.text === "string" && part.text.trim())
      || part.type === "refusal");
  });
  session.responseItems.push(...structuredClone(items));
  return items.filter((item) => item.type === "function_call").map((item) => item.call_id!);
}

/** 统一承担游戏决策、指导整理、意图分类和 NPC 对话。 */
export class ResponsesLlmService implements LlmService {
  readonly model: string;
  readonly settings: Readonly<ModelSettings>;

  /** 冻结配置，保证已创建对局不会随页面重新启用而改变。 */
  constructor(private readonly client: ResponsesClient, cfg: ModelSettings) {
    this.settings = Object.freeze({ ...cfg });
    this.model = cfg.model;
  }

  /** 所有远程调用使用相同档位和包含思考在内的总输出预算。 */
  private parameters(): Record<string, unknown> {
    return { model: this.model, max_output_tokens: this.settings.maxTokens, reasoning: { effort: this.settings.reasoningEffort } };
  }

  /** 完成一次观察到动作的转换，只有一个完整合法的工具才交给模拟器。 */
  async decide(session: Session, turn: AgentTurn): Promise<DecisionResult> {
    const started = Date.now();
    const result: DecisionResult = { action: null, thinking: null, usage: null, model: null, latencyMs: 0, error: null };
    const content = renderTurn(turn);
    if (session.pendingCallIds.length) {
      for (const call_id of session.pendingCallIds) session.responseItems.push({ type: "function_call_output", call_id, output: content });
      session.pendingCallIds = [];
    } else {
      session.responseItems.push({ type: "message", role: "user", content });
    }
    const prompt = buildSystemPrompt(session.guidance, session.normalized, session.settings);
    let currentCalls: string[] = [];
    try {
      const response = await this.client.create({
        ...this.parameters(), instructions: prompt.rules,
        input: [{ type: "message", role: "user", content: prompt.guidance }, ...session.responseItems],
        tools: AGENT_TOOLS, tool_choice: "required", parallel_tool_calls: false,
      });
      result.model = response.model ?? this.model;
      result.usage = responseUsage(response);
      result.output = responseOutput(response);
      result.thinking = responseThinking(response);
      currentCalls = rememberResponse(session, response);
      assertCompleted(response, this.settings.maxTokens);
      const calls = response.output.filter((item) => item.type === "function_call");
      if (calls.length !== 1) throw new Error(calls.length === 0
        ? "模型返回空动作（实际 0 个工具），未执行" : "模型必须调用且只调用一个工具，实际 " + calls.length + " 个，未执行");
      let input: unknown;
      try { input = JSON.parse(calls[0].arguments!); }
      catch { throw new Error("工具参数不是有效 JSON，未执行"); }
      const parsed = parseToolUse(calls[0].name!, input);
      if ("error" in parsed) throw new Error(parsed.error);
      result.action = parsed.action;
      session.pendingCallIds = currentCalls;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      // 回应本次每个可重放的工具，明确未执行，不能冒用上一动作的结果。
      for (const call_id of currentCalls) session.responseItems.push({
        type: "function_call_output", call_id,
        output: JSON.stringify({ ok: false, executed: false, error: result.error }),
      });
    }
    result.latencyMs = Date.now() - started;
    return result;
  }

  /** 通过同一个 Responses 请求获取 JSON，调用者负责领域校验。 */
  private async structured(system: string, user: string, schema: object, name: string, onResponse?: (response: ModelResponse) => void): Promise<unknown> {
    const response = await this.client.create({
      ...this.parameters(), instructions: system, input: [{ type: "message", role: "user", content: user }],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    });
    onResponse?.(response);
    assertCompleted(response, this.settings.maxTokens);
    const text = responseText(response);
    try { return JSON.parse(text); }
    catch { throw new Error("模型未返回有效的结构化 JSON"); }
  }

  /** 赛后调用与局内会话隔离，失败也保留供应商已返回的用量。 */
  private async reviewCall<T>(system: string, input: unknown, schema: object, name: string, validate: (value: unknown) => T, operation: "review" | "draft") {
    const started = Date.now();
    let metadata: ReviewMetadata = { model: this.model, usage: null, latencyMs: 0 };
    try {
      const value = await this.structured(system, untrustedData("赛后资料", input), schema, name, response => {
        metadata = { model: response.model ?? this.model, usage: responseUsage(response), latencyMs: Date.now() - started };
      });
      return { value: validate(value), ...metadata, latencyMs: Date.now() - started };
    } catch {
      throw new ReviewFailure("模型未返回有效的复盘或草稿，请重试", { ...metadata, latencyMs: Date.now() - started, operation, status: "error" });
    }
  }

  private readonly interactionCall: Structured = async (system,user,schema,name) => {
    let metadata: import("../src/shared/interaction").ModelMetadata={model:this.model,usage:null};
    try {
      const value=await this.structured(system,user,schema,name,response=>{metadata={model:response.model??this.model,usage:responseUsage(response)};});
      return {value,metadata};
    } catch(error) { throw Object.assign(error instanceof Error?error:new Error("结构化调用失败"),{modelMetadata:metadata}); }
  };
  interpret(instruction: string, context: import("../src/shared/types").BossContext) { return interpret(this.interactionCall,instruction,context); }
  respond(request: import("../src/shared/types").NpcDialogueRequest) { return respond(this.interactionCall,request); }

  /** 基于已结束对局的观察、全局历史与结果生成可核对的复盘。 */
  async review(input: ReviewInput): Promise<ReviewResult> {
    const { value, ...metadata } = await this.reviewCall(buildReviewSystem(input.goal), input, REVIEW_SCHEMA, "round_review", v => validateReview(v, input), "review");
    return { analysis: value, ...metadata };
  }

  /** 仅把玩家选中的建议合并到原指导，不保存为角色跨局记忆。 */
  async draftGuidance(guidance: string, strategies: ReviewStrategy[]): Promise<DraftResult> {
    const { value, ...metadata } = await this.reviewCall(DRAFT_SYSTEM, { guidance, strategies }, DRAFT_SCHEMA, "review_guidance", validateDraft, "draft");
    return { ...value, ...metadata };
  }

  /** 整理玩家指导，保留原有策略与安全校验。 */
  async normalize(text: string): Promise<NormalizedGuidance> {
    assertSafeText(text);
    const data = await this.structured(GUIDANCE_SYSTEM, untrustedData("玩家指导原文", { text }), GUIDANCE_SCHEMA, "guidance") as NormalizedGuidance | null;
    const lists = ["priorities", "rules", "creativeIdeas", "notExecutable", "initialPlan"] as const;
    if (!data || typeof data.summary !== "string" || typeof data.risk !== "string"
      || !lists.every((key) => Array.isArray(data[key]) && data[key].every((value) => typeof value === "string"))) {
      throw new Error("模型返回的指导格式无效");
    }
    validateNormalized(data);
    return data;
  }

  async prepareJourney(input: JourneyInput): Promise<JourneyPlan> {
    assertSafeText(input.guidance);
    const schema = { type: "object", additionalProperties: false, properties: {
      understanding: { type: "string" }, actions: { type: "array", items: { type: "string" } }, adjustment: { type: "string" },
    }, required: ["understanding", "actions", "adjustment"] };
    const data = await this.structured(buildJourneySystem(input.settings.timeLimitSeconds), untrustedData("本局玩家游戏策略与公开设置", {
      guidance: input.autonomous ? "" : input.guidance, autonomous: input.autonomous,
      timeLimitSeconds: input.settings.timeLimitSeconds, goal: "登上地铁并进入车厢", extraQueuePeople: input.settings.extraQueuePeople,
      backpack: input.loadout?.backpack ?? true,
    }), schema, "journey_plan");
    if (!validPlan(data)) throw new Error("初始方案格式无效，请重试");
    assertSafeText(JSON.stringify(data));
    return data;
  }

  /** 将创意意图归入现有环境机制，不代替模拟器结算。 */
  async classify(intent: string, observation: Observation | null): Promise<CreativeClassification> {
    assertSafeText(intent);
    const context = { intent, zone: observation?.self.zone, activity: observation?.self.activity };
    assertSafeText(JSON.stringify(context));
    const data = await this.structured(CLASSIFY_SYSTEM, untrustedData("行动及角色位置", context), CLASSIFY_SCHEMA, "classification") as CreativeClassification | null;
    if (!data || typeof data.reason !== "string" || !["cut_in_line", "jump_gate", "unsupported"].includes(data.mechanic)
      || Object.keys(data).some((key) => !["mechanic", "reason"].includes(key))) throw new Error("模型返回的意图分类格式无效");
    return { mechanic: data.mechanic, reason: data.reason, source: "llm" };
  }

  /** 生成 NPC 答复；失败也保留费用与原始输出，且不会授予插队许可。 */
  async negotiate(request: CutInDialogueRequest): Promise<NpcReply> {
    let metadata: Pick<NpcReply, "model" | "usage" | "output"> = { model: this.model, usage: null };
    try {
      const value = await this.structured(NPC_SYSTEM, untrustedData("NPC 对话资料", request), NPC_SCHEMA, "npc_reply", (response) => {
        metadata = { model: response.model ?? this.model, usage: responseUsage(response), output: responseOutput(response) };
      }) as { accepted?: unknown; reply?: unknown; reason?: unknown } | null;
      if (!value || typeof value.accepted !== "boolean" || typeof value.reply !== "string" || !value.reply.trim() || [...value.reply].length > 500
        || typeof value.reason !== "string" || !value.reason.trim() || [...value.reason].length > 300
        || Object.keys(value).some((key) => !["accepted", "reply", "reason"].includes(key))) throw new Error("模型未返回有效的 NPC 答复");
      return { accepted: value.accepted, reply: value.reply, reason: value.reason, source: "llm", ...metadata };
    } catch (error) {
      return { accepted: false, reply: "暂时无法答复，请保持原来的排队位置。",
        reason: "NPC 对话失败，未获得插队许可：" + (error instanceof Error ? error.message : String(error)), source: "error", ...metadata };
    }
  }
}
