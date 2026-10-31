import type { NormalizedGuidance } from "./types";

const CUT_IN = /插队|加塞|插到.{0,6}前|挤到.{0,6}前|排到.{0,8}前面|请求.{0,6}让位|让我先|让你先|request_cut_in|cut\s+in(?:\s+(?:the\s+)?line)?|skip\s+the\s+line|jump\s+the\s+queue/iu;
const PERSON = /npc|乘客|旅客|路人|工作人员|售票员|保安|别人|他人|其他人|(?:前面|前方|周围|附近|旁边)(?:的)?人/iu;
const HELP = /求助|请求.{0,6}帮助|寻求.{0,6}帮助|帮(?:个)?忙|帮(?:我|你|角色)|请.{0,12}帮助|商量|协商|沟通|请求.{0,8}(?:让位|先)|问.{0,12}(?:让我先|让你先)|ask.{0,20}help|seek.{0,12}help|negotiate/iu;
const SOCIAL_IDEA = /求助|商量|协商|通融|让位|让行/u;
const NEGATION = "(?:不要|(?<![特分])别(?![人的])|禁止|不许|不准|不得|不允许|不需要|无需|不必|不用|没必要|避免|(?<![能可要])不(?:可以|能|会|去|再|想|要|打算|准备|考虑)?)";
const CUT_ACTION = "(?:插队|加塞|request_cut_in|求助|商量|协商|通融|让位|让行)";
const DENY_DIRECT = new RegExp(`${NEGATION}(?:主动|自行|擅自|尝试|去|再|进行|采用|使用|选择|任何|考虑|想)*${CUT_ACTION}`, "iu");
const DENY_SOCIAL = new RegExp(`${NEGATION}(?:主动|自行|擅自|尝试|去|再)*(?:向|找|和|跟|与|请|问)[^，,。.!！？?；;]{0,20}(?:求助|帮助|帮(?:个)?忙|帮我|帮你|商量|协商|沟通|通融|让位|让行|让我先|让你先)`, "iu");
const DENY_ENGLISH = /do\s+not|don't|never|must\s+not|will\s+not|without/iu;
const STRONG_DENY = /不要|(?<![特分个区])别(?![人的])|禁止|不许|不准|(?<!可)不可以|(?<!能)不能|不得|不允许|不需要|无需|不必|不用|没必要|避免/iu;
const BACKGROUND = /(?:观察|看到|发现|注意|遇到).{0,10}(?:npc|乘客|旅客|别人|他人|其他乘客|有人).{0,12}(?:插队|加塞|求助)|^(?:(?:前面|前方|排队)(?:的)?)?(?:npc|乘客|旅客|别人|他人|有人)(?:正在|在|会|已经|向我|向你)|(?:别人|他人|有人)(?:在|正在)?(?:插队|加塞)/iu;

/** Also used to remove model-invented social shortcuts from normalized guidance. */
export function mentionsCutInIdea(text: string): boolean {
  const value = text.normalize("NFKC");
  return CUT_IN.test(value) || SOCIAL_IDEA.test(value) || (PERSON.test(value) && HELP.test(value));
}

/** Only the player's original words grant access; prohibitions take precedence. */
export function allowsCutIn(guidance: string): boolean {
  const clauses = guidance.normalize("NFKC").split(/[，,。.!！？?；;\n]|但是|不过|然而|但/u)
    .map((clause) => clause.trim().replace(/(?:不要|不用|不必|无需)(?:再)?(?:犹豫|害怕|担心|顾虑|客气)/gu, ""));
  if (clauses.some((clause) => mentionsCutInIdea(clause) && (STRONG_DENY.test(clause) || DENY_DIRECT.test(clause) || DENY_SOCIAL.test(clause) || DENY_ENGLISH.test(clause) || /没说.{0,8}(?:插队|加塞|求助)/u.test(clause)))) return false;
  return clauses.some((clause) => mentionsCutInIdea(clause) && !BACKGROUND.test(clause));
}

export const UNAVAILABLE_STRATEGY = "本局指导未开放此行动，请按已确认的指导选择其他做法";

export function filterUnrequestedCutIn(guidance: string, normalized: NormalizedGuidance | null): NormalizedGuidance | null {
  if (!normalized || allowsCutIn(guidance)) return normalized;
  if (!guidance.trim()) return null;
  const isHint = (text: string) => mentionsCutInIdea(text) || (PERSON.test(text) && /聊|交谈|交流|说话|对话|开口|询问|打听/u.test(text));
  const keep = (items: string[]) => items.filter((item) => !isHint(item));
  return {
    summary: isHint(normalized.summary) ? guidance : normalized.summary,
    risk: isHint(normalized.risk) ? "" : normalized.risk,
    priorities: keep(normalized.priorities), rules: keep(normalized.rules),
    creativeIdeas: keep(normalized.creativeIdeas), notExecutable: keep(normalized.notExecutable), initialPlan: keep(normalized.initialPlan),
  };
}
