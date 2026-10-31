import type { WorldDefinition } from "../shared/world";
import { BLACKOUT_SWITCH } from "./layout";

/** Static switch and its walkable approach, derived from the entrance without changing the recorded map. */
export function stationSwitch(definition: WorldDefinition) {
  const entrance = definition.generatorVersion !== "legacy-v0" ? definition.entrances?.[0] : undefined;
  if (!entrance) return { position: BLACKOUT_SWITCH, approach: BLACKOUT_SWITCH };
  const { bottom, inward } = entrance;
  const along = { x: -inward.y * 3, y: inward.x * 3 };
  return {
    position: { x: bottom.x + along.x - inward.x * 1.6, y: bottom.y + along.y - inward.y * 1.6, floorId: "concourse" },
    approach: { x: bottom.x + along.x - inward.x * .5, y: bottom.y + along.y - inward.y * .5, floorId: "concourse" },
  };
}
