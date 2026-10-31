import { expect, test, vi } from "vitest";
import { ReviewSession } from "../src/ui/reviewSession";
import { analysis, failedReport } from "./reviewFixture";
import type { DraftResult } from "../src/shared/review";
import { ReviewFailure } from "../src/shared/review";
const review = { analysis, model: "test", usage: null, latencyMs: 1 };
const draft: DraftResult = { guidance: "稳妥通关，比较换队总耗时。", model: "test", usage: null, latencyMs: 1 };
function setup() {
  const api = { reviewStatus: vi.fn(async () => ({ available: true })), review: vi.fn(async () => review), draftGuidance: vi.fn(async () => draft) };
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

test("one selected-strategy action returns the prepared prompt for opening game setup", async () => {
  const { api, session } = setup(); await session.ensureReview();
  expect(await session.generateDraft()).toBeNull();
  session.toggle("steady");
  expect(await session.generateDraft()).toBe(draft.guidance);
  expect(api.draftGuidance).toHaveBeenCalledWith("", [analysis.strategies[1]]);
});

test("duplicate submissions and changed selections never return a stale setup prompt", async () => {
  const { api, session } = setup(); await session.ensureReview(); session.toggle("observe");
  let complete!: (value: DraftResult) => void;
  api.draftGuidance.mockImplementationOnce(() => new Promise(r => { complete = r; }));
  const pending = session.generateDraft();
  expect(await session.generateDraft()).toBeNull();
  session.toggle("steady");
  complete(draft);
  expect(await pending).toBeNull();
  expect(api.draftGuidance).toHaveBeenCalledTimes(1);
});

test("a failed strategy merge stays on the report instead of returning a setup prompt", async () => {
  const { api, session } = setup(); await session.ensureReview(); session.toggle("observe");
  api.draftGuidance.mockRejectedValueOnce(new Error("请稍后重试"));
  expect(await session.generateDraft()).toBeNull();
  expect(session.state.draftStatus).toBe("error");
  expect(session.state.draftError).toBe("请稍后重试");
});
test("leaving the review invalidates a pending setup prompt and allows a fresh request", async () => {
  const { api, session } = setup(); await session.ensureReview(); session.toggle("observe");
  let complete!: (value: DraftResult) => void;
  api.draftGuidance.mockImplementationOnce(() => new Promise(r => { complete = r; }));
  const pending = session.generateDraft();
  session.cancelDraft();
  expect(await session.generateDraft()).toBe(draft.guidance);
  complete({ ...draft, guidance: "旧页面的指导" });
  expect(await pending).toBeNull();
  expect(session.state.editedGuidance).toBe(draft.guidance);
  expect(session.exportData().reviewDraftHistory).toHaveLength(2);
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


test("server availability triggers one automatic analysis without a browser model", async () => {
  const { api, session } = setup();
  await Promise.all([session.checkService(true), session.checkService(true)]);
  expect(session.state.serviceStatus).toBe("available");
  expect(session.state.status).toBe("ready");
  expect(api.reviewStatus).toHaveBeenCalledTimes(1);
  expect(api.review).toHaveBeenCalledTimes(1);
});

test("offline reports wait for the player before using the server review service", async () => {
  const { api, session } = setup();
  await session.checkService(false);
  expect(session.state.serviceStatus).toBe("available");
  expect(api.review).not.toHaveBeenCalled();
  await session.ensureReview();
  expect(session.state.status).toBe("ready");
});

test("unavailable review service can recover without asking the player for credentials", async () => {
  const { api, session } = setup();
  api.reviewStatus.mockResolvedValueOnce({ available: false });
  await session.checkService(true);
  expect(session.state.serviceStatus).toBe("unavailable");
  expect(api.review).not.toHaveBeenCalled();
  await session.checkService(true);
  expect(session.state.status).toBe("ready");
});

test("a review service connection error is visible and a retry clears it", async () => {
  const { api, session } = setup();
  api.reviewStatus.mockRejectedValueOnce(new Error("无法连接复盘服务"));
  await session.checkService(false);
  expect(session.state.serviceStatus).toBe("error");
  expect(session.state.serviceError).toBe("无法连接复盘服务");
  await session.checkService(false);
  expect(session.state.serviceStatus).toBe("available");
  expect(session.state.serviceError).toBeNull();
});
