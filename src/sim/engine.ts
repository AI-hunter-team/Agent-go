import type { WorldDefinition } from "../shared/world";
import { legacyWorld, publicMap } from "./worldDefinition";
import { resolveLoadout } from "../shared/interaction";
import { playerCanSee } from "./observation";
import type {
  ActionResult,
  ActionPlan,
  AgentAction,
  InteractionAction,
  CreativeMechanic,
  FacilityStatus,
  GameStatus,
  Observation,
  PlanStep,
  TimeBreakdown,
  TrailPoint,
  Trigger,
  Vec,
} from "../shared/types";
import { EventBus } from "./events";
import { PerceptionSystem, type Observer } from "./perception";
import { AlertSystem } from "./alert";
import { CreativeSystem } from "./actions/legacy";
import { ActionExecutor } from "./actions/executor";
import { DialogueSystem } from "./dialogue";
import { buildIntentContext, parsePlan } from "./intent";
import { GuardSystem } from "./guards";
import { BLACKOUT_SWITCH_REACH, queueSlot } from "./layout";
import { stationSwitch } from "./stationSwitch";
import { personRadius } from "./movement";
import { NpcDirector } from "./npc";
import { NpcBrain } from "./npcBrain";
import { buildObservation, visibleFacilities } from "./observation";
import { DT, RULES, STATUS_LABEL, buildScenario, type Scenario } from "./scenario";
import { World, round1, type Person } from "./world";
import { resolveGameSettings, type GameSettings } from "../shared/gameSettings";

/**
 * The single source of truth for a run. The agent only requests actions through
 * applyAction(); position, tickets, passing and losing are all settled here.
 */
export class Engine {
  readonly settings: Readonly<GameSettings>;
  readonly world: World;
  readonly guards: GuardSystem;
  readonly events = new EventBus();
  readonly perception: PerceptionSystem;
  readonly alerts: AlertSystem;
  readonly npcs: NpcDirector;
  readonly npcBrain: NpcBrain;
  readonly creative: CreativeSystem;
  readonly executor: ActionExecutor;
  readonly dialogue: DialogueSystem;
  readonly player: Person;

  status: GameStatus = "running";
  failReason: string | null = null;
  /** Time of completed train boarding in world seconds. */
  score: number | null = null;
  readonly trail: TrailPoint[] = [];
  readonly timeBreakdown: TimeBreakdown = { walking: 0, queueing: 0, service: 0, waiting: 0, creative: 0, idle: 0, stairs: 0, escalator: 0, distraction: 0 };

  private triggers: Trigger[] = [];
  private knownStatus = new Map<string, FacilityStatus>();
  private seenAttractions = new Set<string>();
  private quietSeconds = 0;
  /** A wait requested while still walking or queueing: fires wait_done without interrupting. */
  private wakeAt: number | null = null;

  readonly loadout: Readonly<import("../shared/interaction").Loadout>;
  constructor(readonly seed = 1, settings: Partial<GameSettings> = {}, scenarioOverride?: Scenario, loadout?: import("../shared/interaction").Loadout, definition:WorldDefinition=legacyWorld(seed)) {
    this.settings = resolveGameSettings(settings);
    this.loadout = resolveLoadout(loadout);
    this.world = new World(seed, this.settings.timeLimitSeconds, this.loadout, definition);
    this.guards=new GuardSystem(definition.guards,definition.layout);
    this.world.onWorldEvent = event => { this.events.emit(event); };
    this.guards.lightAt = this.world.lightAt;
    this.npcs = new NpcDirector(this.world, scenarioOverride ?? buildScenario(seed, this.settings, definition.layout), !scenarioOverride);
    this.perception = new PerceptionSystem(this.events, (id) => this.world.persons.get(id) ?? this.guards.guards.find((g) => g.def.id === id), this.world.lightAt,definition.layout);
    this.alerts = new AlertSystem(this.events, (id) => this.guards.guards.find((g) => g.def.id === id)?.role ?? (this.world.persons.has(id) && id !== "player" ? "npc" : undefined), () => this.t);
    this.npcBrain = new NpcBrain(this.world, this.guards, this.events, this.alerts);
    this.dialogue = new DialogueSystem(this.world,this.events,this.alerts,this.npcBrain);
    this.executor = new ActionExecutor({world:this.world,guards:this.guards,bus:this.events,alerts:this.alerts,brain:this.npcBrain,dialogue:this.dialogue});
    this.creative = new CreativeSystem(this.world, this.guards, this.events, () => this.resolveInteractions(0),this.executor);
    this.player = this.world.addPerson("player", this.world.layout.ENTRANCE, { isPlayer: true });
    if (!scenarioOverride) {
      this.world.transit.startCrowd();
      const entrance=definition.entrances?.[0];if(entrance)this.world.entry.begin(this.player,entrance);
    }
    this.recordTrail();
    this.world.notifyPlayer("start", "开局：你站在车站入口，需要在限时内登上地铁。");
    this.perceive();
    this.collect();
  }

