import type { WorldDefinition } from "../shared/world";
import { generatedTrainDoors } from "../shared/generatedTrain";
import { PLAYER_TRAIN_DOORS, TRAIN_AISLE_X, TRAIN_CENTRE_X } from "./layout";

/** Legacy and generated stations both expose walkable approaches and controlled aisle paths. */
export function trainDoors(definition: WorldDefinition) {
  if (definition.generatorVersion !== "legacy-v0") return generatedTrainDoors(definition);
  return PLAYER_TRAIN_DOORS.map(door => ({ ...door, boardingPath: [
    { x: TRAIN_CENTRE_X - .55, y: door.pos.y },
    { x: TRAIN_CENTRE_X - .55, y: door.pos.y + 1.25 },
    { x: TRAIN_AISLE_X, y: door.pos.y + 1.25 },
  ] }));
}
