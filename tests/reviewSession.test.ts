import { expect, test, vi } from "vitest";
import { ReviewSession } from "../src/ui/reviewSession";
import { analysis, failedReport } from "./reviewFixture";
import type { DraftResult } from "../src/shared/review";
import { ReviewFailure } from "../src/shared/review";
const review = { analysis, model: "test", usage: null, latencyMs: 1 };
const draft: DraftResult = { guidance: "稳妥通关，比较换队总耗时。", model: "test", usage: null, latencyMs: 1 };
function setup() {
  const api = { review: vi.fn(async () => review), draftGuidance: vi.fn(async () => draft) };
  return { api, session: new ReviewSession(failedReport(), api) };
}
test("deduplicates automatic review, selects nothing, and does not alter original guidance", async () => {
  const { api, session } = setup();
  await Promise.all([session.ensureReview(), session.ensureReview()]);
  expect(api.review).toHaveBeenCalledTimes(1);
  expect(session.state.selected).toEqual([]);
  expect(session.state.draft).toBeNull();
  expect(session.originalGuidance).toBe("");
});
test("sends only selected strategies and exposes a draft without implicitly adopting it", async () => {
  const { api, session } = setup(); await session.ensureReview();
  session.toggle("steady"); await session.generateDraft();
  expect(api.draftGuidance).toHaveBeenCalledWith("", [analysis.strategies[1]]);
  expect(session.state.editedGuidance).toBe(draft.guidance);
  expect(session.originalGuidance).toBe("");
  expect(session.exportData().selectedStrategyIds).toEqual(["steady"]);
  session.setEditedGuidance("🚇".repeat(301)); expect(session.canApply).toBe(false);
  session.setEditedGuidance("🚇".repeat(300)); expect(session.canApply).toBe(true);
});
test("changing selections invalidates an old in-flight draft without stale overwrites", async () => {
  const { api, session } = setup(); await session.ensureReview();
  let release!: (value: DraftResult) => void;
  api.draftGuidance.mockImplementationOnce(() => new Promise(r => { release = r; }));
  session.toggle("observe"); const old = session.generateDraft();
  session.toggle("observe"); session.toggle("steady");
  await session.generateDraft(); session.setEditedGuidance("玩家自己编辑的新指导");
  release({ ...draft, guidance: "过期草稿" }); await old;
  expect(session.state.editedGuidance).toBe("玩家自己编辑的新指导");
  expect(session.state.selected).toEqual(["steady"]);
});
test("errors can be retried and successful review is reused", async () => {
  const { api, session } = setup(); api.review.mockRejectedValueOnce(new Error("模型不可用"));
  await session.ensureReview(); expect(session.state.status).toBe("error");
  await session.ensureReview(); expect(session.state.status).toBe("ready");
  await session.ensureReview(); expect(api.review).toHaveBeenCalledTimes(2);
});
test("no selected strategies means no draft call, and report controllers are isolated", async () => {
  const first = setup(); const second = setup();
  await first.session.ensureReview(); await first.session.generateDraft();
  expect(first.api.draftGuidance).not.toHaveBeenCalled();
  first.session.toggle("observe"); await first.session.generateDraft();
  expect(second.session.state.review).toBeNull(); expect(second.session.state.editedGuidance).toBe("");
});

test("editing a previous draft during regeneration preserves the newer player text", async () => {
  const { api, session } = setup(); await session.ensureReview(); session.toggle("observe"); await session.generateDraft();
  let release!: (value: DraftResult) => void;
  api.draftGuidance.mockImplementationOnce(() => new Promise(r => { release = r; }));
  const pending = session.generateDraft(); session.setEditedGuidance("玩家最新修改");
  release({ ...draft, guidance: "模型新草稿" }); await pending;
  expect(session.state.editedGuidance).toBe("玩家最新修改"); expect(session.canApply).toBe(true);
});
test("failed paid calls remain in exported usage after a successful retry", async () => {
  const { api, session } = setup();
  api.review.mockRejectedValueOnce(new ReviewFailure("输出格式无效", { operation: "review", status: "error", model: "m", latencyMs: 20, usage: { inputTokens: 90, outputTokens: 80, thinkingTokens: null, cacheReadTokens: 0 } }));
  await session.ensureReview(); await session.ensureReview();
  expect(session.exportData().reviewAttempts).toHaveLength(2);
  expect(session.exportData().reviewAttempts?.[0].usage?.outputTokens).toBe(80);
});
