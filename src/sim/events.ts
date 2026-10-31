import type { OngoingAct, WorldEvent } from "../shared/interaction";

export class EventBus {
  readonly events: WorldEvent[] = [];
  readonly ongoing = new Map<string, OngoingAct>();
  private frame: WorldEvent[] = [];
  private byId = new Map<string, WorldEvent>();
  private nextId = 1;

  emit(input: Omit<WorldEvent, "id">): WorldEvent {
    const event = structuredClone({ ...input, id: `e${this.nextId++}` });
    this.events.push(event);
    this.frame.push(event);
    this.byId.set(event.id, event);
    return event;
  }
  get(id: string): WorldEvent | undefined { return this.byId.get(id); }
  beginAct(act: OngoingAct) {
    const event = this.get(act.eventId);
    if (!event || event.actorId !== act.actorId || event.kind !== act.kind) throw new Error("活动行为必须关联同一执行者的已登记事件");
    this.ongoing.set(act.actorId, structuredClone(act));
  }
  endAct(actorId: string) { this.ongoing.delete(actorId); }
  drainFrame(): WorldEvent[] { const frame = this.frame; this.frame = []; return frame; }
}
