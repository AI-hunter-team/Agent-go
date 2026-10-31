import {readFile,writeFile} from 'node:fs/promises';
import {Engine} from '../../src/sim/engine';
import {generateWorld} from '../../src/sim/worldDefinition';
import {GameRunner} from '../../src/agent/runner';
import {HeuristicAgent} from '../../src/agent/heuristicAgent';
import {offlineClassifier} from '../../src/agent/remoteAgent';
const runs=[];
const baseline=process.env.DETAIL_BASELINE?JSON.parse(await readFile(process.env.DETAIL_BASELINE,'utf8')):null;
for(let seed=1;seed<=Number(process.env.DETAIL_SEEDS??50);seed++){
 const results=baseline?[baseline.runs.find((r:{seed:number})=>r.seed===seed).results[0]]:[];
 for(const version of (baseline?['metro-v2'] as const:['metro-v1','metro-v2'] as const)){
  const engine=new Engine(seed,{},undefined,undefined,generateWorld(seed,{version}));const runner=new GameRunner(engine,new HeuristicAgent(),offlineClassifier,{now:()=>0,runId:'detail-'+seed});
  runner.start();for(let i=0;runner.phase!=='ended'&&i<10000;i++){if(runner.pending)await runner.pending;else runner.advance(50);if(i===9999)throw new Error('未结束 '+seed+' '+version);}
  results.push({version,status:engine.status,elapsed:engine.t,hash:engine.world.definition.layoutHash});
 }
 runs.push({seed,results});console.log(seed,results.map(r=>r.status+':'+r.elapsed).join(' / '));
}
const summary={seeds:runs.length,v1:runs.filter(r=>r.results[0].status==='success').length,v2:runs.filter(r=>r.results[1].status==='success').length,runs};
await writeFile(process.env.DETAIL_OUTPUT??'station-detail-validation.json',JSON.stringify(summary,null,2));console.log(summary.v1,summary.v2);
