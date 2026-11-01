import type { PhysicalAction } from "./interaction";

/** Only explicit unconditional physical commands; threats inside quotation marks remain words. */
export function explicitPhysicalIntent(input: string): Pick<PhysicalAction, "action" | "aim" | "itemKind"> | null {
  const outsideQuotes = input.replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/g, "");
  if (/如果|假如|要是|一旦|否则|不(?:给|交|答应).*就/.test(outsideQuotes)) return null;
  for (const clause of outsideQuotes.split(/[，,；;。]|然后|接着|并且|同时|并(?=殴打|击打|击晕|打晕|推搡|抢夺|执行|实施)|再(?=威胁|索要|殴打|击打|击晕|打晕|推搡|抢夺)/)) {
    if (/如果|假如|要是|一旦|否则|才|不(?:给|交|答应).*就|不要|不许|禁止|避免|不能|无需|不想|不(?:进行|执行|实施|动手|殴打|击打|抢夺|推搡)|别/.test(clause)) continue;
    if (/威胁|恐吓|扬言|声称|说/.test(clause) && !/执行|进行|实施|动手|实际/.test(clause)) continue;
    if (/击晕|打晕|knockout|knock out/i.test(clause)) return { action: "strike", aim: "knockout" };
    if (/殴打|击打|打人|动手打|揍|strike|(?:^|直接|徒手|执行)打\s*(?:最近|这|那|p\d|n\d|guard)/i.test(clause)) return { action: "strike", aim: "hurt" };
    if (/推搡|推开|推倒|推\s*(?:最近|那|这|p\d|n\d|guard)|push/i.test(clause)) return { action: "push" };
    if (/抢夺|抢.*(?:票|伞|零食|水瓶|易拉罐|背包|零钱)|snatch/i.test(clause)) {
      const itemKind = /伞/.test(clause) ? "umbrella" : /零食/.test(clause) ? "snack" : /水瓶/.test(clause) ? "water_bottle" : /易拉罐/.test(clause) ? "can" : /背包/.test(clause) ? "backpack" : /零钱/.test(clause) ? "coins" : "ticket";
      return { action: "snatch", itemKind };
    }
  }
  return null;
}

/** Separates actual actions without splitting the content of a quoted utterance. */
export function splitActionClauses(input: string): string[] {
  const clauses: string[] = [];
  let buffer = "", closing = "";
  const pairs: Record<string, string> = { "“": "”", "「": "」", "『": "』", '"': '"', "'": "'" };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (closing) { buffer += ch; if (ch === closing) closing = ""; continue; }
    if (pairs[ch]) { closing = pairs[ch]; buffer += ch; continue; }
    const separator = input.slice(i).match(/^(?:然后|接着|再(?=拿|给|丢|扔|抢|推|打|翻|说|等|殴|击)|[;；]|[，,](?=\s*(?:执行|进行|直接|再|上前|实际)?\s*(?:殴打|击打|击晕|打晕|推搡|抢夺|拿|给|丢|扔))|并(?:且)?(?=殴打|击打|击晕|打晕|推搡|抢夺))/)?.[0];
    if (separator) { if (buffer.trim()) clauses.push(buffer.trim()); buffer = ""; i += separator.length - 1; } else buffer += ch;
  }
  if (buffer.trim()) clauses.push(buffer.trim());
  return clauses;
}

/** A future purpose is retained in source text, but is not an instruction to perform it now. */
export function currentActionText(input: string): string {
  return input.replace(/[，,。；;]\s*为(?:了)?(?:随后|之后|后续|接下来)[^。；;]*[。]?$/u, "");
}
