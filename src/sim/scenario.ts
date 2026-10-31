import type { FacilityStatus, PassengerKind, Vec } from "../shared/types";
import { Rng } from "./rng";
import { FACILITIES } from "./layout";
import { DEFAULT_GAME_SETTINGS, resolveGameSettings, type GameSettings } from "../shared/gameSettings";

// All tunable MVP numbers live here (docs/MVP技术方案.md §5). They are starting
// values for playtesting, not confirmed product rules.

export const DT = 0.1;

export const PERCEPTION_RULES = { npcSightRange: 10, npcFovDeg: 140, shoutRadius: 8 } as const;

export const RULES = {
  timeLimit: DEFAULT_GAME_SETTINGS.timeLimitSeconds,
  visionRange: 12,
  guardRange: 12,
  guardFovDeg: 110,
  complaintRadius: 10,
  attentionSeconds: 3,
  periodicCheckSeconds: 20,
  broadcastRadius: 12,
  cutInDistance: 3,
  cutInSeconds: 1.5,
  jumpGateDistance: 1.7,
  jumpGateSeconds: 2.5,
  maxWaitSeconds: 20,
} as const;

export const DECISION_LIMITS = {
  maxDecisions: 60,
  maxConsecutiveFailures: 3,
  fallbackWaitSeconds: 2,
} as const;

export interface PassengerProfile {
  label: string;
  speed: number;
  tvm: [number, number];
  security: [number, number];
  gate: [number, number];
  /** Visible trait shown in observations; null = nothing notable. */
  trait: string | null;
}

export const PROFILES: Record<PassengerKind, PassengerProfile> = {
  normal: { label: "普通乘客", speed: 1.3, tvm: [6, 9], security: [5, 8], gate: [1.5, 2.5], trait: null },
  elderly: { label: "老人", speed: 0.8, tvm: [10, 16], security: [8, 12], gate: [3, 5], trait: "行动缓慢的老人" },
  luggage: { label: "带行李乘客", speed: 1.1, tvm: [7, 10], security: [14, 20], gate: [3, 4], trait: "携带大件行李" },
  hurried: { label: "赶时间乘客", speed: 1.7, tvm: [4, 6], security: [4, 6], gate: [1, 1.5], trait: "步伐很快" },
  player: { label: "玩家角色", speed: 1.4, tvm: [6, 9], security: [5, 8], gate: [1.5, 2.5], trait: null },
};

/** Service-time multiplier per facility (public information, "通道效率"). */
export const FACILITY_MULTIPLIER: Record<string, number> = { S1: 0.8, S2: 1.0, S3: 1.4 };

export const multiplierOf = (facilityId: string) => FACILITY_MULTIPLIER[facilityId] ?? 1;

export interface GuardDef {
  id: string;
  label: string;
  /** One point = stationary; two = straight back-and-forth; longer routes loop. */
  route: Vec[];
  facing: number;
  speed: number;
  pauseSeconds: number;
}

export const GUARDS: GuardDef[] = [
  {
    id: "guard-A", label: "闸机北侧保安",
    route: [{ x: 41, y: 3 }, { x: 41, y: 13 }],
    facing: Math.PI / 2, speed: 0.9, pauseSeconds: 2,
  },
  {
    id: "guard-B",
    label: "闸机南侧保安",
    route: [{ x: 41, y: 27 }, { x: 41, y: 17 }],
    facing: -Math.PI / 2,
    speed: 0.9,
    pauseSeconds: 2,
  },
];

export interface NpcSpawn {
  t: number;
  kind: Exclude<PassengerKind, "player">;
  hasCard: boolean;
  irritable: boolean;
  /** Pre-placed in this queue at t=0 instead of walking in from the entrance. */
  startQueue: string | null;
}

export type ScriptedEvent =
  | { t: number; type: "status"; facility: string; status: FacilityStatus; note: string; broadcast: string | null }
  | { t: number; type: "recheck"; facility: string; extra: [number, number] };

export interface Scenario {
  seed: number;
  initialStatus: Record<string, FacilityStatus>;
  spawns: NpcSpawn[];
  events: ScriptedEvent[];
}

/** Starting crowd: who is already queueing when the run begins. */
const INITIAL_QUEUES: { facility: string; kinds: NpcSpawn["kind"][] }[] = [
  { facility: "TVM-1", kinds: ["normal"] },
  { facility: "TVM-2", kinds: ["normal", "elderly", "normal", "normal"] },
  { facility: "S1", kinds: ["normal", "hurried", "normal"] },
  { facility: "S2", kinds: ["normal", "luggage", "normal", "normal", "luggage"] },
  { facility: "S3", kinds: ["normal", "normal"] },
  { facility: "G2", kinds: ["normal", "normal"] },
  { facility: "G4", kinds: ["elderly", "normal", "normal"] },
];

export function buildScenario(seed: number, input: Partial<GameSettings> = {}): Scenario {
  const settings = resolveGameSettings(input);
  const rng = new Rng(seed);
  const spawns: NpcSpawn[] = [];

  for (const q of INITIAL_QUEUES) {
    for (const kind of q.kinds) {
      const isTvm = q.facility.startsWith("TVM");
      spawns.push({ t: 0, kind, hasCard: !isTvm, irritable: rng.chance(0.5), startQueue: q.facility });
    }
  }

  // A steady flow of passengers through the entrance during the first 90 seconds.
  const kinds: NpcSpawn["kind"][] = ["normal", "normal", "normal", "elderly", "luggage", "hurried"];
  let t = 2;
  while (t < 90) {
    spawns.push({ t, kind: rng.pick(kinds), hasCard: rng.chance(0.65), irritable: rng.chance(0.4), startQueue: null });
    t += rng.range(2, 5);
  }

  // Keep failures reproducible and independent of passenger/crowd RNG draws.
  const failures = new Rng(seed ^ 0x71f4ac39);
  const brokenGate = failures.pick(FACILITIES.filter((f) => f.kind === "gate"));
  const brokenTvm = failures.pick(FACILITIES.filter((f) => f.kind === "tvm"));
  const tvmFailureTime = 20 + Math.floor(failures.range(0, 21));
  const initialStatus: Record<string, FacilityStatus> = { [brokenGate.id]: "broken" };
  const crowd = new Rng(seed ^ 0x4d43f9a1);
  for (const f of FACILITIES) {
    if (initialStatus[f.id] && initialStatus[f.id] !== "open") continue;
    for (let i = 0; i < settings.extraQueuePeople; i++) {
      spawns.push({ t: 0, kind: crowd.pick(kinds), hasCard: f.kind !== "tvm", irritable: crowd.chance(0.5), startQueue: f.id });
    }
  }

  return {
    seed,
    initialStatus,
    // A gate that starts broken must not receive the original starting crowd either.
    spawns: spawns.filter((s) => !s.startQueue || !initialStatus[s.startQueue] || initialStatus[s.startQueue] === "open"),
    events: [
      { t: tvmFailureTime, type: "status", facility: brokenTvm.id, status: "broken", note: "故障停用", broadcast: null },
      {
        t: 40,
        type: "status",
        facility: "S1",
        status: "closed",
        note: "临时停用",
        broadcast: "广播：1号安检通道临时停用，请排队乘客改走其他安检通道。",
      },
      { t: 55, type: "recheck", facility: "S2", extra: [10, 15] },
    ],
  };
}

export const STATUS_LABEL: Record<FacilityStatus, string> = {
  open: "开放",
  closed: "临时停用",
  broken: "故障",
};