  get t(): number {
    return this.world.t;
  }

  resolveInteractions(dt = DT) {
    const observers: Observer[] = [
      ...[...this.world.persons.values()].filter((p) => !p.isPlayer).map((p) => ({ id: p.id, role: "npc" as const, pos: p.pos, facing: p.facing, incapacitated: p.incapacitated })),
      ...this.guards.guards.map((g) => {
        const v = this.guards.vision(g);
        return { id: g.def.id, role: g.role, pos: g.pos, facing: g.facing, incapacitated: g.incapacitated, sightRange: v.range, sightFovDeg: v.fov };
      }),
    ];
    const previousChanges = this.alerts.history.length;
    const percepts = this.perception.step(observers);
    const result = this.alerts.step(percepts, (a, b) => {
      const observer = observers.find((o) => o.id === a);
      const subject = this.world.persons.get(b) ?? this.guards.guards.find((g) => g.def.id === b);
      return Boolean(observer && subject && this.perception.canSee(observer, subject.pos));
    }, dt, (id) => (observers.find((o) => o.id === id)?.incapacitated ?? 0) > 0);
    for (const change of this.alerts.history.slice(previousChanges)) {
      const observer = observers.find(o => o.id === change.observerId);
      if (change.subjectId === "player" && observer && playerCanSee(this.player.pos,observer.pos,this.world.lightAt,this.world.layout)) this.world.notifyPlayer("noticed", `${observer.id} 开始留意你的举动`);
    }
    this.npcBrain.perceive(percepts);
    this.guards.respond(percepts, this.alerts, this.events);
    for (const record of this.alerts.records.values()) {
      const guard = this.guards.guards.find((g) => g.def.id === record.observerId);
      const subject = this.world.persons.get(record.subjectId);
      if (guard && subject && this.guards.canSee(guard, subject.pos)) this.guards.watch(guard, subject.id, subject.pos);
    }
    this.creative?.noteRed(result.guardRed);
    return result.guardRed;
  }

  private failForGuard(guardId: string, eventId: string) {
    const guard = this.guards.guards.find((g) => g.def.id === guardId);
    const kind = this.events.get(eventId)?.kind;
    const action = kind === "vault" ? "翻越闸机或安检栏杆" : kind === "strike" || kind === "knockout" ? "击打行为" : "违规行为";
    this.end("failed", `被${guard?.def.label ?? guardId}确认${action}，判负`);
  }

  // ------------------------------------------------------------- stepping

