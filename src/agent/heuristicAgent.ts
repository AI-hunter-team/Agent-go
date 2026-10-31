import type { AgentAction, AgentTurn, DecisionResult, FacilityKind, FacilityObservation } from "../shared/types";
import { STAIRS_REACH, STAIRS_TOP } from "../sim/layout";
import type { Agent } from "./agent";

const SEARCH_ROUTE: Record<FacilityKind, string[]> = {
  tvm: ["TICKETS_C", "HALL_N", "HALL_C"],
  security: ["HALL_C", "HALL_N", "HALL_S"],
  gate: ["GATE_C", "GATE_N", "GATE_S"],
};

const TRAIT_EXTRA: Record<FacilityKind, Record<string, number>> = {
  tvm: { 行动缓慢的老人: 5 },
  security: { 携带大件行李: 10, 行动缓慢的老人: 3 },
  gate: { 行动缓慢的老人: 2, 携带大件行李: 1 },
};

/**
 * Offline rule-based agent: the default orderly behaviour, without a model. It
 * decides only from what the observation shows, like the model agent.
 */
export class HeuristicAgent implements Agent {
  readonly kind = "offline" as const;
  private searched = new Set<string>();
  private readonly switches=new Map<FacilityKind,{at:number;count:number}>();

  async decide(turn: AgentTurn): Promise<DecisionResult> {
    return { action: this.choose(turn), thinking: null, usage: null, model: null, latencyMs: 0, error: null };
  }

  async dispose() {
    this.searched.clear();
    this.switches.clear();
  }

