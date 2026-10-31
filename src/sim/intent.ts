import type { CreativeClassification } from "../shared/types";
import type { ActionPlan, ItemKind, PlanStep } from "../shared/types";
import type { GuardSystem } from "./guards";
import type { World } from "./world";
import { playerCanSee } from "./observation";
import { dist } from "./geometry";
import { NAV_NODES } from "./layout";
export type IntentContext = import("../shared/interaction").BossContext;
export function buildIntentContext(world: World, guards: GuardSystem): IntentContext {
  const p = world.player!;
  return {
    self: {
      position: {
        ...p.pos
      },
      inventory: world.items.holdings(p.id).map(i => ({
        id: i.id,
        kind: i.kind
      }))
    },
    people: [...[...world.persons.values()].filter(n => !n.isPlayer && playerCanSee(p.pos, n.pos)).map(n => ({
      id: n.id,
      look: n.persona?.look.outfit ?? n.kind,
      position: {
        ...n.pos
      },
      queue: world.queuePosition(n)?.facility.def.id ?? null
    })), ...guards.guards.filter(g => playerCanSee(p.pos, g.pos)).map(g => ({
      id: g.def.id,
      look: g.def.label,
      position: {
        ...g.pos
      },
      queue: null
    }))],
    items: world.items.visibleItems(p.pos).map(i => ({
      id: i.id,
      kind: i.kind,
      position: {
        ...world.items.position(world.items.items.get(i.id)!)!
      }
    })),
    facilities: [...world.facilities.values()].filter(f => playerCanSee(p.pos, f.def.pos)).map(f => ({
      id: f.def.id,
      label: f.def.label
    }))
  };
}
const kindWords: [ItemKind, RegExp][] = [["ticket", /车票|票|ticket/i], ["coins", /零钱|硬币|coins/i], ["umbrella", /雨伞|伞|umbrella/i], ["water_bottle", /矿泉水|水瓶|瓶子|water/i], ["newspaper", /报纸|newspaper/i], ["snack", /零食|snack/i], ["backpack", /背包|backpack/i]];
const hasId = (text: string, id: string) => new RegExp(`(^|[^A-Za-z0-9_-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9_-])`).test(text);

