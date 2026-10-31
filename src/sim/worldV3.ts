import type { WorldDefinition,StationLayoutType } from "../shared/world";
import { hydrateWorld,layoutHash,serializableWorld,validateWorld } from "./worldDefinition";
import { populateArchitecturalProps } from "./architecturalProps";
import { stationEntryBudgets,validateStationProportions } from "./stationProportions";
import { propDefinition } from "../shared/stationProps";
import { buildingCandidate,LAYOUT_TYPES } from "./metroV3Layouts";
import { Rng } from "./rng";
export const STATION_LENGTHS=[78,102,126,150] as const;
function assemble(source:WorldDefinition,appearanceSeed:number){
 const d=serializableWorld(source);d.layout.zoneOf=source.layout.zoneOf;d.layout.atRailing=source.layout.atRailing;
 d.props=populateArchitecturalProps(d,appearanceSeed);
 d.architecture!.groups.push({id:"daily-services",kind:"amenities",members:d.props.filter(p=>["rest","convenience","platform"].includes(p.cluster)).map(p=>p.id)});
 d.layout.solids!.push(...d.props.flatMap(p=>p.body?[p.body]:[]));
 d.layout.SIGHT_OCCLUDERS.push(...d.props.flatMap(p=>p.body&&propDefinition(p.assetId).blocksSight?[p.body]:[]));
 const errors=[...validateWorld(d),...validateStationProportions(d)];
 d.generation.entryBudgets=stationEntryBudgets(d);d.generation.emptyRouteSeconds=Math.max(...Object.values(d.generation.entryBudgets));
 if(!Number.isFinite(d.generation.emptyRouteSeconds)||d.generation.emptyRouteSeconds>90)errors.push("entrance itinerary exceeds 90s");
 d.layoutHash=layoutHash({version:"metro-v3",revision:"layouts-v1",seed:d.seed,layout:d.layout,train:d.train,architecture:d.architecture,props:d.props});
 return {d,errors};
}
/** Candidate retries change architecture only; operating and appearance draws have separate streams. */
export function createWorldV3(seed:number,appearanceSeed=seed,candidateFactory=buildingCandidate):WorldDefinition{
 if(!Number.isInteger(seed)||seed<1||seed>4294967295)throw new RangeError("世界种子须为1–4294967295的整数");
 const length=new Rng(seed).fork("v3-station-length").pick(STATION_LENGTHS),cars=STATION_LENGTHS.indexOf(length)+3;
 const type:StationLayoutType=new Rng(seed).fork("v3-layout-type").pick(LAYOUT_TYPES),reasons:string[]=[];
 for(let attempt=0;attempt<20;attempt++){
  const {d,errors}=assemble(candidateFactory(seed,length,cars,type,attempt),appearanceSeed);
  if(!errors.length){d.generation.reasons=reasons;return hydrateWorld(d);}reasons.push(...errors.map(e=>`candidate ${attempt+1}: ${e}`));
 }
 const fallback=serializableWorld(buildingCandidate(1,length,cars,"dual-ended",0));fallback.seed=seed;
 const {d,errors}=assemble(hydrateWorld(fallback),appearanceSeed);
 if(errors.length)throw new Error(`V3回退样板无效: ${errors.join(", ")}`);
 d.generation={...d.generation,attempts:20,fallback:true,reasons,requestedLayout:type,actualLayout:"dual-ended"};
 return hydrateWorld(d);
}
