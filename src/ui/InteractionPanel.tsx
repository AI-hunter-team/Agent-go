import type { Engine } from "../sim/engine";
import { ITEM_DEFS } from "../sim/content/items";
import { BAG_CAPACITY } from "../sim/content/items";
export function InteractionPanel({engine}:{engine:Engine}) {
  const inventory=engine.world.items.holdings("player").filter(i=>!i.used);
  const bag=inventory.some(i=>i.kind==="backpack");
  const used=inventory.filter(i=>engine.world.items.slot(i)==="bag").reduce((sum,i)=>sum+ITEM_DEFS[i.kind].size,0);
  return <section className="card" aria-label="持有物与现场反应"><h3>持有物</h3>
    <p className="small">{bag ? `背包 ${used} / ${BAG_CAPACITY}`:"未带背包"}</p>
    <ul className="plain">{inventory.map(i=><li key={i.id}>{ITEM_DEFS[i.kind].label} · {engine.world.items.slot(i)} <small>{i.id}</small></li>)}</ul>
    <details><summary>现场反应与事件链</summary>
      <p className="small muted">观战信息 · 角色只能看到人物的表现</p>
      {[...engine.alerts.records.values()].filter(a=>a.subjectId==="player" && a.level!=="none").map(a=><p key={a.observerId}>{a.observerId} · {a.level} {a.level!=="red" && `${Math.round(a.ring*100)}%`}</p>)}
      <ol>{engine.events.events.slice(-20).map(e=><li key={e.id}>{e.t.toFixed(1)}s · {e.kind} · {e.actorId??"未知来源"}{e.targetId && ` → ${e.targetId}`}{e.causeId && `（由 ${e.causeId} 引起）`}</li>)}</ol>
    </details>
  </section>;
}
