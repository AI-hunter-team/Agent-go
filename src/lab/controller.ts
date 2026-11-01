import { RemoteAgent } from "../agent/remoteAgent";
import type { Agent, Interpreter, NpcResponder } from "../agent/agent";
import type { ActionLifecycle, ActionPlan, ActionResult, AgentAction, DecisionResult, Observation } from "../shared/types";
import type { Engine } from "../sim/engine";
import { buildIntentContext, classifyByKeywords, parsePlan } from "../sim/intent";
import { offlineNpcResponse } from "../sim/dialogue";
import { ATTRACTIONS, NAV_NODES } from "../sim/layout";
import { DT } from "../sim/scenario";
import { explicitPhysicalIntent } from "./physicalIntent";
import { physicalActionPlan } from "../sim/actions/physical";
import { assessRun, captureLabFrame, lifecycleText, queueFact, REACTIONS, type Assessment, type LabFrame, type QueueFact } from "./feedback";
import { ITEM_DEFS } from "../sim/content/items";
import { describeAction } from "../ui/format";
import { auditInstruction, extractRequirements, reconcileInstruction, type Requirement } from "../sim/actions/instructionAudit";
import { personQuery } from "../sim/personSearch";

export type LabAgent = Agent & { interpret: Interpreter; respond: NpcResponder };
export type LabMode = "model" | "offline";
export interface LabTrace { t: number; kind: string; text: string; data?: unknown }
export interface LabRun {
  id: number; instruction: string; mode: LabMode; state: "running" | "finished" | "rejected" | "error" | "stopped" | "partial";
  summary: string; before: ReturnType<typeof snapshot>; after?: ReturnType<typeof snapshot>; trace: LabTrace[];
  fresh: boolean;
  steps: ActionLifecycle[];
  frames: LabFrame[];
  queues: { t: number; queue: QueueFact | null }[];
  sceneId?: string;
  assessment?: Assessment;
  requests: { t: number; action: AgentAction; result: ActionResult }[];
  paths?: { role: AgentAction; instruction: string; originalPlan?: ActionPlan; finalPlan?: ActionPlan; changes: string[]; requirements: Requirement[]; source?: "program"|"model"|"offline"; stage?: "preparation"|"execution" }[];
  searchHistory?: Engine["personSearch"]["history"];
}

export function snapshot(e: Engine) {
  return {
    t: e.t, status: e.status, failReason: e.failReason, position: { ...e.player.pos },
    hasTicket: e.player.hasTicket, screened: e.player.screened, passedGate: e.player.passedGate, onPlatform: e.player.onPlatform,
    activity: structuredClone(e.player.activity),
    inventory: e.world.items.holdings("player").map(i => ({ id: i.id, kind: i.kind, used: i.used ?? false, slot: e.world.items.slot(i), ownerId: i.ownerId })),
    items: structuredClone([...e.world.items.items.values()]),
    queue: queueFact(e), outages: [...e.world.outages.entries()],
    distractionSeconds: e.timeBreakdown.distraction ?? 0,
    observedSceneEvents:structuredClone(e.world.observedSceneEvents),
    targetSearch:e.world.personSearch?structuredClone(e.world.personSearch):null,
    restraints: [...e.world.restraints.entries()].map(([id,r])=>({id,...r,remaining:Math.max(0,r.until-e.t)})),
    guards: e.guards.guards.map(g => ({ id: g.def.id, position: { ...g.pos }, mode: g.mode, incapacitated: g.incapacitated })),
    transfers: structuredClone(e.world.items.transfers), alerts: structuredClone([...e.alerts.records.values()]),
    events: structuredClone(e.events.events), log: structuredClone(e.world.events),
    facilities: [...e.world.facilities.values()].map(f => ({ id: f.def.id, status: f.status, queue: [...f.queue], serving: f.serving?.personId ?? null })),
    npcs: [...e.world.persons.values()].filter(p => !p.isPlayer).map(p => ({ id: p.id, position: { ...p.pos }, activity: p.activity.kind, reaction: e.npcBrain.active.get(p.id)?.action ?? null, incapacitated: p.incapacitated, persona: structuredClone(p.persona), dialogueCount: e.dialogue.history.get(p.id)?.length ?? 0, memoryCount: e.npcBrain.memory.get(p.id)?.length ?? 0 })),
  };
}

