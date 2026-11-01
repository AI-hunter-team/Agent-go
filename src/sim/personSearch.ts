import type { AgentAction, Observation, ObservedSceneEvent, PersonQuery, PersonSearchState } from "../shared/types";
import type { World } from "./world";
import { dist } from "./geometry";
import { currentActionText, explicitPhysicalIntent } from "../shared/physicalIntent";

const itemWords: [import("../shared/types").ItemKind, RegExp][] = [["ticket",/车票|买.*票|购票/],["umbrella",/雨伞|伞/],["can",/易拉罐/],["water_bottle",/水瓶|矿泉水/],["snack",/零食/],["coins",/零钱|硬币/],["backpack",/背包/]];
/** Recognize object descriptions, not the player's own future purchase. */
export function personQuery(input: string): PersonQuery | null {
  const text=currentActionText(input).replace(/“[^”]*”|"[^"]*"/g, "");
  const purchased=/(?:刚(?:刚)?买(?:完|好|到|了)?(?:车票|票)(?:后)?(?:离开)?(?:的)?(?:乘客|顾客|旅客|人)|买(?:了|到|好|完)(?:车票|票)(?:的)?(?:乘客|顾客|旅客|人)|(?:刚)?购票(?:成功|完成|完|后)(?:后)?(?:的)?(?:乘客|顾客|旅客|人)|刚从[^，。；]{0,18}(?:售票机|买票机)[^，。；]{0,10}(?:离开|出来)(?:的)?(?:乘客|顾客|旅客|人))/;
  const gained=/(?:刚(?:刚)?(?:拿到|得到|取得|接过)[^，。；]{0,12}(?:的乘客|的顾客|的旅客|的人))/;
  const left=/(?:刚(?:刚)?(?:从[^，。；]{0,10})?(?:离队|离开[^，。；]{0,8}队伍)(?:的)?(?:乘客|顾客|旅客|人))/;
  const held=/(?:持票|拿着车票|持有车票)(?:的)?(?:乘客|顾客|旅客|人)/;
  const match=text.match(purchased) ?? text.match(gained) ?? text.match(left) ?? text.match(held);
  if(!match) return null;
  const prefix=text.slice(Math.max(0,match.index!-12),match.index);
  if(/不要|禁止|不能/.test(prefix)) return null;
  const criterion:PersonQuery["criterion"]=purchased.test(match[0])?"recent_purchase":gained.test(match[0])?"recent_item_gain":left.test(match[0])?"recent_queue_exit":"holding_item";
  const kind=itemWords.find(([,pattern])=>pattern.test(match[0]))?.[0];
  const facility=text.match(/\b(?:TVM-[123]|S[123]|G[1-5])\b/)?.[0];
  const names=[...new Set(text.match(/\b[pn]\d+\b/g)??[])];
  if(names.length>1) return null;
  return {criterion,description:match[0],...(kind?{itemKind:kind}:{}),...(facility?{facilityId:facility}:{}),...(names[0]?{personId:names[0]}:{})};
}
export interface SearchStep { state: PersonSearchState; action?: AgentAction; preparatory: boolean }

