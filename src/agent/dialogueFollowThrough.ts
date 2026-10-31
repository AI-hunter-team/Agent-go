import type { ActionPlan, ActionResult, AgentAction, DialogueRetryProgress, TalkGoal } from "../shared/types";
import type { Engine } from "../sim/engine";

const canonical = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");

/** Conservative recognition of an explicit refusal/rephrase condition, never inferred from a summary. */
function retryRule(instruction: string): { goal: TalkGoal; retries: number; sameNpc: boolean } | null {
  const text = instruction.normalize("NFKC");
  const refusal = /拒绝|被拒|不同意|不答应|不让|失败|refus|reject|declin/i.test(text);
  const rephrase = /(?:改|换|调整|更新).{0,8}(?:话术|说法|措辞|理由)|再.{0,4}(?:试|问|谈|交涉|沟通)|重试|重新.{0,4}(?:交涉|沟通)|rephras|retry|try again/i.test(text);
  const denied = /(?:不要|不必|无需|不用|不再|别|不能)(?:再|继续|反复|重新|再次|去|尝试|随便|随意|轻易)*(?:(?:改|换|调整|更新)[^，,。.;；!?！？\n但]{0,5}(?:话术|说法|措辞|理由)|再试|再问|再谈|重试)|(?:do not|don't|never).{0,12}(?:retry|rephras|try again)/i.test(text);
  if (!refusal || !rephrase || denied) return null;
  const goal: TalkGoal = /插队|让位|加塞|cut.*line|yield/i.test(text) ? "yield" : /要票|索票|借票|ask.*ticket/i.test(text) ? "ask_ticket" : "persuade";
  return {
    goal,
    retries: /(?:再|重试|尝试|retry).{0,5}(?:两|二|2).{0,2}(?:次|times)/i.test(text) ? 2 : 1,
    sameNpc: /同一|原来.{0,3}(?:人|对象)|原先.{0,3}(?:人|对象)|不能换人|不要换人|same (?:person|npc)/i.test(text),
  };
}

/** Tracks attempts, not NPC psychology; only public dialogue facts enter the next model turn. */
export class DialogueFollowThrough {
  private readonly rule;
  private state?: DialogueRetryProgress;

  constructor(private readonly instruction: string) { this.rule = retryRule(instruction); }

  record(result: ActionResult) {
    const dialogue = result.dialogue;
    if (!this.rule || !dialogue || dialogue.goal !== this.rule.goal) return;
    if (this.state?.status === "in_progress" && this.state.history.at(-1)?.npcId === dialogue.npcId && !dialogue.effectPending) {
      this.state.history[this.state.history.length - 1] = structuredClone(dialogue);
      this.state.status = dialogue.goalAchieved ? "completed" : "blocked";
      if (dialogue.goalAchieved) this.state.remaining = 0;
      else this.state.reason = result.text;
      return;
    }
    if (!result.ok) return;
    if (this.state?.status === "pending") {
      if (this.matches(dialogue.npcId, dialogue.goal, dialogue.message)) {
        this.state.history.push(structuredClone(dialogue));
        this.state.remaining--;
        if (dialogue.effectPending) this.state.status = "in_progress";
        else if (dialogue.goalAchieved || this.state.remaining <= 0) {
          this.state.status = "completed";
          this.state.remaining = 0;
        }
      }
    } else if (dialogue.decision === "refuse") {
      this.state = {
        instruction: this.instruction, status: "pending", npcId: dialogue.npcId, goal: dialogue.goal,
        sameNpc: this.rule.sameNpc, remaining: this.rule.retries, history: [structuredClone(dialogue)],
      };
    }
  }

  progress(engine: Engine, blockedReason?: string): DialogueRetryProgress | undefined {
    if (!this.state) return;
    const progress = structuredClone(this.state);
    if (progress.status !== "pending") return progress;
    const visible = engine.observe().people ?? [];
    const candidates = visible.filter(person => !progress.sameNpc || person.id === progress.npcId);
    const validate = (npcId: string) => engine.dialogue.validate({ op: "talk", npcId, goal: progress.goal, message: "调整后的请求" }, false);
    const available = candidates.some(person => validate(person.id) === null);
    const reason = blockedReason ?? (!available ? candidates.length ? validate(candidates[0].id) : "当前看不到可继续交涉的对象" : null);
    if (reason) { progress.status = "blocked"; progress.reason = reason; }
    return progress;
  }

  check(action: AgentAction | ActionPlan, engine: Engine): string | null {
    const progress = this.progress(engine);
    if (progress?.status !== "pending") return null;
    const reminder = `玩家要求被拒后改变话术再次尝试，尚余 ${progress.remaining} 次；请针对公开回复调整请求内容${progress.sameNpc ? `，继续向 ${progress.npcId} 交涉` : ""}，不要重复原话或直接放弃。此候选动作未执行。`;
    if ("steps" in action) {
      if (action.status !== "plan") return reminder;
      for (const [index, step] of action.steps.entries()) {
        // A reply may leave more retries pending; return control before running a suffix.
        if (step.op === "talk") return index === action.steps.length - 1 && this.matches(step.npcId, step.goal, step.message) ? null : reminder;
        if (!["approach", "take", "give", "drop"].includes(step.op)) return reminder;
      }
      return null;
    }
    if (action.type === "talk") return this.matches(action.npcId, action.goal, action.message) ? null : reminder;
    if (action.type === "request_cut_in") return this.matches(action.npcId, "yield", action.message) ? null : reminder;
    // Compound actions are checked again after interpretation, before any step executes.
    if (["act", "observe", "take", "give", "drop", "move_to"].includes(action.type)) return null;
    return reminder;
  }

  private matches(npcId: string, goal: TalkGoal, message: string) {
    const state = this.state;
    return !!state && goal === state.goal && (!state.sameNpc || npcId === state.npcId)
      && !state.history.some(previous => canonical(previous.message) === canonical(message));
  }
}
