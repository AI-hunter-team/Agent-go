import type { ItemDef, ItemKind } from "../../shared/interaction";

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  ticket: { kind: "ticket", label: "单程票", size: 0, dropNoise: 0, impact: 0, value: 0.6, security: "ok", visibleWhenHeld: true },
  coins: { kind: "coins", label: "零钱", size: 0, dropNoise: 4, impact: 0, value: 0.4, security: "ok", visibleWhenHeld: true },
  umbrella: { kind: "umbrella", label: "雨伞", size: 1, dropNoise: 6, impact: 0.5, value: 0.2, security: "ok", visibleWhenHeld: true },
  water_bottle: { kind: "water_bottle", label: "矿泉水", size: 1, dropNoise: 5, impact: 0.2, value: 0.2, security: "inspect", visibleWhenHeld: true },
  can: { kind: "can", label: "空易拉罐", size: 1, dropNoise: 6, impact: 0.1, value: 0.1, security: "ok", visibleWhenHeld: true },
  newspaper: { kind: "newspaper", label: "空易拉罐（旧场景别名）", size: 1, dropNoise: 6, impact: 0.1, value: 0.1, security: "ok", visibleWhenHeld: true },
  snack: { kind: "snack", label: "零食", size: 1, dropNoise: 2, impact: 0, value: 0.3, security: "ok", visibleWhenHeld: true },
  backpack: { kind: "backpack", label: "背包", size: 0, dropNoise: 5, impact: 0.1, value: 0, security: "ok", visibleWhenHeld: true },
};
export const BAG_CAPACITY = 4;
