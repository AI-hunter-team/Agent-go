import type { Vec, FacilityKind } from "./types";
import type * as Legacy from "../sim/layout";
import type { GuardDef } from "../sim/scenario";
import type { Rect } from "../sim/geometry";

export type FloorId = "concourse" | "platform";
type LayoutKeys = Pick<typeof Legacy, "WIDTH" | "HEIGHT" | "SECURITY_X" | "GATE_X" | "STAIRS_X" | "PLATFORM_X" | "STAIRS_TOP" | "STAIRS_BOTTOM" | "ESCALATOR_TOP" | "ESCALATOR_APPROACH" | "ESCALATOR_BOTTOM" | "ENTRANCE" | "FACILITIES" | "PILLARS" | "ATTRACTIONS" | "SECURITY_BARRIERS" | "GATE_BARRIERS" | "SIGHT_OCCLUDERS" | "MOVE_BLOCKERS" | "NAV_NODES" | "ITEM_SPOTS" | "RAILING_X" | "RAILING_SEGMENTS" | "RAILING_APPROACHES" | "zoneOf" | "atRailing">;
export type StationLayout = { -readonly [K in keyof LayoutKeys]: LayoutKeys[K] extends number ? number : LayoutKeys[K] } & { solids?: Rect[]; openings?: Rect[]; openingBlocks?: Rect[]; platformAxis?: { direction: "x" | "y"; center: number; halfWidth: number } };
export interface WorldDescriptor { generatorVersion: "legacy-v0" | "metro-v1" | "metro-v2"; layoutHash: string }
export interface DetailPlacement { id: string; family: "entrance" | "tickets" | "security" | "gates" | "connections" | "platform" | "commercial" | "maintenance"; variant: number; yaw?:number; pos: Vec; label: string; body: Rect | null; blocksSight: boolean }
export interface EntranceDefinition {
  id: string;
  label: string;
  source: Vec & { elevation: number };
  top: Vec & { elevation: number };
  foot: Vec & { elevation: number };
  bottom: Vec & { elevation: number };
  inward: { x: number; y: number };
  width: number;
  bounds: Rect;
}
export interface WorldDefinition extends WorldDescriptor {
  props?: import("./stationProps").PropPlacement[];
  entrances?: EntranceDefinition[];
  seed: number;
  archetype: "legacy" | "central" | "side" | "dual";
  name: string;
  regions:{kind:Legacy.Zone;bounds:Rect;floorId:FloorId}[];
  theme: { accent: string; wall: string; floor: string; variant: number };
  floors: { id: FloorId; elevation: number; ceiling: number; bounds: Rect }[];
  layout: StationLayout;
  guards: GuardDef[];
  details: DetailPlacement[];
  generation: { attempts: number; fallback: boolean; reasons: string[]; emptyRouteSeconds: number };
}
export interface PublicStationMap extends WorldDescriptor {
  entrances?: EntranceDefinition[];
  name: string;
  floors: WorldDefinition["floors"];
  regions: WorldDefinition["regions"];
  itemSpots: { id:string; label:string; pos:Vec }[];
  attractions: { id:string; label:string; pos:Vec }[];
  nodes: { id: string; label: string; pos: Vec }[];
  facilities: { id: string; kind: FacilityKind; label: string; pos: Vec }[];
  routes: { id: "stairs" | "escalator"; node: string; position: Vec; travelSeconds: number }[];
}
