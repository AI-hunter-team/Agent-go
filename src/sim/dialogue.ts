import type { CutInDialogueRequest } from "../shared/types";
import type { World } from "./world";
import { dist } from "./geometry";
import { findPath } from "./nav";
import { playerCanSee } from "./observation";
import { PROFILES, RULES } from "./scenario";
import { temperamentDescription } from "./persona";
import type { ActionResult, NpcDialogueRequest, NpcResponse, PlanStep } from "../shared/types";
import type { AlertSystem } from "./alert";
import type { EventBus } from "./events";
import type { NpcBrain } from "./npcBrain";
import { ITEM_DEFS } from "./content/items";
export type TalkStep = Extract<PlanStep, {
  op: "talk";
}>;
export interface PendingDialogue {
  request: NpcDialogueRequest;
  step: TalkStep;
  eventId: string;
}
export class DialogueSystem {
  pendingDialogue: PendingDialogue | null = null;
  readonly history = new Map<string, NpcDialogueRequest["history"]>();
  onYield: ((npcId: string) => ActionResult) | null = null;
  validateYield: ((npcId: string) => string | null) | null = null;
  onComplete: ((result: ActionResult) => void) | null = null;
  constructor(private world: World, private bus: EventBus, private alerts: AlertSystem, private brain: NpcBrain) {}
  validate(step: TalkStep, requireReach = true): string | null {
    const p = this.world.player,
      npc = this.world.persons.get(step.npcId);
    if (!p || p.incapacitated || ["service", "stairs", "done", "creative"].includes(p.activity.kind)) return "当前不能对话";
    if (!p || !npc?.persona || npc.isPlayer || npc.incapacitated) return "对话对象不存在或无法回应";
    if (!step.message.trim() || [...step.message].length > 200) return "对话需要 1–200 字";
    if ((this.history.get(npc.id)?.length ?? 0) >= 3) return "与这位乘客的三轮对话已结束";
    if (requireReach && (dist(p.pos, npc.pos) > 3 || !playerCanSee(p.pos, npc.pos, this.world.lightAt) || !findPath(p.pos, npc.pos))) return "请到可见可达的乘客 3 米内对话";
    if (step.offerItemId && !this.world.items.holdings(p.id).some(i => i.id === step.offerItemId)) return "没有持有提议交换的物品";
    if ((step.goal === "trade" || step.goal === "bribe") && !step.offerItemId) return "交换或贿赂需要实际物品";
    if (step.goal === "yield") {
      const q = this.world.queuePosition(npc);
      if (!q || q.facility.status !== "open") return "对方未在开放的队列中";
      const mine = this.world.queuePosition(p);
      if (mine?.facility === q.facility && mine.index <= q.index) return "对方在你后面，无需请求让位";
    }
    return null;
  }
  begin(step: TalkStep): ActionResult {
    if (this.pendingDialogue) return {
      ok: false,
      text: "有对话正在等待回复"
    };
    const error = this.validate(step);
    if (error) return {
      ok: false,
      text: error
    };
    const p = this.world.player!,
      npc = this.world.persons.get(step.npcId)!,
      persona = npc.persona!,
      q = this.world.queuePosition(npc);
    const event = this.bus.emit({
      t: this.world.t,
      kind: step.goal === "threaten" ? "threaten" : "odd_behaviour",
      severity: step.goal === "threaten" ? "danger" : "odd",
      actorId: p.id,
      targetId: npc.id,
      pos: {
        ...p.pos
      },
      loudness: step.goal === "threaten" ? 5 : 2
    });
    // Only an actual threat is ongoing; ordinary conversation creates no alert.
    if (step.goal === "threaten") this.bus.beginAct({
      actorId: p.id,
      kind: event.kind,
      severity: event.severity,
      targetId: npc.id,
      eventId: event.id
    });
    const alert = this.alerts.get(npc.id, p.id);
    const offer = step.offerItemId ? this.world.items.items.get(step.offerItemId)!.kind : null;
    this.pendingDialogue = {
      step: structuredClone(step),
      eventId: event.id,
      request: {
        npc: {
          id: npc.id,
          look: structuredClone(persona.look),
          traits: {
            ...persona.traits
          },
          situation: {
            ...persona.situation
          },
          alert: {
            level: alert?.level ?? "none",
            cause: alert?.causeEventId ?? null
          },
          memory: (this.brain.memory.get(npc.id) ?? []).filter(m => m.about === p.id).map(m => m.text),
          holdings: this.world.items.holdings(npc.id).filter(i => !i.used).map(i => i.kind),
          queue: q ? {
            facility: q.facility.def.id,
            position: q.index + 1,
            length: q.facility.queue.length
          } : null
        },
        speaker: {
          look: "赶路的乘客",
          holding: this.world.items.holdings(p.id).filter(i => this.world.items.slot(i) === "hand" && ITEM_DEFS[i.kind].visibleWhenHeld).map(i => i.kind)
        },
        goal: step.goal,
        message: step.message,
        offer,
        history: structuredClone(this.history.get(npc.id) ?? [])
      }
    };
    return {
      ok: true,
      text: "等待乘客回复"
    };
  }
  apply(response: NpcResponse): ActionResult {
    const pending = this.pendingDialogue;
    if (!pending) return {
      ok: false,
      text: "没有待处理对话"
    };
    const {
        step
      } = pending,
      npc = this.world.persons.get(step.npcId),
      p = this.world.player!;
    let error = this.validate(step),
      result: ActionResult = {
        ok: true,
        text: typeof response?.reply === "string" ? [...response.reply].slice(0, 80).join("") : "无有效回复"
      };
    if (!response || !["accept", "refuse", "counter", "comply_under_threat", "flee", "call_guard"].includes(response.decision) || typeof response.reply !== "string") error = "无效的对话回复";
    const accepted = response && (response.decision === "accept" || response.decision === "comply_under_threat");
    if (response?.decision === "comply_under_threat" && step.goal !== "threaten") error = "当前对话不包含威胁";
    if (!error && npc && accepted) {
      const give = response.give ? this.world.items.holdings(npc.id).find(i => i.kind === response.give && !i.used) : undefined;
      if (response.give && !give) error = "对方没有持有回复中承诺的物品";
      if (step.goal === "ask_ticket" && response.give !== "ticket") error = "索票回复未包含真实车票";
      if (["chat", "yield", "persuade"].includes(step.goal) && response.give) error = "这次对话目标不包含物品交付";
      if (step.goal === "trade" && !give) error = "交换必须包含对方的实际物品";
      if (step.goal === "yield" || step.goal === "bribe" && !give) error = error ?? this.validateYield?.(npc.id) ?? null;
      if (!error) {
        const offer = step.offerItemId ? this.world.items.items.get(step.offerItemId) : undefined;
        const moves = [...(offer ? [{
          itemId: offer.id,
          to: this.world.items.preferredLocation(offer, npc.id, give ? [give.id] : [])
        }] : []), ...(give ? [{
          itemId: give.id,
          to: this.world.items.preferredLocation(give, p.id, offer ? [offer.id] : [])
        }] : [])];
        const moved = this.world.items.moveMany(moves, "dialogue");
        if (!moved.ok) error = moved.text;else for (const move of moves) this.world.items.items.get(move.itemId)!.ownerId = move.to.personId;
        if (!error && (step.goal === "yield" || step.goal === "bribe" && !give)) result = this.onYield?.(npc.id) ?? {
          ok: false,
          text: "让位执行器未接入"
        };
      }
    }
    if (!error && npc && (response.decision === "flee" || response.decision === "call_guard")) {
      const record = this.alerts.raiseNpc(npc.id, p.id, pending.eventId);
      if (record) this.brain.react(npc, p, record, p.pos, response.decision === "flee" ? "flee" : "report");
    }
    if (error) result = {
      ok: false,
      text: error
    };
    const effectPending = !error && result.ok && !!accepted && (step.goal === "yield" || step.goal === "bribe" && !response.give);
    result.dialogue = {
      npcId: step.npcId,
      goal: step.goal,
      message: step.message,
      reply: typeof response?.reply === "string" ? response.reply : "无有效回复",
      decision: response?.decision ?? "refuse",
      goalAchieved: !error && result.ok && !!accepted && !effectPending,
      ...(effectPending ? { effectPending: true } : {}),
    };
    const history = this.history.get(step.npcId) ?? [];
    history.push({
      message: step.message,
      reply: result.text,
      decision: error ? "refuse" : response.decision
    });
    this.history.set(step.npcId, history);
    this.brain.remember(step.npcId, {
      t: this.world.t,
      about: p.id,
      kind: "dialogue",
      text: result.text,
      eventId: pending.eventId
    });
    this.bus.endAct(p.id);
    this.pendingDialogue = null;
    this.world.log("speech", `${step.npcId}：${result.text}`, true);
    this.onComplete?.(result);
    return result;
  }
  cancel() {
    if (this.pendingDialogue) this.bus.endAct(this.world.player!.id);
    this.pendingDialogue = null;
  }
}
export function offlineNpcResponse(request: NpcDialogueRequest): NpcResponse {
  const traits = request.npc.traits;
  const accept = request.goal === "chat" || request.goal === "trade" && request.offer !== null || request.goal === "yield" && request.npc.situation.hurry < .5 && traits.fairness < .7 || request.goal === "ask_ticket" && traits.vanity > .75 && request.npc.situation.hurry < .4;
  const threatened = request.goal === "threaten" && traits.courage < .4;
  const give = (request.goal === "ask_ticket" || request.goal === "trade" || threatened) && request.npc.holdings.includes("ticket") ? "ticket" : null;
  return {
    reply: accept ? "可以，请尽快。" : threatened ? "拿去，别靠近。" : "不行，我也需要赶路。",
    decision: threatened ? "comply_under_threat" : accept ? "accept" : "refuse",
    give,
    want: null,
    reason: "离线性格判断",
    source: "offline"
  };
}
export function prepareCutIn(world: World, npcId: string, message: string, history: CutInDialogueRequest["history"]): {
  ok: true;
  request: CutInDialogueRequest;
} | {
  ok: false;
  text: string;
} {
  const p = world.player;
  if (!p || p.incapacitated || ["service", "creative", "acting", "stairs", "done"].includes(p.activity.kind)) return {
    ok: false,
    text: "当前行动未完成，不能沟通插队"
  };
  if (!message.trim() || [...message].length > 200) return {
    ok: false,
    text: "请提供 1–200 字的具体插队请求"
  };
  if (history.length >= 3) return {
    ok: false,
    text: "与这位乘客的三轮沟通已结束，请选择其他行动"
  };
  const npc = world.persons.get(npcId);
  const q = npc && !npc.isPlayer ? world.queuePosition(npc) : null;
  if (!npc || !q || q.facility.status !== "open") return {
    ok: false,
    text: "这位乘客当前没有在开放的设施排队"
  };
  if (dist(p.pos, npc.pos) > RULES.cutInDistance || !playerCanSee(p.pos, npc.pos, world.lightAt) || !findPath(p.pos, npc.pos)) {
    return {
      ok: false,
      text: `请先走到可见且可达的乘客附近（${RULES.cutInDistance} 米内）再沟通`
    };
  }
  const mine = world.queuePosition(p);
  if (mine?.facility === q.facility && mine.index <= q.index) return {
    ok: false,
    text: "这位乘客在你后面，无需向他请求插队"
  };
  const temperament = npc.persona ? temperamentDescription(npc.persona) : npc.irritable ? "急躁，重视排队公平；不会因为礼貌措辞就轻易让位" : npc.kind === "hurried" ? "自己也赶时间，会权衡对方的紧急程度和自己的损失" : npc.kind === "elderly" ? "谨慎，重视秩序与安全，也会体谅合理的紧急情况" : "平和，愿意听解释，但有边界，也在意排队公平";
  return {
    ok: true,
    request: {
      npc: {
        id: npc.id,
        trait: PROFILES[npc.kind].trait ?? "普通乘客",
        temperament,
        facility: q.facility.def.id,
        queuePosition: q.index + 1,
        queueLength: q.facility.queue.length
      },
      message,
      history: structuredClone(history)
    }
  };
}
