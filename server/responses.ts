import { publicMap, restoreWorld } from "../src/sim/worldDefinition";
import { interpret, type Structured } from "./boss";
import { respond } from "./npcDialogue";
import type { AgentTurn, CreativeClassification, NormalizedGuidance, Observation, DecisionResult, CutInDialogueRequest, NpcReply } from "../src/shared/types";
import type { LlmService } from "./app";
import type { JourneyInput, JourneyPlan } from "../src/shared/journey";
import { guidanceSources } from "../src/shared/guidanceSources";
import { publicActionKnowledge } from "./actionKnowledge";
import { adaptJourneyPlan, defaultJourneyPlan } from "./journeyPlanning";
import { recordPlanningDiagnostic } from "./debug";
import { normalizeBaseUrl, type ModelSettings } from "./modelSettings";
import { buildSystemPrompt, renderTurn } from "./prompts";
import { compactDecisionHistory, decisionStage, prepareDecisionMemory } from "./decisionMemory";
import type { Session } from "./sessions";
import { buildJourneySystem, CLASSIFY_SCHEMA, CLASSIFY_SYSTEM, GUIDANCE_SCHEMA, GUIDANCE_SYSTEM, NPC_SCHEMA, NPC_SYSTEM } from "./structured";
import { agentTools, parseToolUse } from "./tools";
import { assertSafeText, SafetyError, untrustedData, validateNormalized } from "./security";
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
  const ids = session.seenCallIds ??= new Set(session.responseItems.filter((item) => item.type === "function_call").map((item) => item.call_id!));
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
    const content = renderTurn(turn)+"\n"+prepareDecisionMemory(session,turn);
    if (session.pendingCallIds.length) {
      for (const call_id of session.pendingCallIds) session.responseItems.push({ type: "function_call_output", call_id, output: content });
      session.pendingCallIds = [];
    } else {
      session.responseItems.push({ type: "message", role: "user", content });
    }
    const prompt = buildSystemPrompt(session.guidance, session.normalized, session.settings, session.publicMap, session.journeyPlan);
    const earlierFacts = compactDecisionHistory(session);
    let currentCalls: string[] = [];
    try {
      const response = await this.client.create({
        ...this.parameters(), instructions: prompt.rules,
        input: [{ type: "message", role: "user", content: prompt.guidance+(earlierFacts?"\n"+earlierFacts:"") }, ...session.responseItems],
        tools: agentTools(session.publicMap), tool_choice: "required", parallel_tool_calls: false,
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
      const parsed = parseToolUse(calls[0].name!, input, session.publicMap);
      if ("error" in parsed) throw new Error(parsed.error);
      result.action = parsed.action;
      session.lastAction={t:turn.observation.t,stage:decisionStage(turn),action:structuredClone(parsed.action)};
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
    const world = input.world ? restoreWorld(input.seed,input.world) : undefined;
    if(input.world && !world) throw new Error("地图摘要不一致");
    const original = input.autonomous ? "" : input.guidance;
    const schema = { type: "object", additionalProperties: false, properties: {
      understanding: { type: "string" }, actions: { type: "array", items: { type: "string" } }, adjustment: { type: "string" },
      coverage: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        sourceId: { type: "string" }, kind: { type: "string", enum: ["goal", "preference", "condition", "prohibition", "sequence", "method", "other"] },
        handling: { type: "string", enum: ["planned", "needs_clarification", "unsupported"] }, steps: { type: "array", items: { type: "integer" } }, explanation: { type: "string" },
      }, required: ["sourceId", "kind", "handling", "steps", "explanation"] } },
    }, required: ["understanding", "actions", "adjustment", "coverage"] };
    const prompt = buildJourneySystem(input.settings.timeLimitSeconds)+"\n"+`为地铁通行游戏生成初始策略。用户只需自由填写自然语言，不需要提供字段、步骤或固定格式。把指导融入默认规划原则：尽快到站台并登车、按公开地图选择路径、依据现场观察准备和调整。默认原则只补充用户没写的部分，明确要求优先。保留原文全部目标、偏好、否定、先后、条件和方法，不把“不买票”等明确要求弱化为“偏向”，不加相反的购票/守序兜底。sourceRequirements各id可在coverage说明性质、对应步骤及处理方式；无法确认写待澄清，不猜测已满足。understanding、actions、adjustment仅为提案，原文为权威。初始方案不受动作执行器八步限制，也没有每段1000字的业务要求，按表达需要写清即可；初始方案保持用户原文的具体程度：用户未指定的道具、地点和新增招数，不提前展开为固定准备步骤；可以写必要时分散注意力等条件策略。不要把运行时能自主选择的易拉罐等示例写成必经流程。用户明确指定的细节完整保留，具体准备在游戏现场自主决定。不知道当前队伍、隐藏性格或未来事件，只使用公开机制，不假称已观察或保证成功。自主模式coverage为空。\n${publicActionKnowledge("planning", input.guidance, world?publicMap(world):undefined)}`;
    let data:unknown,outputText="",problem:string|null=null,completed=false;
    try { data = await this.structured(prompt, untrustedData("公开规则与指导", {
      guidance: original, sourceRequirements: guidanceSources(original), autonomous: input.autonomous,
      timeLimitSeconds: input.settings.timeLimitSeconds, goal: "登上地铁并进入车厢", extraQueuePeople: input.settings.extraQueuePeople,
      ...(world?{publicMap:publicMap(world)}:{}),
      backpack: input.loadout?.backpack ?? true,
    }), schema, "journey_plan", response=>{
      completed=response.status === "completed" && !response.error && !response.output.some(i=>i.status === "incomplete" || Array.isArray(i.content) && i.content.some(p=>p.type === "refusal"));
      try { outputText=responseText(response); } catch { /* Missing proposal is diagnosed without reading reasoning. */ }
    }); } catch(error) {
      if(error instanceof SafetyError)throw error;
      problem=error instanceof Error?error.message:"模型规划返回失败";
      if(completed && outputText.trim()) {
        const candidate=outputText.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
        try { data=JSON.parse(candidate); } catch { if(!/^[{[]/.test(candidate))data=candidate; }
      }
    }
    const plan=data === undefined ? defaultJourneyPlan(input,"模型本次未完成可读取的方案，已保留原指导并提供基础准备稿；这不是成功生成的模型方案，可继续修改或重新生成。") : adaptJourneyPlan(data,input,world?publicMap(world):undefined);
    assertSafeText(JSON.stringify(plan));
    recordPlanningDiagnostic({outputText,problem,source:plan.preparation?.source??"model",notes:plan.preparation?.notes??[]});
    return plan;
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