/** Shared bounded prerequisite resolver. It never reads hidden possession or hidden live positions. */
export class PersonSearch {
  readonly history: {t:number; state:PersonSearchState}[]=[];
  private dispatched=false;
  private lastSignature="";
  constructor(private world:World) {}
  get pending() { return !!this.world.personSearch && !this.dispatched; }
  private publish() {
    const state=this.world.personSearch!;
    const signature=JSON.stringify([state.phase,state.targetId,state.detail,state.evidence.map(e=>e.id)]);
    if(signature!==this.lastSignature) {this.history.push({t:this.world.t,state:structuredClone(state)});this.lastSignature=signature;}
  }
  private eligible(event:ObservedSceneEvent,query:PersonQuery) {
    if(query.personId && event.personId!==query.personId) return false;
    if(this.world.t-event.t>60 || query.facilityId && event.facilityId!==query.facilityId || query.itemKind && event.itemKind!==query.itemKind) return false;
    if(query.criterion==="recent_purchase" && event.kind!=="purchase_completed") return false;
    if(query.criterion==="recent_item_gain" && !["item_received","purchase_completed"].includes(event.kind)) return false;
    if(query.criterion==="recent_queue_exit" && event.kind!=="queue_exit") return false;
    if(query.criterion==="holding_item" && !["item_received","purchase_completed"].includes(event.kind)) return false;
    const eventIndex=this.world.observedSceneEvents.findIndex(e=>e.id===event.id);
    return !event.itemKind || !this.world.observedSceneEvents.some((later,i)=>later.personId===event.personId && later.itemKind===event.itemKind && later.t>=event.t && i>eventIndex && ["item_released","ticket_used"].includes(later.kind));
  }
  refresh(observation:Observation,executionBusy=false) {
    const state=this.world.personSearch;
    if(!state) return;
    if(this.dispatched) {
      const visible=observation.people?.find(p=>p.id===state.targetId);
      if(visible?.position) {state.lastSeenPosition={...visible.position};state.lastSeenAt=this.world.t;}
      if(state.phase==="acting"&&!executionBusy&&!this.world.player?.activity.kind.match(/walking|waiting/)) {state.phase="finished";state.detail=`对 ${state.targetId} 的本次行动已结束；是否击晕和取得物品以实际执行记录为准`;this.publish();}
      return;
    }
    if(state.phase==="expired") return;
    const visible=observation.people ?? [];
    if(state.targetId) {
      const target=visible.find(p=>p.id===state.targetId);
      const invalidated=state.evidence.some(e=>!this.eligible(e,state.query));
      if(target && !invalidated) {
        state.phase="confirmed";state.lastSeenPosition=target.position?{...target.position}:state.lastSeenPosition;state.lastSeenAt=this.world.t;
        state.detail=`已确认 ${target.id}：${state.evidence.map(e=>e.text).join("；")}；手中未展示不等于没有该物品`;
        this.publish();return;
      }
      if(invalidated) {state.targetId=undefined;state.evidence=[];state.phase="searching";state.detail="原证据已过期或目击物品离手，重新寻找";}
      else {state.phase="lost";state.detail=`${state.targetId} 已离开视野，仅保留 ${state.lastSeenAt?.toFixed(1)} 秒的最后目击位置；不读取隐藏实时位置`;}
    }
    if(this.world.t>=state.deadline) {state.phase="expired";state.detail="寻找目标已达40秒世界时间上限；没有把未知人物当作持票者";this.publish();return;}
    if(!state.targetId) {
      const candidates=this.world.observedSceneEvents.filter(e=>this.eligible(e,state.query)&&visible.some(p=>p.id===e.personId)).sort((a,b)=>b.t-a.t);
      const event=candidates[0];
      if(event) {
        const p=visible.find(p=>p.id===event.personId)!;
        state.targetId=p.id;state.evidence=[structuredClone(event)];state.phase="confirmed";state.lastSeenPosition=p.position?{...p.position}:{...event.position};state.lastSeenAt=this.world.t;
        state.detail=`根据已目击事实选定 ${p.id}：${event.text}`;
      } else if(state.query.criterion==="holding_item") {
        const p=visible.find(p=>(!state.query.personId||p.id===state.query.personId)&&p.holding.includes(state.query.itemKind ?? "ticket"));
        if(p) {
          const event:ObservedSceneEvent={id:`visible-${p.id}-${this.world.t}`,kind:"item_received",t:this.world.t,personId:p.id,position:p.position??{...this.world.player!.pos},itemKind:state.query.itemKind??"ticket",text:`当前直接看到 ${p.id} 手持 ${state.query.itemKind??"ticket"}`};
          state.targetId=p.id;state.evidence=[event];state.phase="confirmed";state.lastSeenPosition={...event.position};state.lastSeenAt=this.world.t;state.detail=event.text;
        }
      }
    }
    this.publish();
  }
  next(instruction:string,observation:Observation):SearchStep|null {
    const {FACILITIES,ITEM_SPOTS,NAV_NODES}=this.world.layout;
    const findPath=(from:import("../shared/types").Vec,to:import("../shared/types").Vec)=>this.world.navigation.findPath(from,to);
    const query=personQuery(instruction);
    if(!query) return null;
    let state=this.world.personSearch;
    if(!state || state.instruction!==instruction) {
      state={instruction,query,phase:"searching",startedAt:this.world.t,deadline:this.world.t+40,evidence:[],detail:`正在寻找“${query.description}”，不默认询问眼前乘客`};
      this.world.personSearch=state;this.dispatched=false;this.lastSignature="";
    }
    if(this.dispatched) return null;
    this.refresh(observation);
    if(state.phase==="expired") return {state:structuredClone(state),preparatory:true};
    if(state.phase==="confirmed") {
      const action:AgentAction=/^(?:观察|查看|寻找|找到)/.test(instruction) && !explicitPhysicalIntent(instruction) && !/说|问|索要|交换/.test(instruction) ? {type:"observe",targetId:state.targetId!,reason:state.detail} : {type:"act",instruction,reason:`已依据现场证据选定 ${state.targetId}，继续原指令`};
      return {state:structuredClone(state),action,preparatory:false};
    }
    let action:AgentAction;
    if(state.phase==="lost" && state.lastSeenPosition) {
      const nodes=NAV_NODES.filter(n=>findPath(this.world.player!.pos,n.pos)).sort((a,b)=>dist(a.pos,state.lastSeenPosition!)-dist(b.pos,state.lastSeenPosition!));
      const node=nodes[0];
      action=node && dist(this.world.player!.pos,node.pos)>1 ? {type:"move_to",target:node.id,reason:"前往最后目击地点附近重新观察，未追踪隐藏实时位置"} : {type:"wait",seconds:2,reason:"在最后目击区域重新观察目标"};
    } else {
      const facility=state.query.facilityId;
      const visibleWork=observation.facilities.some(f=>(facility?f.id===facility:state.query.criterion==="recent_queue_exit"||f.kind==="tvm") && (f.servingPersonId || f.people?.length));
      const goods=state.query.criterion==="recent_item_gain" && state.query.itemKind ? ITEM_SPOTS.find(s=>!s.id.startsWith("confiscated-")&&s.stock.includes(state.query.itemKind!)) : undefined;
      const viewpoint=facility && FACILITIES.some(f=>f.id===facility) ? facility : goods?.id ?? "TICKETS_C";
      const point=FACILITIES.find(f=>f.id===viewpoint)?.pos ?? ITEM_SPOTS.find(s=>s.id===viewpoint)?.pos ?? NAV_NODES.find(n=>n.id===viewpoint)!.pos;
      action=!visibleWork && dist(this.world.player!.pos,point)>1 ? {type:"move_to",target:viewpoint,reason:"前往公开设施观察点寻找符合描述的人，不自行排队买票"} : {type:"wait",seconds:2,reason:"观察正在办理/离队/交接的乘客，等待实际事件"};
    }
    return {state:structuredClone(state),action,preparatory:true};
  }
  markDispatched() {
    this.dispatched=true;const state=this.world.personSearch;
    if(state?.phase==="confirmed") {state.phase="acting";state.detail=`已选定 ${state.targetId}，原行动已开始尝试，尚未确认结果`;this.publish();}
  }
}
