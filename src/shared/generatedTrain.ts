import { METRO_DOOR_OFFSETS, METRO_PROFILE } from "./metro";
import type { WorldDefinition } from "./world";
import type { Vec } from "./types";

/** Geometry is shared by both the generated mesh and the simulation. */
export function generatedTrainLayout(length: number, carCount?:number) {
  const legacyCount=Math.max(1,Math.min(3,Math.floor((length-1-23.117)/23.4)+1));
  const count=carCount??legacyCount,spacing=23.4;
  if(!Number.isInteger(count)||count<1||count>6||(carCount!==undefined&&(count-1)*spacing+23.117>length))throw new RangeError("列车编组超出站台长度");
  const start = (length - (count - 1) * spacing) / 2;
  return { count, centres: Array.from({ length: count }, (_, i) => start + i * spacing), railTop: -METRO_PROFILE.floor,
    trackCentre: 7 + METRO_PROFILE.exteriorHalfWidth + METRO_PROFILE.platformGap, scale: [1, 1, 1] as [number, number, number] };
}

/** All current consumers resolve the explicit consist; older worlds retain their original cap. */
export function worldTrainLayout(d:WorldDefinition){
 const length=d.layout.platformAxis?.direction==="y"?d.layout.HEIGHT:d.layout.WIDTH;
 return generatedTrainLayout(length,d.train?.carCount);
}

export interface GeneratedTrainDoor { id: string; label: string; pos: Vec; boardingPath: Vec[]; carCentre: number; side: -1 | 1 }

/** Convert platform-local longitudinal/lateral coordinates into world coordinates. */
export function generatedPlatformPoint(definition: WorldDefinition, longitudinal: number, lateral: number): Vec {
  const axis = definition.layout.platformAxis!, centre = axis.center;
  return axis.direction === "y"
    ? { x: centre - lateral, y: longitudinal, floorId: "platform" }
    : { x: longitudinal, y: centre + lateral, floorId: "platform" };
}

export function generatedTrainDoors(definition: WorldDefinition): GeneratedTrainDoor[] {
  const axis = definition.layout.platformAxis;
  if (!axis) return [];
  const layout = worldTrainLayout(definition), result: GeneratedTrainDoor[] = [];
  for (const side of [-1, 1] as const) for (const [car, centre] of layout.centres.entries()) {
    const kind = car === 0 || car === layout.count - 1 ? "head" : "trailer";
    const direction = car === 0 ? -1 : 1;
    METRO_DOOR_OFFSETS[kind].forEach((offset, index) => {
      const longitudinal = centre + direction * offset;
      const point = (along: number, across: number) => generatedPlatformPoint(definition, along, side * across);
      const offsetAlong = longitudinal > centre ? -1.25 : 1.25;
      result.push({ id: `TRAIN_${side < 0 ? "N" : "S"}_${car + 1}_${index + 1}`,
        label: `${side < 0 ? "北侧" : "南侧"}${car + 1}号车厢车门 ${index + 1}`,
        pos: point(longitudinal, axis.halfWidth - .7), carCentre: centre, side,
        boardingPath: [point(longitudinal, layout.trackCentre - .55), point(longitudinal + offsetAlong, layout.trackCentre - .55), point(longitudinal + offsetAlong, layout.trackCentre - .32)] });
    });
  }
  return result;
}
