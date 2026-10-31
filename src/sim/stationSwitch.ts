import type { WorldDefinition } from "../shared/world";
import { coversRect } from "../shared/stationFootprint";
import { BLACKOUT_SWITCH } from "./layout";

/** Static switch and its walkable approach, derived without changing the recorded map. */
export function stationSwitch(definition: WorldDefinition) {
  const entrance = definition.generatorVersion !== "legacy-v0" ? definition.entrances?.[0] : undefined;
  if (!entrance) return { position: BLACKOUT_SWITCH, approach: BLACKOUT_SWITCH };
  const { bottom, inward } = entrance;
  const along = { x: -inward.y * 3, y: inward.x * 3 };
  let approach = { x: bottom.x + along.x - inward.x * .5, y: bottom.y + along.y - inward.y * .5, floorId: "concourse" };
  const areas = definition.architecture?.areas.filter(a => a.floorId === "concourse").map(a => a.bounds);
  const fits = (p: typeof approach) => !areas || coversRect({ x: p.x - .48, y: p.y - .48, w: .96, h: .96 }, areas);
  if (!fits(approach)) {
    // Narrow entry corridors put the old target on a side wall. Step toward the corridor center.
    const inset = { ...approach, x: approach.x + inward.y * .9, y: approach.y - inward.x * .9 };
    if (fits(inset)) approach = inset;
  }
  return {
    position: { x: bottom.x + along.x - inward.x * 1.6, y: bottom.y + along.y - inward.y * 1.6, floorId: "concourse" },
    approach,
  };
}
