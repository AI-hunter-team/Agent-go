import type {
  ActionResult,
  AgentAction,
  CreativeMechanic,
  FacilityStatus,
  GameStatus,
  Observation,
  TimeBreakdown,
  TrailPoint,
  Trigger,
  Vec,
} from "../shared/types";
import { CreativeSystem } from "./creative";
import { GuardSystem } from "./guards";
import { ENTRANCE, FACILITIES, NAV_NODES, queueSlot } from "./layout";
import { findPath, nodeById } from "./nav";
import { NpcDirector } from "./npc";
import { buildObservation, visibleFacilities } from "./observation";
import { DT, RULES, STATUS_LABEL, buildScenario } from "./scenario";
import { World, round1, type Person } from "./world";
import { resolveGameSettings, type GameSettings } from "../shared/gameSettings";

const MECHANIC_LABEL: Record<CreativeMechanic, string> = {
  cut_in_line: "插队",
  jump_gate: "翻越闸机",
  unsupported: "不支持的行动",
};

/**
 * The single source of truth for a run. The agent only requests actions through
 * applyAction(); position, tickets, passing and losing are all settled here.
 */
export class Engine {
  readonly settings: Readonly<GameSettings>;
  readonly world: World;
  readonly guards = new GuardSystem();
  readonly npcs: NpcDirector;
  readonly creative: CreativeSystem;
  readonly player: Person;

  status: GameStatus = "running";
  failReason: string | null = null;
  /** Time of arrival at the lower platform in world seconds. */
  score: number | null = null;
  readonly trail: TrailPoint[] = [];
  readonly timeBreakdown: TimeBreakdown = { walking: 0, queueing: 0, service: 0, waiting: 0, creative: 0, idle: 0, stairs: 0 };

  private triggers: Trigger[] = [];
  private knownStatus = new Map<string, FacilityStatus>();
  private quietSeconds = 0;
  /** A wait requested while still walking or queueing: fires wait_done without interrupting. */
  private wakeAt: number | null = null;

  constructor(readonly seed = 1, settings: Partial<GameSettings> = {}) {
    this.settings = resolveGameSettings(settings);
    this.world = new World(seed, this.settings.timeLimitSeconds);
    this.npcs = new NpcDirector(this.world, buildScenario(seed, this.settings));
    this.creative = new CreativeSystem(this.world, this.guards);
    this.player = this.world.addPerson("player", ENTRANCE, { isPlayer: true });
    this.recordTrail();
    this.world.notifyPlayer("start", "开局：你站在车站入口，需要在限时内进入站台。");
    this.perceive();
    this.collect();
  }

  get t(): number {
    return this.world.t;
  }

  // ------------------------------------------------------------- stepping