  step() {
    if (this.status !== "running" || this.executor.pendingDialogue) return;
    const w = this.world;
    const activityBefore = this.player.activity.kind;
    w.t = round1(w.t + DT);

    this.npcs.step();
    // Actions and NPC reactions move before the world's queue/facility step.
    // Keep one common start point for collision checks across the whole tick.
    w.tickStarts.clear();
    for (const person of w.persons.values()) w.tickStarts.set(person.id, { ...person.pos });
    w.collisionGuards = this.guards.guards.map((g) => ({ id: g.def.id, pos: g.pos, radius: personRadius("guard") }));
    this.executor.step();
    if(this.executor.pendingDialogue) {
      const red=this.resolveInteractions(0);
      if(red?.subjectId==="player") this.failForGuard(red.guardId,red.causeEventId);
      this.account(activityBefore); this.collect(); return;
    }
    this.npcBrain.step();
    w.stepPeopleAndFacilities(true);
    this.guards.step([...w.persons.values()].map((p) => ({ id: p.id, pos: p.pos, from: w.tickStarts.get(p.id), radius: personRadius(p.kind) })), (id) => w.persons.get(id), w.t);
    w.collisionGuards = this.guards.guards.map((g) => ({ id: g.def.id, pos: g.pos, from: w.collisionGuards.find((old) => old.id === g.def.id)?.pos, radius: personRadius("guard") }));
    this.account(activityBefore);

    const red = this.resolveInteractions();
    if (red?.subjectId === "player") { this.failForGuard(red.guardId, red.causeEventId); return; }
    this.executor.finishFrame();
    if (this.player.onTrain) {
      this.score = w.t;
      this.end("success", null);
      return;
    }
    if (w.t >= this.settings.timeLimitSeconds - 1e-9) {
      this.end("failed", `超时：${this.settings.timeLimitSeconds} 秒内未登上地铁`);
      return;
    }

    if (this.wakeAt !== null && w.t >= this.wakeAt - 1e-9) {
      this.wakeAt = null;
      w.notifyPlayer("wait_done", "等待结束");
    }
    this.perceive();
    this.collect();
    if (this.triggers.length === 0 && ["queued", "escalator_queue"].includes(this.player.activity.kind)) {
      this.quietSeconds += DT;
      if (this.quietSeconds >= RULES.periodicCheckSeconds - 1e-9) {
        w.notifyPlayer("periodic", `已在队伍中 ${RULES.periodicCheckSeconds} 秒没有新情况，可重新评估`);
        this.collect();
      }
    }
  }

  /** Raise a decision trigger from outside the world step (e.g. an action was rejected). */
  notify(kind: Trigger["kind"], text: string) {
    this.world.notifyPlayer(kind, text);
    this.collect();
  }

  /** End the run from outside the world (e.g. the model is unavailable). */
  abort(reason: string) {
    if (this.status === "running") this.end("failed", reason);
  }

  private end(status: GameStatus, reason: string | null) {
    if(this.executor.busy) this.executor.cancel("本局结束，行动中断");
    this.status = status;
    this.failReason = reason;
    this.world.finishAttention(this.player, "本局结束");
    this.recordTrail();
    this.world.log(status === "success" ? "success" : "failed", reason ?? `已登上地铁，用时 ${this.world.t} 秒`, true);
  }

  /** Attribute this step's time to what the player was doing when it began. */
  private account(kind: Person["activity"]["kind"]) {
    const tb = this.timeBreakdown;
    if (kind === "entering" || kind === "walking" || kind === "boarding" || kind === "to_queue" || kind === "to_escalator") tb.walking += DT;
    else if (kind === "queued" || kind === "escalator_queue") tb.queueing += DT;
    else if (kind === "service") tb.service += DT;
    else if (kind === "waiting") tb.waiting += DT;
    else if (kind === "creative" || kind === "acting") tb.creative += DT;
    else if (kind === "stairs") tb.stairs = (tb.stairs ?? 0) + DT;
    else if (kind === "escalator") tb.escalator = (tb.escalator ?? 0) + DT;
    else if (kind === "distracted") tb.distraction = (tb.distraction ?? 0) + DT;
    else if (kind === "idle") tb.idle += DT;
    if (Math.round(this.world.t * 10) % 5 === 0) this.recordTrail();
  }

