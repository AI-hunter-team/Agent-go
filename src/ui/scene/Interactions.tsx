import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei/web/Html";
import type { Group, Mesh } from "three";
import type { GameSession } from "../gameSession";
import { platformElevation, sampleActor } from "../presentation";
import { colors } from "./resources";
import { ITEM_DEFS } from "../../sim/content/items";

const color = {none:colors.white,white:colors.white,yellow:colors.ochre,red:colors.brick};
/** DOM billboard follows sampled poses; its ring reads simulation progress only. */
export function AlertBadge({id,session}:{id:string;session:GameSession}) {
  const group=useRef<Group>(null), badge=useRef<HTMLDivElement>(null), speech=useRef<HTMLDivElement>(null);
  const pose=useRef({x:0,y:0,z:0,yaw:0});
  useFrame(()=>{
    const actor=sampleActor(session.presentation,id,session.alpha,pose.current);
    if(group.current && actor) group.current.position.set(pose.current.x,pose.current.y+2.25,pose.current.z);
    const record=session.presentation.current.alerts.find(a=>a.observerId===id);
    if(badge.current) {
      badge.current.style.display=record ? "block":"none";
      if(record) {
        badge.current.style.background=record.level === "red" ? color.red : `conic-gradient(${color[record.level]} ${Math.min(1,record.ring)*360}deg, #464b45 0deg)`;
        badge.current.style.borderColor=color[record.level];
        badge.current.title=`${id} ${record.level} ${Math.round(record.ring*100)}%`;
        badge.current.setAttribute("aria-label",badge.current.title);
        badge.current.firstElementChild?.setAttribute("style",`background:${color[record.level]};width:8px;height:8px;border-radius:50%`);
      }
    }
    const line=[...session.presentation.current.speech].reverse().find(s=>s.speakerId===id);
    if(speech.current) {speech.current.style.display=line?"block":"none";speech.current.textContent=line?.text??"";}
  });
  return <group ref={group}><Html center style={{pointerEvents:"none"}} zIndexRange={[20,0]}>
    <div ref={badge} style={{display:"none",width:22,height:22,padding:5,border:"1px solid",borderRadius:"50%",boxShadow:"0 1px 4px #292d2a"}}><i style={{display:"block"}} /></div>
    <div ref={speech} style={{display:"none",position:"absolute",bottom:30,left:-60,width:150,padding:8,borderRadius:6,background:colors.white,color:colors.ink,fontSize:12,lineHeight:1.4}} />
  </Html></group>;
}
function ItemMarker({id,session}:{id:string;session:GameSession}) {
  const mesh=useRef<Mesh>(null);
  useFrame(()=>{
    const i=session.presentation.current.items.find(i=>i.id===id);
    if(!mesh.current) return;
    mesh.current.visible=!!i;
    if(i) mesh.current.position.set(i.x+(i.holderId?.length? .3:0),platformElevation(i.x) + (i.holderId ? 1:.16),i.z);
  });
  const item=session.presentation.current.items.find(i=>i.id===id);
  return <mesh ref={mesh} name={item ? ITEM_DEFS[item.kind].label:id}><boxGeometry args={[.45,.2,.25]} /><meshStandardMaterial color={item?.kind==="ticket" ? colors.white:colors.ochre} /></mesh>;
}
export function SceneItems({session}:{session:GameSession}) {
  return <>{[...session.engine.world.items.items.keys()].map(id=><ItemMarker key={id} id={id} session={session}/>)}</>;
}
