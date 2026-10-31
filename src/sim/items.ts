import type { ActionResult, Item, ItemKind, ItemLocation, ItemObservation, ItemTransfer, Vec } from "../shared/types";
import { BAG_CAPACITY, ITEM_DEFS } from "./content/items";
import { dist, lineOfSight } from "./geometry";
import { ITEM_SPOTS, SIGHT_OCCLUDERS } from "./layout";
import { RULES } from "./scenario";

/** Possession and legal ownership are separate; all movement is recorded here. */
export class ItemSystem {
  readonly items = new Map<string, Item>();
  readonly transfers: ItemTransfer[] = [];
  private nextId = 1;
  constructor(private person: (id: string) => { pos: Vec } | undefined, private now: () => number) {}

  spawn(kind: ItemKind, location: ItemLocation, ownerId: string | null): Item {
    const item: Item = { id: `i${this.nextId}`, kind, location: structuredClone(location), ownerId };
    const error = this.validate(item, location);
    if (error) throw new Error(error);
    this.nextId++;
    this.items.set(item.id, item);
    this.record(item, "spawn", this.where(location), "spawn");
    return item;
  }
  move(itemId: string, to: ItemLocation, how = "move"): ActionResult {
    const item = this.items.get(itemId);
    if (!item) return { ok: false, text: "物品不存在" };
    const error = this.validate(item, to);
    if (error) return { ok: false, text: error };
    const from = structuredClone(item.location);
    const children = item.kind === "backpack" && from.type === "held"
      ? this.holdings(from.personId).filter((i) => i.id !== item.id && i.location.type === "held" && i.location.slot === "bag") : [];
    item.location = structuredClone(to);
    this.record(item, this.where(from), this.where(to), how);
    for (const child of children) this.move(child.id, { type: "container", containerId: item.id }, how);
    return { ok: true, text: `已移动${ITEM_DEFS[item.kind].label}` };
  }
  holdings(personId: string): Item[] { return [...this.items.values()].filter((i) => this.holderId(i) === personId); }
  /** Roll back both possession and audit records if any part of a trade fails. */
  moveMany(moves: { itemId: string; to: ItemLocation }[], how = "trade"): ActionResult {
    if (new Set(moves.map((m) => m.itemId)).size !== moves.length) return { ok: false, text: "重复物品" };
    const shadow = new ItemSystem(this.person,this.now);
    for (const item of this.items.values()) shadow.items.set(item.id,structuredClone(item));
    // Stage outgoing items in the shadow only, freeing both parties' slots before
    // checking incoming goods. Backpack children stay attached through move().
    for (const move of moves) {
      const item=shadow.items.get(move.itemId), pos=item?shadow.position(item):null;
      if (!item || !pos) return {ok:false,text:"物品不存在或位置无效"};
      const staged=shadow.move(item.id,{type:"ground",pos},how); if(!staged.ok) return staged;
    }
    for (const move of moves) { const result=shadow.move(move.itemId,move.to,how); if(!result.ok) return result; }
    for (const item of this.items.values()) {
      const next=shadow.items.get(item.id)!;
      if(JSON.stringify(item.location)===JSON.stringify(next.location)) continue;
      const from=this.where(item.location); item.location=structuredClone(next.location);
      this.record(item,from,this.where(item.location),how);
    }
    return { ok: true, text: "交易完成" };
  }
  canMove(itemId: string, to: ItemLocation): boolean { const item = this.items.get(itemId); return Boolean(item && !this.validate(item,to)); }
  holderId(item: Item): string | null {
    if (item.location.type === "held") return item.location.personId;
    if (item.location.type === "container") {
      const bag = this.items.get(item.location.containerId);
      return bag?.location.type === "held" ? bag.location.personId : null;
    }
    return null;
  }
  slot(item: Item): "pocket" | "hand" | "bag" { return item.location.type === "held" ? item.location.slot : "bag"; }
  bag(personId: string) { return this.holdings(personId).find((i) => i.kind === "backpack"); }
  bagUsed(personId: string): number {
    return this.holdings(personId).filter((i) => i.kind !== "backpack" && this.slot(i) === "bag").reduce((n, i) => n + ITEM_DEFS[i.kind].size, 0);
  }
  hasValidTicket(personId: string): boolean { return this.holdings(personId).some((i) => i.kind === "ticket" && !i.used); }
  useTicket(personId: string): boolean {
    const item = this.holdings(personId).find((i) => i.kind === "ticket" && !i.used);
    if (!item) return false;
    item.used = true;
    this.record(item, this.where(item.location), this.where(item.location), "used");
    return true;
  }
  position(item: Item): Vec | null {
    const loc = item.location;
    if (loc.type === "ground") return loc.pos;
    if (loc.type === "held") return this.person(loc.personId)?.pos ?? null;
    if (loc.type === "spot") return ITEM_SPOTS.find((s) => s.id === loc.spotId)?.pos ?? null;
    const bag = this.items.get(loc.containerId);
    return bag && bag.location.type !== "container" ? this.position(bag) : null;
  }
  visibleItems(from: Vec, lightAt: (pos: Vec) => number = () => 1): ItemObservation[] {
    return [...this.items.values()].filter((i) => i.location.type === "ground" || i.location.type === "spot").flatMap((i) => {
      const pos = this.position(i);
      return pos && dist(from, pos) <= RULES.visionRange * Math.min(lightAt(from),lightAt(pos)) && lineOfSight(from, pos, SIGHT_OCCLUDERS)
        ? [{ id: i.id, kind: i.kind, where: this.where(i.location), distance: Math.round(dist(from, pos) * 10) / 10 }] : [];
    });
  }
  private validate(item: Item, to: ItemLocation): string | null {
    if (to.type === "ground") return Number.isFinite(to.pos.x) && Number.isFinite(to.pos.y) ? null : "无效位置";
    if (to.type === "spot") return ITEM_SPOTS.some((s) => s.id === to.spotId) ? null : "未知取物点";
    const def = ITEM_DEFS[item.kind];
    if (to.type === "container") {
      const bag = this.items.get(to.containerId);
      if (!bag || bag.kind !== "backpack" || item.kind === "backpack") return "只能把物品放入背包，背包不能嵌套";
      const children = [...this.items.values()].filter((i) => i.id !== item.id && i.location.type === "container" && i.location.containerId === bag.id);
      const direct = bag.location.type === "held" ? this.holdings(bag.location.personId).filter((i) => i.id !== item.id && i.kind !== "backpack" && i.location.type === "held" && i.location.slot === "bag") : [];
      return [...children, ...direct].reduce((n, i) => n + ITEM_DEFS[i.kind].size, 0) + def.size <= BAG_CAPACITY ? null : "背包容量不足";
    }
    if (!this.person(to.personId)) return "持有人不存在";
    const others = this.holdings(to.personId).filter((i) => i.id !== item.id);
    if (to.slot === "hand" && others.filter((i) => this.slot(i) === "hand").length >= 2) return "双手已满";
    if (item.kind === "backpack") {
      if (others.some((i) => i.kind === "backpack")) return "已携带背包";
      return to.slot === "bag" || to.slot === "hand" ? null : "背包不能放入口袋";
    }
    if (to.slot === "pocket" && def.size !== 0) return "此物品不能放入口袋";
    if (to.slot === "bag") {
      if (!this.bag(to.personId)) return "没有背包";
      if (others.filter((i) => i.kind !== "backpack" && this.slot(i) === "bag").reduce((n, i) => n + ITEM_DEFS[i.kind].size, 0) + def.size > BAG_CAPACITY) return "背包容量不足";
    }
    return null;
  }
  private where(loc: ItemLocation): string {
    if (loc.type === "held") return `${loc.personId}:${loc.slot}`;
    if (loc.type === "ground") return `ground:${loc.pos.x},${loc.pos.y}`;
    return loc.type === "spot" ? loc.spotId : `container:${loc.containerId}`;
  }
  private record(item: Item, from: string, to: string, how: string) {
    this.transfers.push({ t: this.now(), itemId: item.id, kind: item.kind, from, to, how });
  }
}
