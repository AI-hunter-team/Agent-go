import type { AlertLevel, Severity } from "../../shared/types";

export const NPC_INITIAL: Record<Severity, { victim: AlertLevel; witness: AlertLevel }> = {
  odd: { victim: "none", witness: "white" },
  suspicious: { victim: "none", witness: "white" },
  affecting: { victim: "yellow", witness: "white" },
  danger: { victim: "red", witness: "yellow" },
  violation: { victim: "red", witness: "red" },
};
export const GUARD_INITIAL: Record<Severity, AlertLevel> = {
  odd: "none", suspicious: "yellow", affecting: "yellow", danger: "yellow", violation: "red",
};
export const REACTION_RULES = { noise: 0.1, glanceSeconds: 1.5, argueSeconds: 3, distance: 1.5, fleeDistance: 6, memoryLimit: 12, memoryChars: 40 } as const;