  private recordTrail() {
    const a=this.player.activity,p=this.player;
    const normal=a.kind==="stairs"||a.kind==="escalator",acting=a.kind==="acting"&&p.pos.floorId?.startsWith("transit:");
    const activeId=normal?a.connectorId:acting?p.pos.floorId!.slice("transit:".length):undefined;
    const active=this.world.definition.connectors?.find(c=>c.id===activeId);
    const transit=normal||acting;
    const progress=a.kind==="entering"?a.progress:normal?1-a.remaining/(a.duration??(a.kind==="stairs"?6:10)):acting?Math.max(0,Math.min(1,-(p.pos.elevation??0)/6)):undefined;
    const connector=normal?a.kind:active?.kind??"stairs";
    const point = { ...(this.world.definition.generatorVersion!=="legacy-v0"?{floorId:p.pos.floorId,elevation:p.pos.floorId==="platform"?-6:transit?-6*progress!:0,...(a.kind==="entering"?{connector:"entrance" as const,entranceId:a.entranceId,progress}:transit?{connector,...(activeId?{connectorId:activeId}:{}),progress}:{})}:{}),t:this.t,...p.pos };
    if (this.trail.at(-1)?.t === this.t) this.trail[this.trail.length - 1] = point;
    else this.trail.push(point);
  }

  /** Notice status changes of facilities that are currently in view. */
  private perceive() {
    for (const a of this.observe().attractions ?? []) {
      if (this.seenAttractions.has(a.id)) continue;
      this.seenAttractions.add(a.id);
      this.world.notifyPlayer("attraction_seen", `注意到${a.label}：${a.cue} 可以忽略，也可自主决定关注。`);
    }
    for (const f of visibleFacilities(this.world, this.player.pos)) {
      const known = this.knownStatus.get(f.def.id);
      this.knownStatus.set(f.def.id, f.status);
      const firstSightProblem = known === undefined && f.status !== "open";
      if (firstSightProblem || (known !== undefined && known !== f.status)) {
        this.world.notifyPlayer("facility_changed", `看到 ${f.def.id} ${STATUS_LABEL[f.status]}`);
      }
    }
  }

  private collect() {
    if (this.world.playerTriggers.length === 0) return;
    this.triggers.push(...this.world.playerTriggers);
    this.world.playerTriggers = [];
    this.quietSeconds = 0;
  }

  // ------------------------------------------------------------- agent API

  hasTriggers(): boolean {
    return this.triggers.length > 0;
  }

  /** Drain pending triggers (all events since the last decision are merged into one). */
  takeTriggers(): Trigger[] {
    const out = this.triggers;
    this.triggers = [];
    return out;
  }

  observe(): Observation {
    const remaining = Math.max(0, round1(this.world.blackoutUntil - this.world.t));
    const position = stationSwitch(this.world.definition).position;
    const distance = Math.hypot(this.player.pos.x - position.x, this.player.pos.y - position.y);
    const sameFloor = this.world.definition.generatorVersion === "legacy-v0" || (this.player.pos.floorId ?? "concourse") === "concourse";
    return { ...buildObservation(this.world, this.guards), ...(this.world.definition.generatorVersion !== "legacy-v0" ? { publicMap: publicMap(this.world.definition) } : {}), blackout: { active: remaining > 0, remaining, switchDistance: round1(distance), canOperate: sameFloor && distance <= BLACKOUT_SWITCH_REACH } };
  }

