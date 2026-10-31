import * as legacyLayout from "./layout";
import type { StationLayout } from "../shared/world";
import type { FacilityStatus, PassengerKind, Vec } from "../shared/types";
import { Rng } from "./rng";

import { DEFAULT_GAME_SETTINGS, resolveGameSettings, type GameSettings } from "../shared/gameSettings";

// All tunable MVP numbers live here (docs/MVP技术方案.md §5). They are starting
// values for playtesting, not confirmed product rules.

export const DT = 0.1;
export const INTERACTION_RULES = { backpackSecuritySeconds: 2, inspectItemSeconds: 2, darkSightFactor: .4, npcCutChancePerSecond: .02, npcCutFairnessMax: .25, npcCutHurryMin: .75, npcCutTimeout: 8 } as const;

export const PERCEPTION_RULES = { npcSightRange: 10, npcFovDeg: 140, shoutRadius: 8 } as const;
export const ALERT_RULES = {
  npcWhiteFill: 6, npcWhiteClear: 3, npcYellowFill: 8, npcYellowClear: 12,
  guardYellowFill: 5, guardYellowClear: 15, knockoutSeconds: 20,
} as const;

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
  blackoutSeconds: 20,
} as const;

/** Security staff deliberately have a shorter, narrower idle cone than patrol guards.
 * They are scanning their own lane, not acting as three extra station-wide sentries. */
export const SECURITY_STAFF_VISION = { range: 8, fovDeg: 85 } as const;

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
  role?: "guard" | "security_staff";
  id: string;
  label: string;
  /** One point = stationary; two = straight back-and-forth; longer routes loop. */
  route: Vec[];
  facing: number;
  speed: number;
  pauseSeconds: number;
  /** Optional role-specific idle perception. Omitted definitions use RULES. */
  sightRange?: number;
  sightFovDeg?: number;
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
    // Keep the visible naiwa body clear of the seating fixture at the south edge.
    route: [{ x: 41, y: 27 }, { x: 41, y: 23.75 }, { x: 41, y: 17 }],
    facing: -Math.PI / 2,
    speed: 0.9,
    pauseSeconds: 2,
  },
];

export const SECURITY_STAFF: GuardDef[] = [
  { id: "security-S1", label: "1号安检员", role: "security_staff", route: [{ x: 28.5, y: 3.5 }], facing: Math.PI, speed: 0.9, pauseSeconds: 0, sightRange: SECURITY_STAFF_VISION.range, sightFovDeg: SECURITY_STAFF_VISION.fovDeg },
  { id: "security-S2", label: "2号安检员", role: "security_staff", route: [{ x: 28.5, y: 12.5 }], facing: Math.PI, speed: 0.9, pauseSeconds: 0, sightRange: SECURITY_STAFF_VISION.range, sightFovDeg: SECURITY_STAFF_VISION.fovDeg },
  { id: "security-S3", label: "3号安检员", role: "security_staff", route: [{ x: 28.5, y: 26.5 }], facing: Math.PI, speed: 0.9, pauseSeconds: 0, sightRange: SECURITY_STAFF_VISION.range, sightFovDeg: SECURITY_STAFF_VISION.fovDeg },
];

/** Production balance: the middle lane remains usable, but its service still works normally. */
export const SECURITY_STAFF_BALANCED: GuardDef[] = [SECURITY_STAFF[0], SECURITY_STAFF[2]];

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
  | { t: number; type: "power"; zone: import("./layout").Zone; duration: number }
  | { t: number; type: "damage"; facility: string }
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

export function buildScenario(seed: number, input: Partial<GameSettings> = {}, layout:StationLayout=legacyLayout): Scenario {
  const settings = resolveGameSettings(input);
  const rng = new Rng(seed);
  const spawns: NpcSpawn[] = [];

  const FACILITIES=layout.FACILITIES;
  const initial=new Rng(seed).fork("initial-queues");
  const queues=layout.openings ? FACILITIES.map(f=>({facility:f.id,kinds:Array.from({length:initial.pick([0,1,2])},()=>"normal" as const)})) : INITIAL_QUEUES;
  for (const q of queues) {
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
  const security=FACILITIES.filter(f=>f.kind==="security");
  const closedSecurity=layout.openings?failures.pick(security).id:"S1", recheckSecurity=layout.openings?failures.pick(security).id:"S2";
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
        facility: closedSecurity,
        status: "closed",
        note: "临时停用",
        broadcast: layout.openings?`广播：${closedSecurity} 安检通道临时停用，请改走其他通道。`:"广播：1号安检通道临时停用，请排队乘客改走其他安检通道。",
      },
      { t: 55, type: "recheck", facility: recheckSecurity, extra: [10, 15] },
    ],
  };
}

export const STATUS_LABEL: Record<FacilityStatus, string> = {
  open: "开放",
  closed: "临时停用",
  broken: "故障",
};