  step() {
    if (this.status !== "running") return;
    const w = this.world;
    const activityBefore = this.player.activity.kind;
    w.t = round1(w.t + DT);

    this.npcs.step();
    w.stepPeopleAndFacilities();
    this.guards.step();
    this.creative.step(this.player);
    this.account(activityBefore);

    if (this.creative.caught) {
      const c = this.creative.caught;
      this.end("failed", `${MECHANIC_LABEL[c.mechanic]}被${c.guard}发现，判负`);
      return;
    }
    if (this.player.onPlatform) {
      this.score = w.t;
      this.end("success", null);
      return;
    }
    if (w.t >= this.settings.timeLimitSeconds - 1e-9) {
      this.end("failed", `超时：${this.settings.timeLimitSeconds} 秒内未下楼梯到达站台`);
      return;
    }

    if (this.wakeAt !== null && w.t >= this.wakeAt - 1e-9) {
      this.wakeAt = null;
      w.notifyPlayer("wait_done", "等待结束");
    }
    this.perceive();
    this.collect();
    if (this.triggers.length === 0 && this.player.activity.kind === "queued") {
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
    this.status = status;
    this.failReason = reason;
    this.recordTrail();
    this.world.log(status === "success" ? "success" : "failed", reason ?? `已下楼梯进入站台，用时 ${this.world.t} 秒`, true);
  }

  /** Attribute this step's time to what the player was doing when it began. */
  private account(kind: Person["activity"]["kind"]) {
    const tb = this.timeBreakdown;
    if (kind === "walking" || kind === "to_queue") tb.walking += DT;
    else if (kind === "queued") tb.queueing += DT;
    else if (kind === "service") tb.service += DT;
    else if (kind === "waiting") tb.waiting += DT;
    else if (kind === "creative") tb.creative += DT;
    else if (kind === "stairs") tb.stairs = (tb.stairs ?? 0) + DT;
    else if (kind === "idle") tb.idle += DT;
    if (Math.round(this.world.t * 10) % 5 === 0) this.recordTrail();
  }

  private recordTrail() {
    const point = { t: this.t, ...this.player.pos };
    if (this.trail.at(-1)?.t === this.t) this.trail[this.trail.length - 1] = point;
    else this.trail.push(point);
  }

  /** Notice status changes of facilities that are currently in view. */
  private perceive() {
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
    return buildObservation(this.world, this.guards);
  }

  /** Validate and start an action. `mechanic` is required for attempt_creative. */
  applyAction(action: AgentAction, mechanic?: CreativeMechanic): ActionResult {
    const w = this.world;
    const p = this.player;
    if (this.status !== "running") return { ok: false, text: "本局已结束" };
    // Waiting never changes the world, so it is always allowed; anything else must not
    // interrupt a service or a creative act in progress.
    if (action.type !== "wait") {
      if (p.activity.kind === "service") return { ok: false, text: "正在办理中，请等办理完成" };
      if (p.activity.kind === "creative") return { ok: false, text: "上一个行动尚未完成" };
      if (p.activity.kind === "stairs") return { ok: false, text: "正在下楼梯，请等到达站台" };
    }
    this.wakeAt = null;

    switch (action.type) {
      case "move_to": {
        const target = resolveTarget(action.target);
        if (!target) return { ok: false, text: `未知地点 ${action.target}。可用：${NAV_NODES.map((n) => n.id).join("、")}，或设施编号` };
        if (!findPath(p.pos, target.pos)) return { ok: false, text: "目标不可步行到达，保留当前动作与队列位次" };
        const left = this.leaveIfQueued();
        const err = w.walkTo(p, target.pos, target.label);
        if (err) return { ok: false, text: left + err };
        return { ok: true, text: `${left}出发前往${target.label}` };
      }
      case "join_queue": {
        const f = w.facility(action.facility);
        if (!f) return { ok: false, text: `不存在设施 ${action.facility}。可用：${FACILITIES.map((d) => d.id).join("、")}` };
        const current = w.queuePosition(p);
        if (current?.facility.def.id === action.facility) return { ok: true, text: `继续在 ${action.facility} 排队` };
        if (p.activity.kind === "to_queue" && p.activity.facility === action.facility) return { ok: true, text: `继续走向 ${action.facility} 队尾` };
        if (!findPath(p.pos, queueSlot(f.def, f.queue.length))) return { ok: false, text: "目标队列不可步行到达，保留当前动作与队列位次" };
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
      case "descend_stairs": {
        const err = w.descendStairs(p);
        return err ? { ok: false, text: err } : { ok: true, text: "开始下楼梯，约 6 秒后到达下层站台" };
      }
      case "request_cut_in":
        return { ok: false, text: "请通过 NPC 协商流程请求让位" };
      case "attempt_creative": {
        if (!mechanic) return { ok: false, text: "创造性行动尚未归类" };
        return this.creative.start(p, mechanic, action.reason);
      }
    }
  }

  private leaveIfQueued(): string {
    const q = this.world.queuePosition(this.player);
    if (!q) return "";
    this.world.removeFromQueue(this.player);
    this.player.activity = { kind: "idle" };
    return `已离开 ${q.facility.def.id} 队伍（失去位次）；`;
  }
}

function resolveTarget(id: string): { pos: Vec; label: string } | null {
  const node = nodeById(id);
  if (node) return { pos: node.pos, label: node.label };
  const f = FACILITIES.find((d) => d.id === id);
  if (f) {
    const beside = queueSlot(f, f.kind === "gate" ? 0 : 2);
    return { pos: { x: beside.x, y: beside.y + 1.2 }, label: `${f.label}附近` };
  }
  return null;
}