/** This deliberately limited fallback is never presented as model understanding. */
export function offlineLabAction(text: string, o: Observation): AgentAction {
  const reason = "离线关键词映射，不代表大模型理解";
  const named = (text.match(/\b(?:TVM-[123]|S[123]|G[1-5])\b/i)?.[0] ?? "").toUpperCase();
  const facility = named || (/安检/.test(text) ? "S2" : /闸/.test(text) ? "G3" : "TVM-2");
  if (/离开.*队|离队/.test(text)) return { type: "leave_queue", reason };
  if (/^(?:等|等待)\s*\d*/.test(text)) return { type: "wait", seconds: Math.min(20, Math.max(1, Number(text.match(/\d+/)?.[0] ?? 5))), reason };
  if (/滑.*扶手|翻|抢|推搡|打晕|击晕|击打|打人|威胁|索要|交换|换|说服|聊天|给|丢|扔|放下|拿|取|捡|喊|制造.*声/.test(text)) return { type: "act", instruction: text, reason };
  if (/观察.*(?:乘客|保安)|查看.*(?:乘客|保安)/.test(text)) {
    const p = o.people?.find(p => text.includes(p.id)) ?? [...(o.people ?? [])].sort((a, b) => a.distance - b.distance)[0];
    if (p) return { type: "observe", targetId: p.id, reason };
  }
  if (/扶梯|楼梯|站台/.test(text)) {
    const route = /扶梯/.test(text) ? "escalator" : "stairs";
    const node = NAV_NODES.find(n => n.id === (route === "stairs" ? "STAIRS_TOP" : "ESCALATOR_TOP"))!;
    if (Math.hypot(o.self.position.x - node.pos.x, o.self.position.y - node.pos.y) > .8) return { type: "move_to", target: node.id, reason };
    return { type: "traverse", route, walking: /步行|走.*扶梯/.test(text), reason };
  }
  const attraction = ATTRACTIONS.find(a => text.includes(a.id) || text.includes(a.label) || (a.kind === "toys" && /玩具/.test(text)) || (a.kind === "flowers" && /花店/.test(text)) || (a.kind === "seating" && /坐|休息/.test(text)) || (a.kind === "information" && /信息牌/.test(text)) || (a.kind === "advert" && /广告/.test(text)));
  if (attraction) {
    if (Math.hypot(o.self.position.x - attraction.approach.x, o.self.position.y - attraction.approach.y) > 2) return { type: "move_to", target: attraction.id, reason };
    return { type: "inspect_attraction", attraction: attraction.id, mode: /停|休息/.test(text) ? "linger" : "glance", reason };
  }
  if (/不买票/.test(text) && /安检/.test(text)) return { type: "move_to", target: "S2", reason };
  if (/买票|加入|排队|通过.*安检|通过.*闸|直接.*闸/.test(text)) return { type: "join_queue", facility, reason };
  const node = NAV_NODES.find(n => text.includes(n.id));
  if (node || named) return { type: "move_to", target: node?.id ?? named, reason };
  return { type: "act", instruction: text, reason };
}

type Factory = (instruction: string, engine: Engine) => Promise<LabAgent>;
const remoteFactory: Factory = (text, e) => RemoteAgent.create(`测试原文：${text}。允许先寻找、观察和等待，目标确认后继续原行动。已目击购票无需问话。语言与动作分开；仅要求威胁话术时不擅自动手，明确动作不可遗漏。`, null, crypto.randomUUID(), { ...e.settings }, { ...e.loadout });

/** Owns only the testing cadence. All world facts still pass through Engine. */
export class LabController {
  runs: LabRun[] = [];
  busy = false;
  private generation = 0;
  private active: LabAgent | null = null;
  private sequence = 0;
  constructor(public engine: Engine, private changed: () => void = () => {}, private factory: Factory = remoteFactory, private yieldFrame: () => Promise<void> = () => new Promise(r => setTimeout(r, 16))) {}

