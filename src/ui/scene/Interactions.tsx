import { displayFloor } from "../../sim/entranceGeometry";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei/web/Html";
import type { Group, Mesh } from "three";
import type { GameSession } from "../gameSession";
import { platformElevation, sampleActor } from "../presentation";
import { colors } from "./resources";
import { ITEM_DEFS } from "../../sim/content/items";
import { getSessionHeadMessage, type HeadMessageMode } from "../headMessages";

const color = {none:colors.white,white:colors.white,yellow:colors.ochre,red:colors.brick};
/** DOM billboard follows sampled poses; its ring reads simulation progress only. */
export function AlertBadge({id,session,messageMode="full",thought}:{id:string;session:GameSession;messageMode?:HeadMessageMode;thought?:"thinking"|"ready"|null}) {
  const group=useRef<Group>(null), badge=useRef<HTMLDivElement>(null), speech=useRef<HTMLDivElement>(null), text=useRef<HTMLSpanElement>(null);
  const pose=useRef({x:0,y:0,z:0,yaw:0});
  useFrame(()=>{
    const actor=sampleActor(session.presentation,id,session.alpha,pose.current);
    if(group.current)group.current.visible=!!actor&&(session.engine.world.definition.generatorVersion==="legacy-v0"||displayFloor(actor.floorId)===displayFloor(session.engine.player.pos.floorId));
    if(group.current && actor) group.current.position.set(pose.current.x,pose.current.y+(id === "player" ? 1.95 : 2.25),pose.current.z);
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
    const message=getSessionHeadMessage(session,id,messageMode,thought);
    if(speech.current) {
      speech.current.style.display=message?"flex":"none";
      if(message) {
        speech.current.dataset.kind=message.kind;
        speech.current.dataset.mode=message.text ? messageMode : "icons";
        speech.current.dataset.pending=String(message.pending);
        const label=`${id==="player"?"Agent":`NPC ${id}`} · ${message.kind==="speech"?"对话":message.pending?"思考中":"决策说明"}`;
        speech.current.setAttribute("aria-label",label);
        speech.current.title=label;
      }
    }
    if(text.current) text.current.textContent=message?.text??"";
  });
  return <group ref={group}><Html center style={{pointerEvents:"none"}} zIndexRange={[20,0]}>
    <div ref={badge} style={{display:"none",width:22,height:22,padding:5,border:"1px solid",borderRadius:"50%",boxShadow:"0 1px 4px #292d2a"}}><i style={{display:"block"}} /></div>
    <div ref={speech} data-actor-id={id} data-speaker={id==="player"?"agent":"npc"} className={`scene-message ${id==="player"?"scene-message-player":""}`} style={{display:"none"}}>
      <svg className="scene-message-speech" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z"/><path d="M6 10h10M6 14h6"/></svg>
      <svg className="scene-message-thought" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 17a5 5 0 0 1-3-9 6 6 0 0 1 11-3 5 5 0 0 1 3 9 4 4 0 0 1-5 3Z"/><circle cx="5" cy="20" r="1"/><path d="M9 10h.01M13 10h.01M17 10h.01"/></svg>
      <div className="scene-message-copy">
        <strong className="scene-message-speaker">{id==="player"?"Agent · 我的角色":`NPC · ${id}`}</strong>
        <span ref={text} />
      </div>
    </div>
  </Html></group>;
}
function ItemMarker({id,session}:{id:string;session:GameSession}) {
  const mesh=useRef<Mesh>(null);
  useFrame(()=>{
    const i=session.presentation.current.items.find(i=>i.id===id);
    if(!mesh.current) return;
    mesh.current.visible=!!i&&(session.engine.world.definition.generatorVersion==="legacy-v0"||displayFloor(i.floorId)===displayFloor(session.engine.player.pos.floorId));
    if(i) mesh.current.position.set(i.x+(i.holderId?.length? .3:0),(i.elevation ?? platformElevation(i.x)) + (i.holderId ? 1:.16),i.z);
  });
  const item=session.presentation.current.items.find(i=>i.id===id);
  return <mesh ref={mesh} name={item ? ITEM_DEFS[item.kind].label:id}><boxGeometry args={[.45,.2,.25]} /><meshStandardMaterial color={item?.kind==="ticket" ? colors.white:colors.ochre} /></mesh>;
}
export function SceneItems({session}:{session:GameSession}) {
  return <>{[...session.engine.world.items.items.keys()].map(id=><ItemMarker key={id} id={id} session={session}/>)}</>;
}
