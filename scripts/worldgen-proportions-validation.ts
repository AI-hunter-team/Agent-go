import { generateWorld,validateWorld } from "../src/sim/worldDefinition";
import { validateStationProportions } from "../src/sim/stationProportions";
import { worldTrainLayout,generatedTrainDoors } from "../src/shared/generatedTrain";
const runs:{seed:number;layoutType?:string;length:number;carCount:number;doors:number;hash:string;attempts:number;fallback:boolean;entryBudgets:Record<string,number>;errors:string[]}[]=[];
for(let seed=1;seed<=Number(process.env.WORLDGEN_SEEDS??1000);seed++){
 const d=generateWorld(seed,{version:"metro-v3"}),train=worldTrainLayout(d),errors=[...validateWorld(d),...validateStationProportions(d)];
 const entryBudgets=d.generation.entryBudgets!;
 if(Object.values(entryBudgets).some(t=>!Number.isFinite(t)||t>90))errors.push("entry budget");
 const record={seed,layoutType:d.architecture?.layoutType,length:d.layout.WIDTH,carCount:train.count,doors:generatedTrainDoors(d).length,hash:d.layoutHash,attempts:d.generation.attempts,fallback:d.generation.fallback,entryBudgets,errors};
 runs.push(record);if(seed%100===0)console.error(`validated ${seed}`);
}
console.log(JSON.stringify({total:runs.length,invalid:runs.filter(r=>r.errors.length).length,fallbacks:runs.filter(r=>r.fallback).length,layoutCounts:Object.fromEntries(["dual-ended","offset-entry","open-hall"].map(type=>[type,runs.filter(r=>r.layoutType===type).length])),lengthCounts:Object.fromEntries([78,102,126,150].map(length=>[length,runs.filter(r=>r.length===length).length])),runs},null,2));
if(runs.some(r=>r.errors.length))process.exitCode=1;
