import type { World, Person } from "./world";
import type { StationConnector } from "../shared/world";
/** Explicit IDs never silently select another connector. No hidden queue state is used. */
export function selectConnector(world:World,p:Person,kind:StationConnector["kind"],id?:string):StationConnector|undefined {
 const all=world.definition.connectors?.filter(c=>c.kind===kind)??[];
 if(id)return all.find(c=>c.id===id && c.from.floorId===(p.pos.floorId??"concourse"));
 return all.map(c=>{const path=world.navigation.findPath(p.pos,c.approach);return {c,d:path?world.navigation.pathLength(p.pos,path):Infinity};})
 .filter(v=>Number.isFinite(v.d)).sort((a,b)=>a.d-b.d||a.c.id.localeCompare(b.c.id))[0]?.c;
}
export function actorConnector(world:World,p:Person,kind:StationConnector["kind"]){
 const bound=world.definition.connectors?.find(c=>c.id===p.transitConnectorId);
 const active=bound&&(p.pos.floorId?.startsWith("transit:")||["escalator_queue","to_escalator"].includes(p.activity.kind)||Math.hypot(p.pos.x-bound.from.x,p.pos.y-bound.from.y)<3)?bound:undefined;
 return (active?.kind===kind?active:world.definition.connectors?.find(c=>c.groupId===active?.groupId&&c.kind===kind))??selectConnector(world,p,kind);
}