  /** Validate and start an action. `mechanic` is required for attempt_creative. */
  applyAction(action: AgentAction | InteractionAction, mechanic?: CreativeMechanic, interpreted?: ActionPlan): ActionResult {
    const w = this.world;
    const p = this.player;
    if (this.status !== "running") return { ok: false, text: "本局已结束" };
    if (p.activity.kind === "boarding" && action.type !== "wait") return { ok: false, text: "正在登车，请等进入车厢" };
    if(this.executor.busy && action.type!=="wait") return {ok:false,text:"上一个行动尚未完成"};
    // Waiting never changes the world, so it is always allowed; anything else must not
    // interrupt a service or a creative act in progress.
    if (action.type !== "wait") {
      if (p.activity.kind === "entering") return { ok:false,text:"正在沿入口下楼进站，请等到达站厅" };
      if (p.activity.kind === "service") return { ok: false, text: "正在办理中，请等办理完成" };
      if (p.activity.kind === "creative") return { ok: false, text: "上一个行动尚未完成" };
      if ((p.activity.kind === "stairs" || p.activity.kind === "escalator") && !(p.activity.kind === "escalator" && action.type === "act")) return { ok: false, text: "正在下楼梯，请等到达站台" };
    }
    this.wakeAt = null;

    switch (action.type) {
      case "act":
      case "take":
      case "give":
      case "drop":
      case "talk": {
        let plan: ActionPlan;
        if (action.type === "act") {
          plan = interpreted ?? parsePlan(action.instruction, buildIntentContext(w, this.guards));
        } else {
          let step: PlanStep;
          switch (action.type) {
            case "give": step = { op: "give", itemId: action.itemId, toId: action.npcId }; break;
            case "take": step = { op: "take", itemId: action.itemId }; break;
            case "drop": step = { op: "drop", itemId: action.itemId, mode: action.mode }; break;
            case "talk": step = { op: "talk", npcId: action.npcId, message: action.message, goal: action.goal, offerItemId: action.offerItemId }; break;
          }
          plan = { status: "plan", summary: "开始行动", reason: "", source: "keywords", steps: [step] };
        }
        const result = this.executor.start(plan);
        const red = this.resolveInteractions(0);
        if (red?.subjectId === "player") this.failForGuard(red.guardId, red.causeEventId);
        return result;
      }
      case "traverse": {
        const err=w.traverse(p, action.route, action.walking, action.connectorId); return {ok:!err,text:err??"开始下楼梯"};
      }
      case "observe": {
        const n = w.persons.get(action.targetId);
        if (!n || n.isPlayer || !playerCanSee(p.pos, n.pos, w.lightAt, w.layout)) return {ok:false,text:"目标不在可见范围"};
        if (p.activity.kind === "idle" || p.activity.kind === "waiting") p.activity = { kind: "waiting", remaining: 1 };
        else this.wakeAt = round1(w.t + 1);
        const holding = w.items.holdings(n.id).filter(i => w.items.slot(i) === "hand").map(i => i.kind).join("、") || "无";
        return {ok:true,text: `${n.id}：${n.persona ? Object.values(n.persona.look).flat().join("、") : n.kind}；${n.activity.kind}；手持：${holding}`} ;
      }
      case "move_to": {
        const target = resolveTarget(action.target, w, p);
        if (!target) return { ok: false, text: `未知地点 ${action.target}。可用：${publicMap(w.definition).nodes.map((n) => n.id).join("、")}，或设施编号` };
        if (!w.navigation.findPath(p.pos, target.pos)) return { ok: false, text: "目标不可步行到达，保留当前动作与队列位次" };
        const left = this.leaveIfQueued();
        const err = w.walkTo(p, target.pos, target.label);
        if (err) return { ok: false, text: left + err };
        return { ok: true, text: `${left}出发前往${target.label}` };
      }
      case "join_queue": {
        const f = w.facility(action.facility);
        if (!f) return { ok: false, text: `不存在设施 ${action.facility}。可用：${this.world.layout.FACILITIES.map((d) => d.id).join("、")}` };
        const current = w.queuePosition(p);
        if (current?.facility.def.id === action.facility) return { ok: true, text: `继续在 ${action.facility} 排队` };
        if (p.activity.kind === "to_queue" && p.activity.facility === action.facility) return { ok: true, text: `继续走向 ${action.facility} 队尾` };
        if (!this.world.navigation.findPath(p.pos, queueSlot(f.def, f.queue.length))) return { ok: false, text: "目标队列不可步行到达，保留当前动作与队列位次" };
        const left = this.leaveIfQueued();
        const err = w.joinQueue(p, action.facility);
        if (err) return { ok: false, text: left + err };
        return { ok: true, text: `${left}走向 ${action.facility} 队尾` };
      }
      case "leave_queue": {
        const err = w.leaveQueue(p);
        if (!err) this.notify("arrived", "已离队，可以选择下一步行动");
        return err ? { ok: false, text: err } : { ok: true, text: "已离开队伍" };
      }
      case "wait": {
        const s = Math.min(RULES.maxWaitSeconds, Math.max(1, Number(action.seconds) || 1));
        if (p.activity.kind === "idle" || p.activity.kind === "waiting") {
          p.activity = { kind: "waiting", remaining: s };
          return { ok: true, text: `原地等待 ${s} 秒` };
        }
        this.wakeAt = round1(w.t + s);
        return { ok: true, text: `保持当前动作，${s} 秒后再评估` };
      }
      case "operate_switch": {
        const position = stationSwitch(w.definition).position;
        const distance = Math.hypot(p.pos.x - position.x, p.pos.y - position.y);
        if (w.definition.generatorVersion !== "legacy-v0" && (p.pos.floorId ?? "concourse") !== "concourse") return { ok: false, text: "电闸位于站厅，无法隔层操作" };
        if (distance > BLACKOUT_SWITCH_REACH) return { ok: false, text: `距离墙边电闸还太远（需要在 ${BLACKOUT_SWITCH_REACH} 米内）` };
        const remaining = Math.max(0, round1(w.blackoutUntil - w.t));
        if (remaining > 0) return { ok: false, text: `熄灯已经生效，还剩 ${remaining} 秒` };
        w.blackout(RULES.blackoutSeconds);
        this.notify("facility_changed", `已操作墙边电闸，车站熄灯 ${RULES.blackoutSeconds} 秒`);
        return { ok: true, text: `电闸已操作，熄灯 ${RULES.blackoutSeconds} 秒` };
      }
      case "descend_stairs": {
        const err = w.descendStairs(p);
        return err ? { ok: false, text: err } : { ok: true, text: "开始下楼梯，约 6 秒后到达下层站台" };
      }
      case "take_escalator": {
        const err = w.transit.join(p);
        return err ? { ok: false, text: err } : { ok: true, text: "前往扶梯队尾候梯；可离队换走楼梯" };
      }
      case "inspect_attraction": {
        const err = w.inspectAttraction(p, action.attraction, action.mode);
        return err ? { ok: false, text: err } : { ok: true, text: action.mode === "glance" ? "减速查看 3 秒，可主动恢复赶路" : "停留查看 6 秒，可主动离开" };
      }
      case "request_cut_in":
        return { ok: false, text: "请通过 NPC 协商流程请求让位" };
      case "attempt_creative": {
        if (!mechanic) return { ok: false, text: "创造性行动尚未归类" };
        const result = this.creative.start(p, mechanic, action.reason);
        const red = this.resolveInteractions(0);
        if (red?.subjectId === "player") this.failForGuard(red.guardId, red.causeEventId);
        return result;
      }
    }
  }