/** Keyword fallback resolves references only against the supplied visible context. */
export function parsePlan(instruction: string, context: IntentContext): ActionPlan {
  const result = (status: ActionPlan["status"], steps: PlanStep[], reason = ""): ActionPlan => ({
    status,
    steps,
    summary: [...instruction].slice(0, 60).join(""),
    reason,
    source: "keywords"
  });
  if (typeof instruction !== "string" || !instruction.trim() || [...instruction].length > 200) return {
    status: "needs_precondition",
    steps: [],
    summary: "",
    reason: "指令需要 1–200 字",
    source: "keywords"
  };
  const clauses = instruction.split(/然后|接着|再(?=拿|给|丢|扔|抢|推|打|翻|说|等)|[;；]|and then/i).map(s => s.trim()).filter(Boolean);
  if (clauses.length > 4) return result("unsupported", [], "一次最多四步");
  const steps: PlanStep[] = [],
    inventory = [...context.self.inventory];
  let previousKind: ItemKind | undefined;
  for (const text of clauses) {
    const named = text.match(/\b[ni]\d+\b/g) ?? [];
    const known = new Set([...context.people, ...context.items, ...inventory].map(v => v.id));
    if (named.some(id => !known.has(id))) return result("needs_precondition", [], "指明的实体不在可见上下文中");
    const kind = kindWords.find(([, r]) => r.test(text))?.[0] ?? previousKind;
    const people = () => {
      const ids = context.people.filter(p => hasId(text, p.id));
      if (ids.length) return ids;
      let candidates = context.people;
      const outfit = text.match(/穿(?:着)?(.+?)(?:的|那位|乘客|人)/)?.[1];
      if (outfit) candidates = candidates.filter(p => p.look.includes(outfit));
      const queue = text.match(/在\s*([\w-]+)\s*排队/)?.[1];
      if (queue) candidates = candidates.filter(p => p.queue === queue);
      if (/保安|guard/i.test(text)) candidates = candidates.filter(p => /保安|安检员|guard/i.test(p.look));else if (/乘客/.test(text)) candidates = candidates.filter(p => !/保安|安检员|guard/i.test(p.look));
      if (/最近|nearest/i.test(text)) candidates = [...candidates].sort((a, b) => dist(context.self.position, a.position) - dist(context.self.position, b.position)).slice(0, 1);
      return candidates;
    };
    const person = people();
    const npcId = person.length === 1 ? person[0].id : null;
    const itemFrom = (list: {
      id: string;
      kind: ItemKind;
    }[]) => {
      const explicit = list.filter(i => hasId(text, i.id));
      const matches = explicit.length ? explicit : list.filter(i => i.kind === kind);
      return matches.length === 1 ? matches[0] : null;
    };
    let step: PlanStep | undefined;
    if (/翻.*闸|翻闸|逃票|jump.*gate|vault.*gate/i.test(text)) step = {
      op: "vault",
      obstacle: "gate"
    };else if (/翻.*栏杆/.test(text)) step = {
      op: "vault",
      obstacle: "railing"
    };else if (/翻.*扶梯/.test(text)) step = {
      op: "vault",
      obstacle: "escalator_side"
    };else if (/滑.*扶手/.test(text)) step = {
      op: "slide_handrail"
    };else if (/制造.*声|大喊|喊叫|敲|make noise/i.test(text)) step = {
      op: "make_noise",
      level: /大喊|大声|high/i.test(text) ? "high" : /小声|low/i.test(text) ? "low" : "mid"
    };else if (/^(?:等|等待|wait)\s*\d*/i.test(text)) step = {
      op: "wait",
      seconds: Math.max(.1, Math.min(20, Number(text.match(/\d+(?:\.\d+)?/)?.[0] ?? 1)))
    };else if (/插队|加塞|挤到前/.test(text)) {
      if (npcId) step = {
        op: "force_cut_in",
        npcId
      };
    } else if (/抢|snatch/i.test(text)) {
      if (npcId && kind) step = {
        op: "snatch",
        npcId,
        itemKind: kind
      };
    } else if (/击晕|打晕|击打|打|strike|knock/i.test(text)) {
      if (npcId) step = {
        op: "strike",
        npcId,
        aim: /击晕|打晕|knock/i.test(text) ? "knockout" : "hurt"
      };
    } else if (/推|push/i.test(text)) {
      if (npcId) step = {
        op: "push",
        npcId
      };
    } else if (/威胁|说|聊天|索要|要票|换|让位|talk|ask/i.test(text)) {
      if (npcId) {
        const offer = /交换|换|贿赂|好处/.test(text) ? inventory.find(i => hasId(text, i.id) || Boolean(kindWords.find(([kind]) => kind === i.kind)?.[1].test(text.split(/换/)[0]))) : null;
        step = {
          op: "talk",
          npcId,
          message: text,
          goal: /威胁/.test(text) ? "threaten" : /换/.test(text) ? "trade" : /贿赂|好处/.test(text) ? "bribe" : /让位/.test(text) ? "yield" : /票/.test(text) ? "ask_ticket" : "chat",
          ...(offer ? {
            offerItemId: offer.id
          } : {})
        };
      }
    } else if (/丢|扔|放下|drop|throw/i.test(text)) {
      const item = itemFrom(inventory);
      if (item) step = {
        op: "drop",
        itemId: item.id,
        mode: /扔|throw/i.test(text) ? "throw" : /放下/.test(text) ? "place" : "drop",
        ...(NAV_NODES.find(n=>hasId(text,n.id)) ? {at:{kind:"node",id:NAV_NODES.find(n=>hasId(text,n.id))!.id} as const} : npcId && /向|给|at/i.test(text) ? {
          at: {
            kind: "person",
            id: npcId
          } as const
        } : {})
      };
    } else if (/给|give/i.test(text)) {
      const item = itemFrom(inventory);
      if (item && npcId) step = {
        op: "give",
        itemId: item.id,
        toId: npcId
      };
    } else if (/拿|捡|取|take|pick/i.test(text)) {
      const item = itemFrom(context.items);
      if (item) {
        step = {
          op: "take",
          itemId: item.id
        };
        inventory.push(item);
        previousKind = item.kind;
      }
    } else if (/靠近|走向|approach/i.test(text)) {
      const node = NAV_NODES.find(n => text.includes(n.id)),
        f = context.facilities.find(f => text.includes(f.id) || text.includes(f.label));
      if (npcId) step = {
        op: "approach",
        target: {
          kind: "person",
          id: npcId
        }
      };else if (node) step = {
        op: "approach",
        target: {
          kind: "node",
          id: node.id
        }
      };else if (f) step = {
        op: "approach",
        target: {
          kind: "facility",
          id: f.id
        }
      };
    } else return result("unsupported", [], "离线解析不支持这条指令");
    if (!step) return result("needs_precondition", [], "对象或物品不唯一、不可见或未持有，请指明可见目标");
    steps.push(step);
  }
  return result("plan", steps);
}

/**
 * Offline fallback for mapping a free-text creative intent onto the closed mechanic
 * list. The server prefers the model classifier; this keeps play possible without one
 * and keeps similar wordings mapping to the same mechanic.
 */
const RULES: {
  mechanic: CreativeClassification["mechanic"];
  words: RegExp;
}[] = [{
  mechanic: "jump_gate",
  words: /翻越|翻过|跳过闸|跨过闸|越过闸|爬过|逃票|jump|vault|hop/i
}, {
  mechanic: "cut_in_line",
  words: /插队|插到|挤到前|加塞|插进|cut in|skip the line|jump the queue/i
}];
export function classifyByKeywords(intent: string): CreativeClassification {
  for (const r of RULES) {
    if (r.words.test(intent)) return {
      mechanic: r.mechanic,
      reason: "按关键词归类",
      source: "keywords"
    };
  }
  return {
    mechanic: "unsupported",
    reason: "这个车站环境里没有对应的可执行方式",
    source: "keywords"
  };
}
