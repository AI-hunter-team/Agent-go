import { createWorldV2 } from "../src/sim/worldV2";
import { Engine } from "../src/sim/engine";
import { generateWorld } from "../src/sim/worldDefinition";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { classifyByKeywords } from "../src/sim/intent";
const runs=[];
for(let seed=1;seed<=Number(process.env.WORLDGEN_SEEDS??50);seed++) {
 const d=(process.env.WORLDGEN_VERSION==="v1"?generateWorld(seed,{version:"metro-v1"}):createWorldV2(seed)),e=new Engine(seed,{},undefined,undefined,d),r=new GameRunner(e,new HeuristicAgent(),async i=>classifyByKeywords(i));const start=performance.now();await r.runToEnd();
 if(process.env.WG_DIAG)console.error(JSON.stringify({seed,breakdown:r.report().timeBreakdown,decisions:r.decisions.map(d=>({t:d.t,action:d.action?.type,target:d.action&&"facility" in d.action?d.action.facility:null,result:d.result?.text}))}));
 console.error(`seed ${seed}: ${e.status} @ ${e.t}s`);
 runs.push({seed,archetype:d.archetype,hash:d.layoutHash,status:e.status,elapsed:e.t,pos:e.player.pos,activity:e.player.activity.kind,reason:e.failReason,breakdown:r.report().timeBreakdown,realMs:Math.round(performance.now()-start)});
}
console.log(JSON.stringify({successes:runs.filter(r=>r.status==="success").length,total:runs.length,runs},null,2));