  private leaveIfQueued(): string {
    if (this.player.activity.kind === "escalator_queue" || this.player.activity.kind === "to_escalator") {
      this.world.leaveQueue(this.player);
      return "已离开扶梯队伍（失去位次）；";
    }
    const q = this.world.queuePosition(this.player);
    if (!q) return "";
    this.world.removeFromQueue(this.player);
    this.player.activity = { kind: "idle" };
    return `已离开 ${q.facility.def.id} 队伍（失去位次）；`;
  }
}

function resolveTarget(id: string, world: World, person: Person): { pos: Vec; label: string } | null {
  const layout = world.layout;
  const node = publicMap(world.definition).nodes.find(n => n.id === id);
  if (node) return { pos: node.pos, label: node.label };
  const f = layout.FACILITIES.find((d) => d.id === id);
  if (f) {
    const facility = world.facility(f.id)!;
    // A facility target is an approach to its current queue tail. This keeps
    // exploratory movement from dropping the player at the service head and
    // then forcing a second decision to walk back to the line.
    const current = world.queuePosition(person);
    const queueLengthAfterLeaving = current?.facility.def.id === f.id
      ? Math.max(0, facility.queue.length - 1)
      : facility.queue.length;
    return { pos: world.queueStandPoint(facility, queueLengthAfterLeaving, person.kind), label: `${f.label}队尾` };
  }
  return null;
}
