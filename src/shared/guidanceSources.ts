/** Lossless source spans, independent of a model's summary or interpretation. */
export interface GuidanceSource { id: string; text: string; start: number; end: number }
export function guidanceSources(original: string): GuidanceSource[] {
  const spans = original.matchAll(/[^，,。；;！？!?\n]+[，,。；;！？!?\n]*|[，,。；;！？!?\n]+/g);
  return [...spans].map((m, i) => ({ id: `r${i + 1}`, text: m[0], start: m.index!, end: m.index! + m[0].length }));
}

export interface GuidanceRequirement extends GuidanceSource {
  kind: "goal" | "preference" | "condition" | "prohibition" | "sequence" | "method" | "other";
  handling: "planned" | "needs_clarification" | "unsupported" | "unverified";
  steps: number[];
  explanation: string;
}

/** Covers every original span exactly once; never accepts a model-rewritten quote. */
export function verifiedCoverage(value: unknown, original: string, stepCount: number): boolean {
  const sources = guidanceSources(original);
  if (!Array.isArray(value) || value.length !== sources.length) return false;
  const ids = new Set<string>();
  return value.every(r => {
    if (!r || !sources.some(s => s.id === r.sourceId) || ids.has(r.sourceId)) return false;
    ids.add(r.sourceId);
    return ["goal", "preference", "condition", "prohibition", "sequence", "method", "other"].includes(r.kind)
      && ["planned", "needs_clarification", "unsupported", "unverified"].includes(r.handling)
      && typeof r.explanation === "string"
      && Array.isArray(r.steps)
      && r.steps.every((i: unknown) => Number.isSafeInteger(i) && Number(i) >= 1 && Number(i) <= stepCount);
  });
}

/** Guard-attention wording is a condition, not a claim that distraction occurred. */
export function requiresUnobservedGuard(text: string): boolean {
  const unquoted = text.replace(/“[^”]*”|「[^」]*」|"[^"]*"/g, "");
  return unquoted.split(/[。；\n]/).some(clause => !/(?:不必|不用|不要|无需)(?:等待|等|在意|考虑)[^，。；]{0,15}(?:保安|安检员)|即使[^，。；]{0,10}(?:保安|安检员)[^，。；]{0,8}(?:看着|注视)/.test(clause)
    && /(?:保安|安检员)[^。；\n]{0,35}(?:不注意|没注意|未注意|没有注意|没有看见|没有看到|分心|背对|转头|看向别处|看不见|看不到|没看|未看)|不被(?:保安|安检员)(?:发现|看见|看到)|(?:避开|躲开|避让)[^。；\n]{0,12}(?:保安|安检员)[^。；\n]{0,8}(?:视线|注视)|不能在[^。；\n]{0,12}(?:保安|安检员)[^。；\n]{0,12}(?:看着|注视)/.test(clause));
}
