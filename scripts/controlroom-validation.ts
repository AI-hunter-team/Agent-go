import { createHash } from "node:crypto";
import { Engine } from "../src/sim/engine";
import { generateWorld } from "../src/sim/worldDefinition";
import { GameSession } from "../src/ui/gameSession";
import { HeuristicAgent } from "../src/agent/heuristicAgent";
import { GameRunner } from "../src/agent/runner";
import { offlineClassifier } from "../src/agent/remoteAgent";
import { ControlRoomState,entranceDock } from "../src/ui/scene/controlRoomLayout";
import type { GameReport } from "../src/shared/types";
const facts=(r:GameReport)=>({status:r.status,score:r.score,failReason:r.failReason,elapsed:r.elapsed,timeBreakdown:r.timeBreakdown,violations:r.violations,decisions:r.decisions.map(d=>({t:d.t,action:d.action,result:d.result})),events:r.events,trail:r.trail,items:r.items,alerts:r.alerts,worldEvents:r.worldEvents,hash:r.world?.layoutHash});
const digest=(r:GameReport)=>createHash("sha256").update(JSON.stringify(facts(r))).digest("hex");
const runs=[];
async function drain(runner:GameRunner,label:string){
  runner.start();
  for(let iteration=0;runner.phase!=="ended"&&iteration<10000;iteration++){
    if(runner.pending)await runner.pending;else runner.advance(50);
    if(iteration===9999)throw new Error(`${label}: simulator did not finish: ${runner.phase} at ${runner.engine.t}`);
  }
}
for(let seed=1;seed<=Number(process.env.CONTROLROOM_SEEDS??50);seed++){
  console.error(`seed ${seed}: baseline`);
  const options={now:()=>0,runId:`controlroom-validation-${seed}`};
  const baseline=new GameRunner(new Engine(seed,{},undefined,undefined,generateWorld(seed)),new HeuristicAgent(),offlineClassifier,options);await drain(baseline,`baseline ${seed}`);
  console.error(`seed ${seed}: prepared`);
  const session=new GameSession(seed,{},undefined,true),engine=session.engine,intro=new ControlRoomState(),dock=entranceDock(engine.world.definition);
  for(let frame=0;frame<481;frame++)intro.update("launch",1/60,true,false,dock,false);
  if(engine.t!==0)throw new Error(`seed ${seed}: cinematic advanced simulation`);
  session.startPrepared(new HeuristicAgent(),offlineClassifier,options);await drain(session.runner!,`prepared ${seed}`);
  const a=baseline.report(),b=session.runner!.report(),same=digest(a)===digest(b);if(!same)throw new Error(`seed ${seed}: decisions, trajectories or world facts differ`);
  runs.push({seed,archetype:engine.world.definition.archetype,hash:engine.world.definition.layoutHash,status:engine.status,elapsed:engine.t,digest:digest(b),same});
  console.error(`seed ${seed}: ${engine.status} @ ${engine.t}s / identical`);
}
console.log(JSON.stringify({total:runs.length,successes:runs.filter(r=>r.status==="success").length,identical:runs.filter(r=>r.same).length,runs},null,2));
