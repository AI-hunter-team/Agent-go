import type { AlertChange, AlertLevel, AlertRecord, AlertSignals, ObserverRole, Percept } from "../shared/types";
import { GUARD_INITIAL, NPC_INITIAL } from "./content/alertRules";
import type { EventBus } from "./events";
import { ALERT_RULES, DT } from "./scenario";

const rank: Record<AlertLevel, number> = { none: 0, white: 1, yellow: 2, red: 3 };
const key = (a: string, b: string) => JSON.stringify([a, b]);

export class AlertSystem {
  readonly records = new Map<string, AlertRecord>();
  readonly history: AlertChange[] = [];
  private lastFactAt = new Map<string, number>();
  private facts = new Set<string>();
  constructor(readonly bus: EventBus, private role: (id: string) => ObserverRole | undefined, private now: () => number) {}

  get(observerId: string, subjectId: string): AlertRecord | undefined { return this.records.get(key(observerId, subjectId)); }
  /** Simulator-only directed response to a validated dialogue decision. */
  raiseNpc(observerId: string, subjectId: string, causeEventId: string): AlertRecord | undefined {
    if (this.role(observerId) !== "npc" || !this.bus.get(causeEventId)) return;
    const id = key(observerId,subjectId), old = this.records.get(id);
    const record: AlertRecord = { observerId, subjectId, level: "red", ring: 0, hiddenFor: 0, since: this.now(), causeEventId, reaction: null };
    if (old?.level !== "red") this.history.push({ t: this.now(), observerId, subjectId, from: old?.level ?? "none", to: "red", cause: causeEventId });
    this.records.set(id,record); return record;
  }
  step(percepts: readonly Percept[], canSee: (observerId: string, subjectId: string) => boolean, dt = DT,
    frozen: (observerId: string) => boolean = () => false): AlertSignals & { changes: AlertChange[] } {
    const changes: AlertChange[] = [];
    const upgraded = new Set<string>();
    const change = (record: AlertRecord, to: AlertLevel, cause: string) => {
      const from = record.level;
      record.level = to; record.ring = 0; record.hiddenFor = 0; record.since = this.now(); record.reaction = null;
      const entry = { t: this.now(), observerId: record.observerId, subjectId: record.subjectId, from, to, cause };
      changes.push(entry); this.history.push(entry);
    };
    for (const percept of percepts) {
      const subject = percept.attributedTo;
      const role = this.role(percept.observerId), event = this.bus.get(percept.eventId);
      if (!subject || subject === percept.observerId || !role || !event || frozen(percept.observerId) || percept.channel === "hearing") continue;
      const level = role === "npc" ? NPC_INITIAL[event.severity][percept.role === "victim" ? "victim" : "witness"]
        : percept.channel === "report" ? "yellow" : GUARD_INITIAL[event.severity];
      const id = key(percept.observerId, subject);
      let record = this.records.get(id);
      if (!record && level !== "none") {
        record = { observerId: percept.observerId, subjectId: subject, level: "none", ring: 0, hiddenFor: 0, since: this.now(), causeEventId: event.id, reaction: null };
        this.records.set(id, record);
        this.lastFactAt.set(id, this.now());
      }
      if (!record) continue;
      const fact = key(percept.observerId, event.id);
      if (!this.facts.has(fact)) { this.facts.add(fact); this.lastFactAt.set(id, this.now()); }
      if (rank[level] > rank[record.level]) {
        record.causeEventId = event.id;
        change(record, level, event.id); upgraded.add(id);
      }
    }
    for (const [id, record] of this.records) {
      if (record.level === "red" || frozen(record.observerId) || upgraded.has(id)) continue;
      const guard = this.role(record.observerId) !== "npc";
      if (canSee(record.observerId, record.subjectId)) {
        record.hiddenFor = 0;
        const fill = guard ? ALERT_RULES.guardYellowFill : record.level === "white" ? ALERT_RULES.npcWhiteFill : ALERT_RULES.npcYellowFill;
        record.ring = Math.min(1, record.ring + dt / fill);
        if (record.ring >= 1 - 1e-9) change(record, record.level === "white" ? "yellow" : "red", record.causeEventId);
      } else {
        record.hiddenFor += dt;
        const clear = guard ? ALERT_RULES.guardYellowClear : record.level === "white" ? ALERT_RULES.npcWhiteClear : ALERT_RULES.npcYellowClear;
        if (record.hiddenFor >= clear - 1e-9 && (!guard || this.now() - (this.lastFactAt.get(id) ?? 0) >= clear - 1e-9)) {
          change(record, "none", record.causeEventId);
          this.records.delete(id); this.lastFactAt.delete(id);
        }
      }
    }
    const reds = [...this.records.values()].filter((r) => r.level === "red" && this.role(r.observerId) !== "npc");
    const red = reds.find((r) => r.subjectId === "player") ?? reds[0];
    return { guardRed: red ? { guardId: red.observerId, subjectId: red.subjectId, causeEventId: red.causeEventId } : null, changes };
  }
}