  stop() {
    this.generation++;
    this.busy = false;
    const run = this.runs.at(-1);
    if (run?.state === "running") { run.state = "stopped"; run.summary = "测试已停止；现场冻结，迟到响应不会执行。"; run.after = snapshot(this.engine); run.assessment = assessRun(run); }
    const a = this.active; this.active = null;
    if (a) void a.dispose().catch(() => undefined);
    this.changed();
  }
  reset(engine: Engine) { this.stop(); this.engine = engine; this.runs = []; this.changed(); }

  async run(instruction: string, mode: LabMode, freshScene?: () => Engine, sceneId?: string) {
    if (this.busy) return;
    if (!instruction.trim() || [...instruction].length > 200) throw new Error("请输入 1–200 字的行动或目标");
    if (freshScene) { const fresh = freshScene(); this.stop(); this.engine = fresh; }
    const e = this.engine;
    const run: LabRun = { id: ++this.sequence, instruction, mode, fresh: !!freshScene, state: "running", summary: "正在理解输入…", before: snapshot(e), trace: [], steps: [], frames: [captureLabFrame(e)], queues: [{ t: e.t, queue: queueFact(e) }], requests: [], sceneId };
    this.runs.push(run); this.busy = true;
    const version = ++this.generation;
    const alive = () => version === this.generation;
    const note = (kind: string, text: string, data?: unknown) => { run.trace.push({ t: e.t, kind, text, ...(data === undefined ? {} : { data }) }); this.changed(); };
    note("原始输入", instruction);
    note("要求拆解", extractRequirements(instruction).map(r => `${r.text}${r.conditional ? "（有条件）" : ""}`).join("；"), extractRequirements(instruction));
    let lifecycleCursor = e.executor.lifecycle.length;
    let eventCursor = e.events.events.length;
    const seenSceneEvents=new Set(e.world.observedSceneEvents.map(event=>event.id));
    let searchCursor=e.personSearch.history.length;
    const reactions = new Map([...e.world.persons.values()].filter(p => !p.isPlayer).map(p => [p.id, p.incapacitated > 0 ? "incapacitated" : e.npcBrain.active.get(p.id)?.action ?? ""]));
    const guardModes = new Map(e.guards.guards.map(g => [g.def.id, g.incapacitated > 0 ? "incapacitated" : g.mode]));
    const collect = () => {
      for(const event of e.world.observedSceneEvents) if(!seenSceneEvents.has(event.id)) {run.trace.push({t:event.t,kind:"实际目击",text:event.text,data:event});seenSceneEvents.add(event.id);}
      for(const row of e.personSearch.history.slice(searchCursor)) {
        (run.searchHistory??=[]).push(structuredClone(row));
        run.trace.push({t:row.t,kind:row.state.phase==="confirmed"?"目标确认":row.state.phase==="lost"?"目标丢失":row.state.phase==="expired"?"寻找结束":row.state.phase==="acting"?"目标行动开始":row.state.phase==="finished"?"目标行动结束":"寻找目标",text:row.state.detail,data:row.state});
      }
      searchCursor=e.personSearch.history.length;
      for (const row of e.executor.lifecycle.slice(lifecycleCursor)) {
        run.steps.push(structuredClone(row));
        if (row.phase === "dialogue" && row.step.op === "talk") run.trace.push({ t: row.t, kind: "人物对话", text: `你对 ${row.step.npcId} 说：${row.step.message}`, data: row.step });
        const line = lifecycleText(row);
        if (line) run.trace.push({ t: row.t, ...line, data: row });
      }
      for (const g of e.guards.guards) {
        const state = g.incapacitated > 0 ? "incapacitated" : g.mode;
        if (guardModes.get(g.def.id) !== state) { note("保安实际反应", `${g.def.label}：${({ patrol: "巡逻", investigate: "前往调查", watch: "注视并靠近目标", return: "返回巡逻", incapacitated: "已失能，停止感知和行动" })[state]}`, { source: "simulator", id: g.def.id, mode: state, position: { ...g.pos } }); guardModes.set(g.def.id, state); }
      }
      lifecycleCursor = e.executor.lifecycle.length;
      for (const event of e.events.events.slice(eventCursor)) {
        const text = event.kind === "item_thrown" && event.trajectory ? `${event.itemId} 已实际抛出：(${event.trajectory.from.x},${event.trajectory.from.y}) → (${event.trajectory.to.x},${event.trajectory.to.y})，尚未落地`
          : event.kind === "item_dropped" && event.trajectory ? `${event.itemId} 已落地 (${event.pos.x},${event.pos.y})，声音半径${event.loudness}米；保安按感知反应`
          : event.kind === "report" ? `${event.actorId} 已向 ${event.targetId} 报告 ${event.aboutId ?? "现场情况"}，信息已实际传递`
          : event.kind === "facility_damaged" ? `${event.targetId} 已受损停用`
          : event.kind === "power_out" ? "区域实际断电，视距发生变化"
          : event.kind === "power_restored" ? "区域供电已恢复"
          : event.kind === "collision" ? `${event.actorId} 与 ${event.targetId ?? "现场物体"} 发生碰撞` : null;
        if (text) run.trace.push({ t: event.t, kind: "实际环境事件", text, data: event });
      }
      eventCursor = e.events.events.length;
      for (const p of e.world.persons.values()) {
        if (p.isPlayer) continue;
        const reaction = e.npcBrain.active.get(p.id)?.action ?? "";
        const state = p.incapacitated > 0 ? "incapacitated" : e.world.isRestrained(p.id) ? "restrained" : reaction;
        const old = reactions.get(p.id) ?? "";
        if (state !== old) {
          note("人物实际反应", state === "incapacitated" ? `${p.id} 已失能，暂时不能观察和行动` : state ? `${p.id}：${REACTIONS[state] ?? state}` : `${p.id} 结束${REACTIONS[old] ?? "先前反应"}`, { source: "simulator", id: p.id, reaction: state, position: { ...p.pos } });
          reactions.set(p.id, state);
        }
      }
      const q = queueFact(e);
      if (JSON.stringify(q) !== JSON.stringify(run.queues.at(-1)?.queue)) {
        run.queues.push({ t: e.t, queue: q });
        note("实际队列变化", q ? `你在 ${q.facility} 第${q.position}位，前面${q.ahead.length}人` : "你已不在队列中", q);
      }
      const frame = captureLabFrame(e), last = run.frames.at(-1)!;
      if (frame.t !== last.t || JSON.stringify(frame.action) !== JSON.stringify(last.action) || JSON.stringify(frame.actors) !== JSON.stringify(last.actors)) run.frames.push(frame);
    };
    let agent: LabAgent | null = null;
    let lastResult: ActionResult | null = null;
    try {
      this.changed();
      if (e.status !== "running") { run.state = "rejected"; run.summary = `本场景已结束：${e.failReason ?? "已到站台"}。请重置后测试。`; return; }
      if (mode === "model") {
        agent = await this.factory(instruction, e);
        if (!alive()) return;
        this.active = agent;
      }
      const searchingGoal=!!personQuery(instruction);
      for (let decision = 0; decision < (searchingGoal?64:6) && alive() && e.status === "running"; decision++) {
        run.summary = "角色正在选择行动…"; this.changed();
        const observation = e.observe();
        const search=searchingGoal?e.personSearch.next(instruction,observation):null;
        collect();
        if(search && !search.action) {run.state="partial";run.summary=search.state.detail;break;}
        const result: DecisionResult = search?.action ? {action:search.action,thinking:null,usage:null,model:null,latencyMs:0,error:null} : agent ? await agent.decide({ observation, triggers: [...e.takeTriggers(), { kind: "start", text: `只尝试本次输入：${instruction}` }], lastResult })
          : { action: offlineLabAction(instruction, observation), thinking: null, usage: null, model: null, latencyMs: 0, error: null };
        if (!alive()) return;
        if (!result.action || result.error) { run.state = "error"; run.summary = result.error ?? "模型未返回可执行行动，未改成离线保底。"; note("模型", run.summary, { model: result.model, usage: result.usage }); break; }
        let action = result.action;
        note(search?search.preparatory?"目标准备（程序）":"恢复原目标（程序）":"角色选择", `${action.type}：${action.reason}`, { action, model: result.model, usage: result.usage, latencyMs: result.latencyMs });
        note("角色实际提交", action.type === "act" ? action.instruction : describeAction(action), action);
        const needsPlan = action.type === "act" || ["talk", "physical_action"].includes(action.type) && (extractRequirements(instruction).length > 1 || !!explicitPhysicalIntent(instruction));
        if (needsPlan) {
          if (action.type !== "act" || action.instruction !== instruction) note("原文保留", "解释器使用完整原始输入；角色提交内容保留在上一项供比较，没有用简短理由替代执行指令。", { original: instruction, submitted: action });
          action = { type: "act", instruction, reason: action.reason };
        }
        let plan: ActionPlan | undefined;
        let originalPlan: ActionPlan | undefined;
        const path = { role: structuredClone(result.action), instruction, changes: [] as string[], requirements: [] as Requirement[], originalPlan, finalPlan: plan,source:search?"program" as const:mode,stage:search?.preparatory?"preparation" as const:"execution" as const };
        if(!search?.preparatory || !run.paths?.length) (run.paths ??= []).push(path);
        if (action.type === "act") {
          plan = agent ? await agent.interpret(action.instruction, buildIntentContext(e.world, e.guards)) : parsePlan(action.instruction, buildIntentContext(e.world, e.guards));
          if (!alive()) return;
          note("环境解释", `${plan.source === "llm" ? "模型" : "关键词"} · ${plan.status} · ${plan.reason || plan.summary}`, plan);
          path.originalPlan = { ...structuredClone(plan), steps: structuredClone(plan.translation?.originalSteps ?? plan.steps),status:plan.translation?.originalStatus??plan.status,reason:plan.translation?.originalReason??plan.reason,summary:plan.translation?.originalSummary??plan.summary,source:plan.translation?.originalSource??plan.source };
          if(path.originalPlan.status!==plan.status||path.originalPlan.reason!==plan.reason) note("解释器原输出",`${path.originalPlan.status}：${path.originalPlan.reason||path.originalPlan.summary}`,path.originalPlan);
          const checked = reconcileInstruction(instruction, plan, buildIntentContext(e.world, e.guards));
          path.changes = [...(plan.translation?.changes ?? []), ...checked.changes]; plan = checked.plan;
          path.requirements = checked.requirements; path.finalPlan = structuredClone(plan);
          note("计划核对与修正", path.changes.length ? path.changes.join("；") : "没有触发自动修正；覆盖情况仍需逐项核对。", path);
          const missing = path.requirements.filter(r=>r.state!=="covered");
          if (missing.length) note("缺失或待核对要求", missing.map(r=>`${r.text}：${r.explanation}`).join("；"), missing);
          if (plan.status !== "plan") { run.state = "rejected"; run.summary = `${plan.status === "unsupported" ? "机制或当前解释器未支持" : "缺少前置条件"}：${plan.reason}`; break; }
        }
        if (!path.requirements.length) path.requirements = auditInstruction(instruction, action.type === "physical_action" ? physicalActionPlan(action).steps : [], action);
        if(search?.preparatory) path.requirements=path.requirements.map(r=>({...r,state:"unverified",explanation:"原要求已保留，当前正在寻找目标，确认后继续执行；不是动作遗漏"}));
        if (action.type === "physical_action") note("独立动作计划", "台词与肢体动作分别传递并按序结算。", physicalActionPlan(action));
        const applied = e.applyAction(action, action.type === "attempt_creative" ? classifyByKeywords(action.intent).mechanic : undefined, plan);
        run.requests.push({ t: e.t, action: structuredClone(action), result: structuredClone(applied) });
        lastResult = applied;
        note("规则校验", `${applied.ok ? "允许开始尝试" : "未受理"}：${applied.text}`);
        if (!applied.ok) { run.state = "rejected"; run.summary = applied.text; break; }
        if(search && !search.preparatory) e.personSearch.markDispatched();
        const usesExecutor = ["act", "physical_action", "talk", "take", "give", "drop"].includes(action.type);
        if (!usesExecutor) note("操作开始", describeAction(action));
        collect();
        const started = e.t;
        run.summary = search?.preparatory ? "正在寻找符合描述的人；尚未开始原指令中的实际动作" : "已受理，正在执行与观察现场…";
        for (let ticks = 0; ticks < 600 && alive() && e.status === "running"; ticks++) {
          const pending = e.executor.pendingDialogue;
          if (pending) {
            const request = structuredClone(pending.request);
            const response = agent ? await agent.respond(request) : offlineNpcResponse(request);
            if (!alive()) return;
            note("人物台词", `${request.npc.id}：“${response.reply}”（${response.source === "llm" ? "模型" : response.source === "offline" ? "离线性格规则" : "调用错误"}）`, { ...response, note: "台词不是已经发生的位移或物品转移" });
            if (response.source === "error") { e.dialogue.cancel(); e.executor.cancel("人物模型调用失败"); collect(); run.state = "error"; run.summary = response.reason; break; }
            const transferCount = e.world.items.transfers.length;
            lastResult = e.dialogue.apply(response);
            const moved = e.world.items.transfers.slice(transferCount);
            const decisions = { accept: "对方同意", refuse: "对方拒绝", counter: "对方提出条件", comply_under_threat: "对方选择屈服", flee: "对方选择逃离", call_guard: "对方选择求助" };
            const delivery = moved.length ? moved.map(t => `${ITEM_DEFS[t.kind].label}：${t.from} → ${t.to}`).join("；") : "未发生物品交付";
            const yielding = ["yield", "bribe"].includes(request.goal) ? e.world.cutInReservations.has("player") ? "让位移动已开始，尚未到位" : "未确认队列让位" : "";
            note("对话结果", !lastResult.ok ? `回复未能执行：${lastResult.text}；${delivery}` : [decisions[response.decision], delivery, yielding].filter(Boolean).join("；"), { decision: response.decision, execution: lastResult, transfers: moved });
            collect();
          }
          const flying=[...e.world.items.items.values()].some(i=>i.location.type === "flight");
          if (ticks > 0 && !flying && !e.executor.busy && !e.executor.pendingDialogue && (["idle", "done"].includes(e.player.activity.kind) || usesExecutor && ["queued", "escalator_queue"].includes(e.player.activity.kind))) break;
          if (action.type === "wait" && e.t - started >= action.seconds - .001) break;
          e.step();
          collect();
          if(search?.preparatory && ["confirmed","expired"].includes(e.observe().targetSearch?.phase??"")) {collect();break;}
          if (ticks % 5 === 0) { this.changed(); await this.yieldFrame(); }
        }
        if (!alive()) return;
        if (e.executor.outcomes.length && ["act", "physical_action", "talk", "take", "give", "drop"].includes(action.type)) {
          if (e.executor.outcomes.some(o => !o.ok)) { run.state = "partial"; run.summary = "行动失败或中断；请查看具体步骤和实际变化。"; }
        }
        if (!usesExecutor) note("操作结束", `世界推进 ${(e.t - started).toFixed(1)} 秒；${e.player.activity.kind === "idle" ? "当前操作已停止" : `当前状态：${e.player.activity.kind}`}`);
        if (run.state === "error") break;
        if (e.status !== "running") { run.summary = e.failReason ?? "已实际到达站台。"; break; }
        if (run.state === "partial") break;
        if (e.t - started >= 600 * DT - .2 && (e.executor.busy || !["idle", "done"].includes(e.player.activity.kind))) {
          run.state = "partial"; run.summary = "已推进 60 秒，本次暂停，行动尚未完成；可继续观察或重置。"; break;
        }
        const preparatory = !!search?.preparatory || ["move_to", "observe"].includes(action.type) && !/^(?:走到|前往|移动到|观察|查看|靠近)/.test(instruction);
        if(search?.preparatory) {run.summary="正在观察并寻找目标，原行动尚待目标确认";continue;}
        if (preparatory && decision < 5) continue;
        run.summary = preparatory ? "已达本次 6 次决策上限；未声称意图完成。" : "本次操作已结束，目标是否达成请核对下方真实变化。";
        if (preparatory) run.state = "partial";
        break;
      }
      if (run.state === "running") run.state = "finished";
    } catch (error) {
      if (alive()) {
        if (e.executor.pendingDialogue) { e.dialogue.cancel(); e.executor.cancel("模型调用失败，本次对话中断"); }
        run.state = "error"; run.summary = error instanceof Error ? error.message : String(error); note("调用错误", run.summary);
      }
    } finally {
      if (alive()) {
        run.after = snapshot(e);
        run.assessment = assessRun(run);
        if (run.state === "finished") run.summary = run.assessment.summary;
        this.busy = false; this.active = null;
        this.changed();
      }
      if (agent) await agent.dispose().catch(() => undefined);
    }
  }
}