  private choose(turn: AgentTurn): AgentAction {
    const { self, facilities, publicMap } = turn.observation;
    if(publicMap) {
      if(self.activity.includes("办理") || self.activity.startsWith("正在下楼") || self.activity.startsWith("正在乘扶梯")) return {type:"wait",seconds:20,reason:"等待当前办理或下行完成"};
      if(self.passedGate) {
        const available=turn.observation.routes ?? [];
        const options=publicMap.routes.map(r=>({...r, distance:Math.hypot(r.position.x-self.position.x,r.position.y-self.position.y), queueLength:available.find(a=>a.id===r.id)?.queueLength??0}));
        const best=options.sort((a,b)=>a.distance/1.4+a.travelSeconds+a.queueLength-b.distance/1.4-b.travelSeconds-b.queueLength)[0];
        if(self.activity.startsWith("正在候梯") || self.activity.startsWith("正在走向扶梯队尾"))return {type:"wait",seconds:20,reason:"继续候梯"};
        return best.distance<=STAIRS_REACH?{type:"traverse",route:best.id,reason:"选择预计较快的下行路线"}:{type:"move_to",target:best.node,reason:"根据公开地图直接前往下行入口"};
      }
      const kind:FacilityKind=!self.hasTicket?"tvm":!self.screened?"security":"gate";
      if(kind==="tvm"&&!self.queue&&!self.activity.startsWith("正在走向")&&!this.searched.has("generated:ticket-comparison")){
        this.searched.add("generated:ticket-comparison");return {type:"move_to",target:"TICKETS_C",reason:"到公开售票区比较现场队伍"};
      }
      if(self.queue){
        const mine=facilities.find(f=>f.id===self.queue!.facility),last=this.switches.get(kind);
        const other=facilities.filter(f=>f.kind===kind&&f.status==="open"&&f.id!==self.queue!.facility).sort((a,b)=>estimate(a,kind)-estimate(b,kind))[0];
        if(mine&&other&&(!last||last.count<2&&self.elapsed-last.at>=15)){
          const before=Math.max(0,self.queue.position-1),mid=(mine.serviceRange[0]+mine.serviceRange[1])/2;
          const remaining=(before+(mine.serving?.5:0))*mid+mine.queue.slice(0,before).reduce((n,t)=>n+(TRAIT_EXTRA[kind][t]??0),0);
          if(remaining-estimate(other,kind)>12){this.switches.set(kind,{at:self.elapsed,count:(last?.count??0)+1});return {type:"join_queue",facility:other.id,reason:"现场可见的另一队预计明显更快，接受失去当前位次的代价"};}
        }
      }
      if(self.queue || self.activity.startsWith("正在走向"))return {type:"wait",seconds:20,reason:"继续当前排队或移动，变化时重新判断"};
      const visible=facilities.filter(f=>f.kind===kind&&f.status==="open").sort((a,b)=>estimate(a,kind)-estimate(b,kind));
      const known=publicMap.facilities.filter(f=>f.kind===kind&&!facilities.some(v=>v.id===f.id&&v.status!=="open")).sort((a,b)=>Math.hypot(a.pos.x-self.position.x,a.pos.y-self.position.y)-Math.hypot(b.pos.x-self.position.x,b.pos.y-self.position.y));
      const target=visible[0]??known[0];
      return target?{type:"join_queue",facility:target.id,reason:"结合公开位置和现场可见队伍选择设施"}:{type:"wait",seconds:5,reason:"等待设施恢复"};
    }
    if (self.passedGate) {
      if (self.activity.startsWith("正在下楼梯") || self.activity.startsWith("正在乘扶梯")) return { type: "wait", seconds: 3, reason: "正在下行，等到达下层站台" };
      if (self.activity.startsWith("正在走向扶梯队尾")) return { type: "wait", seconds: 2, reason: "继续走到扶梯队尾" };
      const routes = turn.observation.routes;
      if (routes?.length) {
        const cost = (r: typeof routes[number]) => r.distance / 1.4 + r.queueLength * r.boardingInterval + r.travelSeconds;
        const best = routes.reduce((a, b) => cost(a) <= cost(b) ? a : b);
        if (best.id === "escalator" && self.activity.startsWith("正在候梯")) return { type: "wait", seconds: 2, reason: "候梯并观察是否需要改道" };
        if (Math.hypot(self.position.x - best.position.x, self.position.y - best.position.y) <= STAIRS_REACH)
          return { type: "traverse", route: best.id, reason: `选择预计较快的${best.label}` };
        return { type: "move_to", target: best.node, reason: `比较可见步行、排队和下行时间，选择${best.label}` };
      }
      if (Math.hypot(self.position.x - STAIRS_TOP.x, self.position.y - STAIRS_TOP.y) <= STAIRS_REACH) {
        return { type: "traverse", route: "stairs", reason: "已到楼梯入口，下楼到站台" };
      }
      return { type: "move_to", target: routes === undefined ? "STAIRS_TOP" : "LANDING_C", reason: "已过闸机，前往观察下行路线" };
    }
    const stage: FacilityKind = !self.hasTicket ? "tvm" : !self.screened ? "security" : "gate";
    const candidates = facilities.filter((f) => f.kind === stage && f.status === "open");

    if (self.activity.startsWith("正在") && self.activity.includes("办理")) {
      return { type: "wait", seconds: 5, reason: "正在办理，等办理完成" };
    }

    if (stage === "tvm" && !self.queue && candidates.length < 3 && !this.searched.has("tvm:TICKETS_C")) {
      this.searched.add("tvm:TICKETS_C");
      return { type: "move_to", target: "TICKETS_C", reason: "先到并排售票机前比较可见队列" };
    }

    if (self.queue) {
      const mine = candidates.find((f) => f.id === self.queue!.facility);
      if (mine) return { type: "join_queue", facility: mine.id, reason: "当前队伍仍然合适，继续排队" };
    }
    if (candidates.length > 0) {
      const best = candidates.reduce((a, b) => (estimate(a, stage) <= estimate(b, stage) ? a : b));
      return {
        type: "join_queue",
        facility: best.id,
        reason: `可见范围内 ${best.id} 预计最快（约 ${Math.round(estimate(best, stage))} 秒）`,
      };
    }
    if (self.activity.startsWith("正在走向")) {
      return { type: "wait", seconds: 3, reason: "视野内还没有合适的设施，继续前往查看" };
    }
    const next = SEARCH_ROUTE[stage].find((n) => !this.searched.has(`${stage}:${n}`));
    if (next) {
      this.searched.add(`${stage}:${next}`);
      return { type: "move_to", target: next, reason: "视野内没有可用设施，前往查看" };
    }
    this.searched.clear();
    return { type: "wait", seconds: 3, reason: "暂时没有可用设施，稍后再看" };
  }
}

function estimate(f: FacilityObservation, stage: FacilityKind): number {
  const mid = (f.serviceRange[0] + f.serviceRange[1]) / 2;
  const extra = f.queue.reduce((sum, trait) => sum + (TRAIT_EXTRA[stage][trait] ?? 0), 0);
  return (f.queueLength + (f.serving ? 0.5 : 0)) * mid + extra + f.distance / 1.4;
}
