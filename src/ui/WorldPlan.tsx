import { memo, useMemo } from "react";
import type { WorldDefinition } from "../shared/world";
import { stationAtlas, floorViewport } from "./stationMap";
import { StationMap } from "./FloorMap";
export type PreviewFloor="concourse"|"platform";
/** Creation and runtime share the same immutable floor geometry. */
export const WorldPlan=memo(function WorldPlan({world,floor}:{world:WorldDefinition;floor:PreviewFloor}){
 const atlas=useMemo(()=>stationAtlas(world),[world]);
 const level=atlas.floors.find(f=>f.id===floor)??atlas.floors[0];
 const view=floorViewport(level,{x:0,y:0,floorId:level.id},480,320,true);
 return <StationMap atlas={atlas} floor={level} view={view} width={480} height={320} expanded/>;
});
