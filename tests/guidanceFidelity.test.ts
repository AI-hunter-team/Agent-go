import { expect, test } from "vitest";
import { guidanceSources, requiresUnobservedGuard, verifiedCoverage } from "../src/shared/guidanceSources";
import { planToNormalized, retainJourneyGuidance } from "../src/shared/journey";
import { buildSystemPrompt } from "../server/prompts";
import { fake, jsonResponse } from "./responsesSupport";
import { validateNormalized } from "../server/security";
import { publicActionKnowledge, unknownJourneyTargets } from "../server/actionKnowledge";

const source = "最快速度不买票，趁着保安不注意，不能在保安看着的时候翻栏杆过去。想办法搞走保安注意力";
const plan = { understanding: "保留原指导", actions: ["先观察并准备道具", "满足条件后再尝试"], adjustment: "条件未知就重观察，不改写目标" };
const coverage = (text: string) => guidanceSources(text).map(r => ({ sourceId: r.id, kind: "condition", handling: "planned", steps: [1, 2], explanation: "按原条件判断，不预设成功" }));

test.each([source, "只观察，不要购买；先问路，再决定。", " 偏好快一些，但宁愿等；如果没道具就先找\n不能凭空拿到。", "，。", "扔瓶子😀，然后观察。"])("source spans preserve every character: %s", text => {
  const spans = guidanceSources(text);
  expect(spans.map(r => r.text).join("")).toBe(text);
  for (const r of spans) expect(text.slice(r.start, r.end)).toBe(r.text);
});

test("all goals, preferences, order and conditions survive independently of summaries", () => {
  const p = retainJourneyGuidance({ ...plan, sourceGuidance: "forged" }, source, coverage(source));
  expect(p.sourceGuidance).toBe(source);
  expect(p.requirements!.map(r => r.text).join("")).toBe(source);
  expect(planToNormalized(p).rules).toEqual([source]);
  expect(() => validateNormalized(planToNormalized(retainJourneyGuidance(plan, "快，".repeat(100))))).not.toThrow();
  const prompt = buildSystemPrompt(source, planToNormalized(p));
  expect(prompt.guidance).toContain(source);
  expect(prompt.guidance).toContain("sourceRequirements");
});

test("coverage cannot silently drop, duplicate, invent or reference nonexistent steps", () => {
  const rows = coverage(source);
  expect(verifiedCoverage(rows, source, 2)).toBe(true);
  for (const invalid of [rows.slice(1), [...rows.slice(1), rows[1]], rows.map((r,i) => i ? r : { ...r, sourceId: "invented" }), rows.map(r => ({ ...r, steps: [3] }))]) {
    expect(verifiedCoverage(invalid, source, 2)).toBe(false);
  }
  expect(retainJourneyGuidance(plan, source).requirements!.every(r => r.handling === "unverified")).toBe(true);
});

test("planning receives public capabilities and missing coverage does not discard the proposal", async () => {
  const input = { sceneId: "metro" as const, seed: 1, settings: { timeLimitSeconds: 150, extraQueuePeople: 3 }, guidance: source, autonomous: false, runId: "fidelity" };
  const { service, requests } = fake([jsonResponse({ ...plan, coverage: coverage(source) })]);
  const p = await service.prepareJourney(input);
  expect(p.sourceGuidance).toBe(source);
  expect(p.requirements).toHaveLength(guidanceSources(source).length);
  const sent = requests[0].body;
  expect(sent.instructions).toContain("具体准备在游戏现场自主决定");
  expect(sent.instructions).not.toContain("water_bottle");
  expect(sent.instructions).not.toContain("convenience");
  expect(sent.instructions).not.toContain("persona");
  const partial=await fake([jsonResponse({ ...plan, coverage: coverage(source).slice(1) })]).service.prepareJourney(input);
  expect(partial.sourceGuidance).toBe(source);
  expect(partial.requirements?.[0].handling).toBe("unverified");
  expect(partial.requirements?.[1].handling).toBe("planned");
});

test("guard conditions are preserved without forcing them on explicit risk or quoted speech", () => {
  expect(requiresUnobservedGuard(source)).toBe(true);
  expect(requiresUnobservedGuard("直接翻越栏杆，就算被看见也试一下")).toBe(false);
  expect(requiresUnobservedGuard("不要等保安分心，直接翻越")).toBe(false);
  expect(requiresUnobservedGuard('对乘客说“趁保安不注意”')).toBe(false);
});

test("planning flags invented navigation in proposals without failing the whole preparation", async () => {
  expect(unknownJourneyTargets({ ...plan, actions: ['move_to INVENTED_EXIT，然后move_to(target: "GATE_N")'] })).toEqual(["INVENTED_EXIT"]);
  expect(unknownJourneyTargets({ ...plan, actions: ["move_to ADVERT，然后move_to HALL_N"] })).toEqual([]);
  expect(unknownJourneyTargets({ ...plan, actions: ["move_to convenience，再move_to HALL_N；到STAIRS_TOP后traverse"] })).toEqual([]);
  const input = { sceneId: "metro" as const, seed: 1, settings: { timeLimitSeconds: 150, extraQueuePeople: 3 }, guidance: "", autonomous: true, runId: "navigation" };
  const result=await fake([jsonResponse({ ...plan, actions: ["move_to INVENTED_EXIT"], coverage: [] })]).service.prepareJourney(input);
  expect(result.preparation?.notes.join(" ")).toContain("INVENTED_EXIT");
});

test("public knowledge distinguishes moving, crossing, descending and irreversible attempts", () => {
  const knowledge = publicActionKnowledge();
  expect(knowledge).toContain("普通move_to不能穿越");
  expect(knowledge).toContain("两条线独立");
  expect(knowledge).toContain("必须traverse");
  expect(knowledge).toContain("不能通过普通等待/移动保证立即停止");
});
