import type { ActionPlan, ActionResult, EntityRef, Item, ItemLocation, PlanStep, StepOutcome, Vec, WorldEvent } from "../../shared/types";
import type { AlertSystem } from "../alert";
import { ITEM_DEFS } from "../content/items";
import type { DialogueSystem } from "../dialogue";
import type { EventBus } from "../events";
import { angleDiff, angleTo, dist, lineOfSight } from "../geometry";
import type { GuardSystem } from "../guards";
import { STAIRS_REACH, STAIRS_SECONDS } from "../layout";
import { personRadius } from "../movement";

import type { NpcBrain } from "../npcBrain";
import { playerCanSee } from "../observation";
import { DT, RULES } from "../scenario";
import type { Person, World } from "../world";
import { contest } from "./contest";
import { isPlanStep, PRIMITIVES } from "./primitives";
interface Current {
  step: PlanStep;
  phase: "approach" | "perform" | "dialogue";
  remaining: number;
  duration: number;
  elapsed: number;
  path: Vec[];
  eventIds: string[];
  ready: boolean;
  dest?: Vec;
  blocked?: boolean;
}
export interface ExecutorContext {
  world: World;
  guards: GuardSystem;
  bus: EventBus;
  alerts: AlertSystem;
  brain: NpcBrain;
  dialogue: DialogueSystem;
}
export class ActionExecutor {
  outcomes: StepOutcome[] = [];
  /** Reports the actual settlement of a consented move, including interruptions. */
  onConsentComplete: ((npcId: string, result: ActionResult) => void) | null = null;
  private queue: PlanStep[] = [];
  private current: Current | null = null;
  private rng;
  private keepQueue = false;
  private traversal: Extract<Person["activity"], { kind: "stairs" | "escalator" }> | null = null;
  private consent: {
    npcId: string;
    facility: string;
    remaining: number;
    ready: boolean;
  } | null = null;
  constructor(readonly context: ExecutorContext) {
    this.rng = context.world.rng.fork("contest");
    context.dialogue.onYield = id => this.startConsentedCutIn(id);
    context.dialogue.validateYield = id => this.validateConsent(id);
    context.dialogue.onComplete = result => {
      if (this.current?.phase !== "dialogue") return;
      this.outcomes.push({
        ...result,
        eventIds: [...this.current.eventIds]
      });
      this.current = null;
      if (!result.ok) this.queue = [];
      if (!this.consent) this.resetActivity();
    };
    context.brain.reclaim = (npc, subject) => this.reclaim(npc, subject);
  }
  get busy() {
    return Boolean(this.current || this.queue.length || this.consent);
  }
  get pendingDialogue() {
    return this.context.dialogue.pendingDialogue;
  }
  get action() {
    const a = this.current;
    return a ? {
      op: a.step.op,
      progress: a.phase === "perform" ? Math.min(1, 1 - a.remaining / Math.max(.1, a.duration)) : 0
    } : null;
  }
  start(plan: ActionPlan): ActionResult {
    const p = this.context.world.player;
    if (!p || this.busy || this.pendingDialogue || p.incapacitated || ["entering", "service", "done"].includes(p.activity.kind) || (["stairs", "escalator"].includes(p.activity.kind) && !(p.activity.kind === "escalator" && plan?.steps?.length === 1 && plan.steps[0].op === "vault" && plan.steps[0].obstacle === "escalator_side"))) return {
      ok: false,
      text: "当前行动尚未完成或无法行动"
    };
    if (!plan || plan.status !== "plan" || typeof plan.summary !== "string" || [...plan.summary].length > 60 || !["llm", "keywords"].includes(plan.source) || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 4 || !plan.steps.every(isPlanStep)) return {
      ok: false,
      text: typeof plan?.reason === "string" && plan.reason ? plan.reason : "计划必须包含 1–4 个合法步骤"
    };
    this.queue = structuredClone(plan.steps);
    const first = this.railingLead(this.queue.shift()!),
      error = this.validate(first, false);
    if (error) {
      this.queue = [];
      return {
        ok: false,
        text: error
      };
    }
    this.queue.unshift(first);
    this.context.world.finishAttention(p, "转向行动");
    this.traversal = p.activity.kind === "escalator" ? structuredClone(p.activity) : null;
    this.outcomes = [];
    this.next();
    return {
      ok: true,
      text: plan.summary || "开始执行行动计划"
    };
  }
  private next() {
    const queued = this.queue.shift();
    if (!queued) {
      this.resetActivity();
      return;
    }
    const step = this.railingLead(queued);
    const error = this.validate(step, false);
    if (error) {
      this.fail(error);
      return;
    }
    const p = this.context.world.player!;
    const point = this.target(step);
    this.keepQueue = this.isQueuing(p) && (step.op === "wait" || step.op === "talk" && !!point && this.inRange(step, point));
    if (!this.keepQueue) this.context.world.removeFromQueue(p);
    this.current = {
      step,
      phase: "approach",
      remaining: 0,
      duration: 0,
      elapsed: 0,
      path: [],
      eventIds: [],
      ready: false
    };
    this.setActivity(step.op, 0);
    this.prepare();
  }
  step() {
    const {
        world
      } = this.context,
      p = world.player!;
    if (this.consent) {
      this.stepConsent();
      return;
    }
    if (!this.current) {
      if (this.queue.length) this.next();
      return;
    }
    const a = this.current;
    if (this.keepQueue && a.step.op === "wait" && ["service", "escalator", "done"].includes(p.activity.kind)) {
      this.finishQueueWait(a);
      return;
    }
    if (p.incapacitated || !["acting", "creative"].includes(p.activity.kind) && !(this.keepQueue && this.isQueuing(p))) {
      this.cancel("行动被打断");
      return;
    }
    if (a.phase === "dialogue") return;
    a.elapsed += DT;
    const error = this.validate(a.step, a.phase === "perform");
    if (error) {
      this.fail(error);
      return;
    }
    if (a.phase === "approach") {
      if (a.elapsed > 30) {
        this.fail("接近目标超时，行动中断");
        return;
      }
      const point = this.target(a.step);
      if (!point || this.inRange(a.step, point)) {
        this.prepare();
        return;
      }
      if (!a.path.length || dist(a.path.at(-1)!, point) > .5) a.path = this.context.world.navigation.findPath(p.pos, point, personRadius(p.kind)) ?? [];
      if (!a.path.length) {
        this.fail("目标不可到达");
        return;
      }
      if (world.movePerson(p, a.path[0], p.speed * DT)) a.path.shift();
      if (this.inRange(a.step, point)) this.prepare();
      return;
    }
    a.remaining = Math.max(0, a.remaining - DT);
    if ((a.step.op === "vault" || a.step.op === "slide_handrail") && a.dest) {
      const fraction = Math.min(1, DT / Math.max(DT, a.remaining + DT));
      const next = { x: p.pos.x + (a.dest.x - p.pos.x) * fraction, y: p.pos.y + (a.dest.y - p.pos.y) * fraction };
      if (!this.context.world.spatial.clearOfPeople(p.pos, next, personRadius(p.kind), world.collisionBodies(p.id))) {
    if (a.step.op === "vault" && a.step.obstacle === "escalator_side") {
          const target=world.collisionBodies(p.id).find(b=>!this.context.world.spatial.clearOfPeople(p.pos,next,personRadius(p.kind),[b]));
          const event=this.emit(a,{kind:"collision",severity:"affecting",targetId:target?.id,loudness:4,causeId:a.eventIds[0]});
          this.context.bus.beginAct({actorId:p.id,kind:event.kind,severity:event.severity,eventId:event.id,targetId:event.targetId});
          a.blocked=true;a.ready=true;
        } else a.remaining += DT;
        return;
      }
      p.pos = world.definition.generatorVersion!=="legacy-v0"&&a.step.op==="slide_handrail"?{...next,floorId:"transit:stairs",elevation:-6*(1-a.remaining/a.duration)}:next;
    }
    if (a.step.op === "force_cut_in") {
      const npc = world.persons.get(a.step.npcId)!,
        q = world.queuePosition(npc)!;
      a.dest = world.cutInPoint(p, q.facility);
      world.movePerson(p, a.dest, p.speed * DT);
    }
    this.setActivity(a.step.op, Math.min(1, 1 - a.remaining / Math.max(a.duration, .1)));
    a.ready = a.remaining <= 1e-9 && (a.step.op !== "force_cut_in" || Boolean(a.dest && dist(p.pos, a.dest) < .05));
    if (a.elapsed > 35) this.fail("持续行动受阻，中断");
  }
  /** Called after perception, so the final frame of a violation can still be seen. */
  finishFrame() {
    if (this.consent?.ready) {
      this.finishConsent();
      return;
    }
    const a = this.current;
    if (a && this.keepQueue && a.step.op === "wait" && ["service", "escalator", "done"].includes(this.context.world.player!.activity.kind)) {
      this.finishQueueWait(a);
      return;
    }
    if (!a?.ready) return;
    if (a.blocked) { this.fail("翻出时与他人碰撞，继续乘扶梯"); return; }
    const error = this.validate(a.step, true);
    if (error) {
      this.fail(error);
      return;
    }
    const result = this.settle(a);
    this.context.bus.endAct(this.context.world.player!.id);
    this.outcomes.push({
      ...result,
      eventIds: [...a.eventIds]
    });
    this.current = null;
    if (!result.ok) this.queue = [];
    if (!this.queue.length) this.context.world.notifyPlayer(result.ok ? "creative_done" : "action_failed", result.text);
    this.resetActivity();
  }
  cancel(reason = "行动被打断") {
    this.context.dialogue.cancel();
    this.fail(reason);
  }
  private fail(text: string) {
    const consent = this.consent;
    const interrupted = this.current?.step;
    this.outcomes.push({
      ok: false,
      text,
      eventIds: this.current?.eventIds.slice() ?? []
    });
    this.context.bus.endAct(this.context.world.player!.id);
    this.current = null;
    this.queue = [];
    this.consent = null;
    this.context.world.cutInReservations.delete(this.context.world.player!.id);
    this.resetActivity();
    if (this.traversal) {
      const p = this.context.world.player!, a = this.traversal;
      p.pos.y = a.kind === "escalator" ? this.context.world.layout.ESCALATOR_TOP.y : a.start.y;
      p.activity = { ...a };
      this.traversal = null;
    }
    if (interrupted?.op === "slide_handrail") {
      const p=this.context.world.player!;
      const duration=Math.max(.1,Math.hypot(this.context.world.layout.STAIRS_BOTTOM.x-p.pos.x,this.context.world.layout.STAIRS_BOTTOM.y-p.pos.y)/Math.hypot(this.context.world.layout.STAIRS_BOTTOM.x-this.context.world.layout.STAIRS_TOP.x,this.context.world.layout.STAIRS_BOTTOM.y-this.context.world.layout.STAIRS_TOP.y)*STAIRS_SECONDS);
      p.activity={kind:"stairs",remaining:duration,duration,start:{...p.pos},end:this.context.world.layout.STAIRS_BOTTOM};
    }
    this.context.world.notifyPlayer("action_interrupted", text);
    if (consent) this.onConsentComplete?.(consent.npcId, { ok: false, text });
  }
  private resetActivity() {
    const p = this.context.world.player!;
    this.keepQueue = false;
    if (["acting", "creative"].includes(p.activity.kind)) p.activity = {
      kind: "idle"
    };
  }
  private finishQueueWait(a: Current) {
    const suffix = this.queue.length ? "；后续步骤未执行" : "";
    this.outcomes.push({ ok: true, text: `已开始办理或乘梯，等待结束${suffix}`, eventIds: [...a.eventIds] });
    this.current = null;
    this.queue = [];
    this.keepQueue = false;
  }
  private setActivity(op: string, progress: number) {
    const p = this.context.world.player!;
    if (this.keepQueue && this.isQueuing(p)) return;
    if (p.activity.kind === "creative") {
      p.activity.remaining = this.current?.remaining ?? 0;
      return;
    }
    p.activity = {
      kind: "acting",
      op,
      progress
    };
  }
  private isQueuing(p: Person): boolean {
    if (p.activity.kind === "queued") return Boolean(this.context.world.queuePosition(p));
    if (p.activity.kind === "to_queue") return this.context.world.facility(p.activity.facility)?.status === "open";
    if (p.activity.kind === "to_escalator" || p.activity.kind === "escalator_queue") return this.context.world.transit.queue.includes(p.id);
    return false;
  }
  /**
   * A railing vault always starts beside a low segment on the hall side. When the
   * player is elsewhere in the hall, walk to the nearest segment first; an approach
   * that cannot reach the hall side (e.g. a concourse node) is replaced by that walk.
   * Re-queues the vault and returns the step to run now.
   */
  private railingLead(step: PlanStep): PlanStep {
    const p = this.context.world.player!,
      isRailingVault = (s?: PlanStep) => s?.op === "vault" && s.obstacle === "railing";
    if (step.op === "approach" && isRailingVault(this.queue[0])) {
      const point = this.target(step);
      if (!point || !this.context.world.navigation.findPath(p.pos, point)) step = this.queue.shift()!;
    }
    if (!isRailingVault(step) || this.context.world.layout.zoneOf(p.pos)!=="hall" || this.context.world.layout.atRailing(p.pos)) return step;
    const spot = this.context.world.layout.RAILING_APPROACHES.filter(r => dist(p.pos, r.pos) > 1 && this.context.world.navigation.findPath(p.pos, r.pos)).sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
    if (!spot) return step;
    this.queue.unshift(step);
    return {
      op: "approach",
      target: {
        kind: "node",
        id: spot.id
      }
    };
  }
  private target(step: PlanStep): Vec | null {
    const w = this.context.world;
    switch (step.op) {
      case "approach":
        return this.resolveRef(step.target);
      case "take":
        {
          const i = w.items.items.get(step.itemId);
          return i ? w.items.position(i) : null;
        }
      case "give":
        return this.person(step.toId)?.pos ?? null;
      case "talk":
      case "snatch":
      case "push":
      case "strike":
        if ("facilityId" in step) return w.facility(step.facilityId)?.def.head ?? null;
        return this.person(step.npcId)?.pos ?? null;
      case "force_cut_in":
        return this.person(step.npcId)?.pos ?? null;
      default:
        return null;
    }
  }
  resolveRef(ref: EntityRef): Vec | null {
    const w = this.context.world;
    if (ref.kind === "person") return this.person(ref.id)?.pos ?? null;
    if (ref.kind === "item") {
      const i = w.items.items.get(ref.id);
      return i ? w.items.position(i) : null;
    }
    if (ref.kind === "node") return this.context.world.layout.NAV_NODES.find(n => n.id === ref.id)?.pos ?? null;
    if (ref.kind === "spot") return this.context.world.layout.ITEM_SPOTS.find(s => s.id === ref.id)?.pos ?? null;
    return w.facility(ref.id)?.def.head ?? null;
  }
  private person(id: string) {
    return this.context.world.persons.get(id) ?? this.context.guards.guards.find(g => g.def.id === id);
  }
  private inRange(step: PlanStep, point: Vec) {
    return dist(this.context.world.player!.pos, point) <= (step.op === "talk" ? 3 : step.op === "approach" ? 1 : 1.6);
  }
  private held(id: string) {
    const i = this.context.world.items.items.get(id);
    return i && this.context.world.items.holderId(i) === "player" ? i : null;
  }
  private slot(item: Item, personId: string): ItemLocation {
    return this.context.world.items.preferredLocation(item, personId);
  }
  private validate(step: PlanStep, settling: boolean): string | null {
    const {
        world: w,
        brain
      } = this.context,
      p = w.player!;
    if (p.incapacitated) return "无法行动";
    const point = this.target(step);
    if (["approach", "take", "give", "talk", "snatch", "push", "strike", "force_cut_in"].includes(step.op)) {
      if (!point) return "目标不存在";
      const known = step.op === "approach" && ["node", "facility", "spot"].includes(step.target.kind);
      if (!known && !playerCanSee(p.pos, point, w.lightAt, w.layout)) return "目标已不可见";
      if (!this.context.world.navigation.findPath(p.pos, point)) return "目标不可步行到达";
      if (settling && !this.inRange(step, point)) return "目标离开可及范围，行动中断";
    }
    if ("npcId" in step || step.op === "give") {
      const id = step.op === "give" ? step.toId : step.npcId,
        target = this.person(id);
      if (id === p.id) return "不能以自己为目标";
      if (!target || target.incapacitated) return "对象不存在或已失能";
    }
    if (step.op === "take") {
      const item = w.items.items.get(step.itemId)!;
      if (item.location.type === "spot" && item.location.spotId.startsWith("confiscated-")) return "安检保管物品不能自行取回";
      if (item.used || !["ground", "spot"].includes(item.location.type)) return "只能拿取地面或取物点的未使用物品";
      if (!w.items.canMove(item.id, this.slot(item, p.id))) return "没有可用持物槽位";
    }
    if (step.op === "give" || step.op === "drop") {
      const item = this.held(step.itemId);
      if (!item) return "没有持有该物品";
      if (step.op === "give" && (!w.persons.has(step.toId) || !w.items.canMove(item.id, this.slot(item, step.toId)))) return "对方无法接收物品";
      if (step.op === "drop" && step.at) {
        const at = this.resolveRef(step.at);
        if (!at || !playerCanSee(p.pos, at, w.lightAt, w.layout) || dist(p.pos, at) > (step.mode === "throw" ? 6 : 1.6) || !lineOfSight(p.pos, at, this.context.world.layout.SIGHT_OCCLUDERS) || !this.context.world.spatial.clearOfScenery(at, at, .1)) return "放置/投掷位置不可及";
      }
    }
    if (step.op === "talk") {
      if (!w.persons.get(step.npcId)?.persona) return "对方不能对话";
      return this.context.dialogue.validate(step, settling || this.inRange(step, point!));
    }
    if (step.op === "snatch") {
      const item = w.items.holdings(step.npcId).find(i => i.kind === step.itemKind && !i.used);
      if (!item) return "对方没有该物品";
      if (!w.items.canMove(item.id, this.slot(item, p.id))) return "没有可用持物槽位";
    }
    if (step.op === "strike" && "facilityId" in step && w.facility(step.facilityId)?.status !== "open") return "设施已停用";
    if (step.op === "strike" && step.itemId && (!this.held(step.itemId) || w.items.slot(this.held(step.itemId)!) !== "hand")) return "击打物品必须拿在手中";
    if (step.op === "force_cut_in") {
      const npc = w.persons.get(step.npcId),
        q = npc ? w.queuePosition(npc) : null;
      if (!q || q.facility.status !== "open") return "目标已离队或设施关闭";
      if (settling && brain.blocks(step.npcId, p.id)) return "对方正在驱赶或阻挡，无法插入";
    }
    if (step.op === "vault") {
      if (!settling) {
        if (step.obstacle === "gate" && (this.context.world.layout.zoneOf(p.pos) !== "concourse" || (w.definition.generatorVersion!=="legacy-v0"?Math.min(...[...w.facilities.values()].filter(f=>f.def.kind==="gate").map(f=>dist(p.pos,f.def.pos))):w.layout.GATE_X-p.pos.x) > RULES.jumpGateDistance)) return "只能在安检后大厅、靠近闸机线翻越闸机";
        if (step.obstacle === "railing" && !this.context.world.layout.atRailing(p.pos)) return w.definition.generatorVersion!=="legacy-v0"?"请靠近公开地图标出的安检低栏杆段":"请靠近安检墙的低栏杆段（y=8–12 或 18–21）";
        if (step.obstacle === "escalator_side" && !(p.activity.kind === "escalator")) return "只能在下行扶梯上翻出侧边";
      }
      const dest = this.current?.dest;
      if (settling && step.obstacle !== "escalator_side" && dest && !this.context.world.spatial.clearOfPeople(p.pos, dest, personRadius(p.kind), w.collisionBodies(p.id))) return "落地点被占用";
    }
    if (step.op === "slide_handrail" && !settling && (!p.passedGate || p.onPlatform || dist(p.pos, this.context.world.layout.STAIRS_TOP) > STAIRS_REACH)) return "请先通过闸机并靠近楼梯扶手入口";
    return null;
  }
  private prepare() {
    const a = this.current!;
    const {
        world: w,
        bus
      } = this.context,
      p = w.player!,
      point = this.target(a.step);
    if (point && !this.inRange(a.step, point)) return;
    if (a.step.op === "approach") {
      a.phase = "perform";
      a.ready = true;
      return;
    }
    if (a.step.op === "talk") {
      const result = this.context.dialogue.begin(a.step);
      if (!result.ok) {
        this.fail(result.text);
        return;
      }
      a.phase = "dialogue";
      a.eventIds.push(this.pendingDialogue!.eventId);
      return;
    }
    a.phase = "perform";
    const primitive = PRIMITIVES[a.step.op];
    a.duration = a.step.op === "wait" ? a.step.seconds : a.step.op === "drop" && a.step.mode === "throw" ? 1 : primitive.duration;
    if (a.step.op === "take") {
      const item = w.items.items.get(a.step.itemId)!;
      if (item.location.type === "spot") a.duration = this.context.world.layout.ITEM_SPOTS.find(s => s.id === (item.location as {
        spotId: string;
      }).spotId)!.takeSeconds;
    }
    if (a.step.op === "vault" && a.step.obstacle === "railing") a.duration = 3;
    if (a.step.op === "vault" && a.step.obstacle === "escalator_side") a.duration = 1;
    a.remaining = a.duration;
    if (a.step.op === "vault") a.dest = {
      x: this.context.world.layout.GATE_X + 1.4,
      y: Math.min(this.context.world.layout.HEIGHT - 1, Math.max(1, p.pos.y))
    };
    if(w.definition.generatorVersion!=="legacy-v0"&&a.step.op==="vault"&&a.step.obstacle==="gate") {
      const nearest=[...w.facilities.values()].filter(f=>f.def.kind==="gate").sort((a,b)=>dist(p.pos,a.def.pos)-dist(p.pos,b.def.pos))[0];a.dest={...nearest.def.exit!};
    }
    if (a.step.op === "vault" && a.step.obstacle === "railing") a.dest = { x: this.context.world.layout.RAILING_X + 1.4, y: p.pos.y };
if(w.definition.generatorVersion!=="legacy-v0"&&a.step.op==="vault"&&a.step.obstacle==="railing") {
      const point=w.layout.RAILING_APPROACHES[0].pos, f=w.layout.FACILITIES.find(f=>f.kind==="security")!,q=f.queueDirection??{x:-1,y:0};a.dest={...point,x:point.x-q.x*2.1,y:point.y-q.y*2.1};
    }
    if (a.step.op === "vault" && a.step.obstacle === "escalator_side") a.dest = { x: p.pos.x, y: this.context.world.layout.STAIRS_TOP.y };
    if(w.definition.generatorVersion!=="legacy-v0"&&a.step.op==="vault"&&a.step.obstacle==="escalator_side"){
      const progress=this.traversal?1-this.traversal.remaining/(this.traversal.duration??10):0,from=w.layout.STAIRS_TOP,to=w.layout.STAIRS_BOTTOM;
      a.dest={x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress,floorId:"transit:stairs",elevation:-6*progress};
    }
    if (a.step.op === "slide_handrail") a.dest = { ...this.context.world.layout.STAIRS_BOTTOM };
    if (a.step.op === "force_cut_in") {
      const npc = w.persons.get(a.step.npcId)!,
        q = w.queuePosition(npc)!;
      w.cutInReservations.set(p.id, {
        facility: q.facility.def.id,
        npcId: npc.id
      });
    }
    if (primitive.event) {
      const loudness = a.step.op === "make_noise" ? {
        low: 3,
        mid: 8,
        high: 14
      }[a.step.level] : primitive.loudness;
      const aimedThrow = a.step.op === "drop" && a.step.mode === "throw" && a.step.at?.kind === "person";
      const event = this.emit(a, {
        kind: a.step.op === "vault" && a.step.obstacle === "escalator_side" ? "escalator_exit" : aimedThrow ? "item_thrown" : primitive.event,
        severity: a.step.op === "vault" && a.step.obstacle === "escalator_side" ? "suspicious" : aimedThrow ? "affecting" : primitive.severity,
        loudness,
        ...("npcId" in a.step ? {
          targetId: a.step.npcId
        } : "facilityId" in a.step ? { targetId: a.step.facilityId } : aimedThrow && a.step.op === "drop" ? {
          targetId: a.step.at!.id
        } : {})
      });
      bus.beginAct({
        actorId: p.id,
        kind: event.kind,
        severity: event.severity,
        eventId: event.id,
        targetId: event.targetId
      });
    }
  }
  private emit(a: Current, event: Omit<WorldEvent, "id" | "t" | "actorId" | "pos"> & {
    pos?: Vec;
  }) {
    const e = this.context.bus.emit({
      t: this.context.world.t,
      actorId: "player",
      pos: {
        ...this.context.world.player!.pos
      },
      ...event
    });
    a.eventIds.push(e.id);
    return e;
  }
  private settle(a: Current): ActionResult {
    const {
        world: w
      } = this.context,
      p = w.player!,
      s = a.step;
    if (s.op === "take" || s.op === "give") {
      const item = w.items.items.get(s.itemId)!,
        to = s.op === "take" ? p.id : s.toId;
      const result = w.items.move(item.id, this.slot(item, to), s.op);
      if (result.ok && (s.op === "give" || item.ownerId === null)) item.ownerId = to;
      return result;
    }
    if (s.op === "drop") {
      const item = this.held(s.itemId)!,
        at = s.at ? this.resolveRef(s.at)! : p.pos;
      const result = w.items.move(item.id, {
        type: "ground",
        pos: {
          ...at
        }
      }, s.mode);
      if (result.ok) {
        const causeId = a.eventIds[0];
        const event = this.emit(a, {
          kind: s.mode === "throw" ? "item_thrown" : "item_dropped",
          severity: "odd",
          itemId: item.id,
          pos: {
            ...at
          },
          loudness: s.mode === "place" ? 0 : ITEM_DEFS[item.kind].dropNoise * (s.mode === "throw" ? 1.5 : 1),
          causeId
        });
        if (s.mode === "throw" && s.at?.kind === "person") this.emit(a, {
          kind: "collision",
          severity: "affecting",
          targetId: s.at.id,
          itemId: item.id,
          pos: {
            ...at
          },
          loudness: 4,
          causeId: event.id
        });
      }
      return result;
    }
    if (s.op === "strike" && "facilityId" in s) {
      const ok = w.damageFacility(s.facilityId, p.id, a.eventIds[0]);
      return { ok, text: ok ? "设施受损停用，队伍已解散" : "设施不存在" };
    }
    if (s.op === "snatch" || s.op === "push" || s.op === "strike") return this.settleContest(a, s);
    if (s.op === "slide_handrail") {
      p.pos = { ...a.dest! }; p.onPlatform = true; p.activity = { kind: "idle" };
      return { ok: true, text: "沿扶手滑到下层站台" };
    }
    if (s.op === "vault") {
      if (s.obstacle === "railing") { p.pos = { ...a.dest! }; p.screened = true; return { ok: true, text: "翻过安检栏杆，进入大厅；尚未过闸" }; }
      if (s.obstacle === "escalator_side") {
        p.pos = { ...a.dest! };
        const remaining = Math.max(.1, Math.hypot(this.context.world.layout.STAIRS_BOTTOM.x-p.pos.x,this.context.world.layout.STAIRS_BOTTOM.y-p.pos.y)/Math.hypot(this.context.world.layout.STAIRS_BOTTOM.x-this.context.world.layout.STAIRS_TOP.x,this.context.world.layout.STAIRS_BOTTOM.y-this.context.world.layout.STAIRS_TOP.y) * STAIRS_SECONDS);
        p.activity = { kind: "stairs", route: "stairs", remaining, duration: remaining, start: { ...p.pos }, end: this.context.world.layout.STAIRS_BOTTOM };
        this.traversal = null;
        return { ok: true, text: "翻出扶梯侧边，改从楼梯下行" };
      }
      p.pos = {
        ...a.dest!
      };
      p.passedGate = true;
      w.gatePassed++;
      return {
        ok: true,
        text: "翻越闸机成功，已到闸机内连接区；请前往楼梯入口下楼到站台"
      };
    }
    if (s.op === "force_cut_in") {
      const q = w.queuePosition(w.persons.get(s.npcId)!)!,
        index = q.facility.queue.indexOf(s.npcId);
      q.facility.queue.splice(index, 0, p.id);
      w.cutInReservations.delete(p.id);
      p.activity = {
        kind: "queued",
        facility: q.facility.def.id
      };
      return {
        ok: true,
        text: "已强行插入队列"
      };
    }
    return {
      ok: true,
      text: s.op === "approach" ? "已接近目标" : s.op === "wait" ? "等待结束" : "已制造声音"
    };
  }
  private settleContest(a: Current, s: Extract<PlanStep, {
    op: "snatch" | "push" | "strike"; npcId: string;
  }>): ActionResult {
    const {
        world: w,
        guards,
        alerts
      } = this.context,
      p = w.player!,
      target = this.person(s.npcId)!;
    const npc = w.persons.get(s.npcId),
      guard = guards.guards.find(g => g.def.id === s.npcId);
    const item = s.op === "strike" && s.itemId ? this.held(s.itemId) : null;
    const outcome = contest(this.rng, {
      op: s.op === "strike" ? s.aim : s.op,
      impact: item ? ITEM_DEFS[item.kind].impact : 0,
      targetFacing: angleDiff(target.facing, angleTo(target.pos, p.pos)) <= Math.PI / 2,
      courage: npc?.persona?.traits.courage ?? .7,
      red: alerts.get(s.npcId, p.id)?.level === "red",
      guard: Boolean(guard)
    });
    if (outcome !== "success") {
      this.emit(a, {
        kind: "argument",
        severity: "affecting",
        targetId: s.npcId,
        loudness: 6,
        causeId: a.eventIds[0]
      });
      return {
        ok: false,
        text: "对方反抗，行动未成功"
      };
    }
    if (s.op === "snatch") {
      const stolen = w.items.holdings(s.npcId).find(i => i.kind === s.itemKind && !i.used)!;
      return w.items.move(stolen.id, this.slot(stolen, p.id), "snatch");
    }
    if (s.op === "strike" && s.aim === "knockout") {
      if (npc) w.knockOut(npc, 20);else if (guard) guards.knockOut(guard.def.id, 20, w.t);
      this.emit(a, {
        kind: "knockout",
        severity: "violation",
        targetId: s.npcId,
        loudness: 3,
        causeId: a.eventIds[0]
      });
      return {
        ok: true,
        text: "对方被击晕，将失能 20 秒"
      };
    }
    if (npc || guard) {
      const d = dist(p.pos, target.pos) || 1,
        dx = (target.pos.x - p.pos.x) / d,
        dy = (target.pos.y - p.pos.y) / d;
      const dest = {
          x: target.pos.x + dx * .8,
          y: target.pos.y + dy * .8
        },
        radius = personRadius(npc?.kind ?? "guard");
      if (this.context.world.spatial.clearOfScenery(target.pos, dest, radius) && this.context.world.spatial.clearOfPeople(target.pos, dest, radius, w.collisionBodies(s.npcId))) {
        target.pos = dest;
        if (npc) {
          w.removeFromQueue(npc);
          npc.activity = {
            kind: "idle"
          };
        } else if (guard) this.context.guards.investigate(guard, p.pos, 2);
      }
    }
    return {
      ok: true,
      text: s.op === "push" ? "推开了对方" : "击打命中"
    };
  }
  private reclaim(npc: Person, subject: Person) {
    const {
      world: w,
      bus,
      alerts
    } = this.context;
    const item = w.items.holdings(subject.id).find(i => i.ownerId === npc.id);
    if (!item) return;
    const event = bus.emit({
      t: w.t,
      kind: "snatch",
      severity: "violation",
      actorId: npc.id,
      targetId: subject.id,
      itemId: item.id,
      pos: {
        ...npc.pos
      },
      loudness: 4
    });
    bus.beginAct({
      actorId: npc.id,
      kind: event.kind,
      severity: event.severity,
      eventId: event.id,
      targetId: subject.id
    });
    const result = contest(this.rng, {
      op: "snatch",
      impact: 0,
      targetFacing: angleDiff(subject.facing, angleTo(subject.pos, npc.pos)) <= Math.PI / 2,
      courage: subject.persona?.traits.courage ?? .5,
      red: alerts.get(subject.id, npc.id)?.level === "red",
      guard: false
    });
    if (result === "success") w.items.move(item.id, this.slot(item, npc.id), "reclaim");else bus.emit({
      t: w.t,
      kind: "argument",
      severity: "affecting",
      actorId: npc.id,
      targetId: subject.id,
      pos: {
        ...npc.pos
      },
      loudness: 5,
      causeId: event.id
    });
  }
  startConsentedCutIn(npcId: string): ActionResult {
    const {
        world: w
      } = this.context,
      p = w.player!,
      npc = w.persons.get(npcId),
      q = npc ? w.queuePosition(npc) : null;
    const error = this.validateConsent(npcId);
    if (error || !q) return {
      ok: false,
      text: error ?? "让位失效"
    };
    w.finishAttention(p, "转向协商让位");
    this.keepQueue = false;
    w.removeFromQueue(p);
    this.consent = {
      npcId,
      facility: q.facility.def.id,
      remaining: RULES.cutInSeconds,
      ready: false
    };
    const dest = w.queueStandPoint(q.facility, q.index, p.kind);
    p.activity = {
      kind: "creative",
      mechanic: "cut_in_line",
      remaining: RULES.cutInSeconds,
      facility: q.facility.def.id,
      dest
    };
    w.cutInReservations.set(p.id, {
      facility: q.facility.def.id,
      npcId
    });
    return {
      ok: true,
      text: `${npcId} 同意让位，开始移动到这位乘客前面`
    };
  }
  private validateConsent(npcId: string): string | null {
    const {
        world: w
      } = this.context,
      p = w.player!,
      npc = w.persons.get(npcId),
      q = npc ? w.queuePosition(npc) : null;
    if (p.incapacitated || ["service", "stairs", "done"].includes(p.activity.kind)) return "当前行动未完成，不能移动让位";
    if (this.consent || this.current && this.current.phase !== "dialogue" || !q || q.facility.status !== "open" || npc!.incapacitated || dist(p.pos, npc!.pos) > RULES.cutInDistance || !playerCanSee(p.pos, npc!.pos, w.lightAt, w.layout) || !this.context.world.navigation.findPath(p.pos, npc!.pos)) return "让位已失效：请先到可见可达的排队乘客附近";
    const mine = w.queuePosition(p);
    return mine?.facility === q.facility && mine.index <= q.index ? "这位乘客在你后面，无需请求插队" : null;
  }
  private stepConsent() {
    const c = this.consent!,
      {
        world: w
      } = this.context,
      p = w.player!,
      f = w.facility(c.facility)!;
    if (p.incapacitated || p.activity.kind !== "creative" || f.status !== "open" || !f.queue.includes(c.npcId)) {
      this.fail("让位已失效：乘客离队或设施关闭");
      return;
    }
    c.remaining -= DT;
    const dest = w.cutInPoint(p, f);
    p.activity.dest = dest;
    p.activity.remaining = c.remaining;
    c.ready = w.movePerson(p, dest, p.speed * DT) && c.remaining <= 1e-9;
  }
  private finishConsent() {
    const c = this.consent!,
      {
        world: w
      } = this.context,
      p = w.player!,
      f = w.facility(c.facility)!,
      index = f.queue.indexOf(c.npcId);
    if (index < 0 || f.status !== "open") {
      this.fail("让位已失效");
      return;
    }
    w.cutInReservations.delete(p.id);
    f.queue.splice(index, 0, p.id);
    p.activity = {
      kind: "queued",
      facility: c.facility
    };
    this.consent = null;
    const text = `经乘客同意，已移动到 ${c.facility} 第 ${index + 1} 位`;
    w.notifyPlayer("creative_done", text);
    this.onConsentComplete?.(c.npcId, { ok: true, text });
  }
}
