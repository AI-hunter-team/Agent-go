import type { CutInDialogueRequest } from "../shared/types";
import type { World } from "./world";
import { dist } from "./geometry";
import { findPath } from "./nav";
import { playerCanSee } from "./observation";
import { PROFILES, RULES } from "./scenario";
import { temperamentDescription } from "./persona";

export function prepareCutIn(world: World, npcId: string, message: string, history: CutInDialogueRequest["history"]):
  { ok: true; request: CutInDialogueRequest } | { ok: false; text: string } {
  const p = world.player;
  if (!p || ["service", "creative", "stairs", "done"].includes(p.activity.kind)) return { ok: false, text: "当前行动未完成，不能沟通插队" };
  if (!message.trim() || [...message].length > 200) return { ok: false, text: "请提供 1–200 字的具体插队请求" };
  if (history.length >= 3) return { ok: false, text: "与这位乘客的三轮沟通已结束，请选择其他行动" };
  const npc = world.persons.get(npcId);
  const q = npc && !npc.isPlayer ? world.queuePosition(npc) : null;
  if (!npc || !q || q.facility.status !== "open") return { ok: false, text: "这位乘客当前没有在开放的设施排队" };
  if (dist(p.pos, npc.pos) > RULES.cutInDistance || !playerCanSee(p.pos, npc.pos) || !findPath(p.pos, npc.pos)) {
    return { ok: false, text: `请先走到可见且可达的乘客附近（${RULES.cutInDistance} 米内）再沟通` };
  }
  const mine = world.queuePosition(p);
  if (mine?.facility === q.facility && mine.index <= q.index) return { ok: false, text: "这位乘客在你后面，无需向他请求插队" };
  const temperament = npc.persona ? temperamentDescription(npc.persona) : npc.irritable ? "急躁，重视排队公平；不会因为礼貌措辞就轻易让位" :
    npc.kind === "hurried" ? "自己也赶时间，会权衡对方的紧急程度和自己的损失" :
      npc.kind === "elderly" ? "谨慎，重视秩序与安全，也会体谅合理的紧急情况" : "平和，愿意听解释，但有边界，也在意排队公平";
  return { ok: true, request: {
    npc: { id: npc.id, trait: PROFILES[npc.kind].trait ?? "普通乘客", temperament,
      facility: q.facility.def.id, queuePosition: q.index + 1, queueLength: q.facility.queue.length },
    message, history: structuredClone(history),
  } };
}
