import type { CreativeClassification } from "../shared/types";

/**
 * Offline fallback for mapping a free-text creative intent onto the closed mechanic
 * list. The server prefers the model classifier; this keeps play possible without one
 * and keeps similar wordings mapping to the same mechanic.
 */
const RULES: { mechanic: CreativeClassification["mechanic"]; words: RegExp }[] = [
  { mechanic: "jump_gate", words: /翻越|翻过|跳过闸|跨过闸|越过闸|爬过|逃票|jump|vault|hop/i },
  { mechanic: "cut_in_line", words: /插队|插到|挤到前|加塞|插进|cut in|skip the line|jump the queue/i },
];

export function classifyByKeywords(intent: string): CreativeClassification {
  for (const r of RULES) {
    if (r.words.test(intent)) return { mechanic: r.mechanic, reason: "按关键词归类", source: "keywords" };
  }
  return { mechanic: "unsupported", reason: "这个车站环境里没有对应的可执行方式", source: "keywords" };
}
