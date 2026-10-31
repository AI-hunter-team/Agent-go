import type { WorldDefinition } from "../shared/world";
import { hydrateWorld, layoutHash, serializableWorld, validateWorld } from "./worldDefinition";
import { createProportionedStation } from "./proportionedStation";
import { populateArchitecturalProps } from "./architecturalProps";
import { stationEntryBudgets,validateStationProportions } from "./stationProportions";
import { propDefinition } from "../shared/stationProps";
import { Rng } from "./rng";
export const STATION_LENGTHS=[78,102,126,150] as const;

/** Length selects a whole structural module, not a scale transform or a decoration draw. */
export function createWorldV3Proportions(seed:number,appearanceSeed=seed):WorldDefinition {
 const length=new Rng(seed).fork("v3-station-length").pick(STATION_LENGTHS),carCount=STATION_LENGTHS.indexOf(length)+3;
 const source=createProportionedStation(seed,length,carCount),d=serializableWorld(source),base=d.layoutHash;
 d.layout.zoneOf=source.layout.zoneOf;d.layout.atRailing=source.layout.atRailing;
 d.props=populateArchitecturalProps(d,appearanceSeed);
 d.layout.solids=[...(d.layout.solids??[]),...d.props.flatMap(p=>p.body?[p.body]:[])];
 d.layout.SIGHT_OCCLUDERS.push(...d.props.flatMap(p=>p.body&&propDefinition(p.assetId).blocksSight?[p.body]:[]));
 const errors=[...validateWorld(d),...validateStationProportions(d)];
 d.generation.entryBudgets=stationEntryBudgets(d);d.generation.emptyRouteSeconds=Math.max(...Object.values(d.generation.entryBudgets));
 if(d.generation.emptyRouteSeconds>90)errors.push("entrance itinerary exceeds 90s");
 if(errors.length)throw new Error(`V3比例约束无效: ${errors.join(", ")}`);
 d.layoutHash=layoutHash({version:"metro-v3",revision:"proportions-v1",base,train:d.train,architecture:d.architecture,props:d.props});
 return hydrateWorld(d);
}
