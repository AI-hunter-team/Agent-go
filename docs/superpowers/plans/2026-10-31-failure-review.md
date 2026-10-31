# Failure Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement sequentially. Steps use checkbox syntax.

**Goal:** Failed rounds produce a global, evidence-based review and optional player-selected guidance draft.

**Architecture:** Record historical world snapshots without changing observations. Stateless review endpoints use independent structured model calls after session disposal. A per-report UI controller deduplicates calls and guards asynchronous selection changes. Only an explicit player action transfers an editable draft to setup.

**Tech Stack:** Existing TypeScript, React, Express, Anthropic/OpenAI-compatible clients, Vitest. No dependencies.

**Spec:** `docs/tasks/FAILURE-REVIEW-001.md` (approved scope from this chat).

## Global Constraints

- Failed rounds only; preserve original guidance and 300 Unicode character limit.
- Entire past event stream plus global snapshots; distinguish observed information from hindsight.
- Two or three strategies; counterfactual outcomes remain unverified.
- No implicit adoption, new-game start, hidden memory or additional action permissions.
- Separate review usage from gameplay cost; no paid calls during implementation validation.

## Review Focus

- Session already deleted: review still works without session history.
- New round/unmounted panel: old requests cannot alter the current round or guidance.
- Changed selection during drafting: discard stale drafts and send only selected strategies.
- Malformed/refused/truncated model results and absent model: explicit retryable failure.
- Original guidance at 300 Unicode characters: model merges to limit; user edits revalidated.

### Task 1: Historical evidence and shared contracts

Files: `src/shared/review.ts`, `src/agent/reviewRecorder.ts`, `src/agent/runner.ts`, `src/shared/types.ts`, `tests/review.test.ts`.

Interfaces: `buildReviewInput(report): ReviewInput`; `ReviewRecorder.capture(engine)`; `ReviewAnalysis`, `ReviewResult`, `ReviewStrategy`, `DraftResult`.

- [x] Write tests for global snapshots after end, invisible events retained, no raw/debug/reasoning leakage, valid/invalid model references and legacy reports.
- [x] Run `npx vitest run tests/review.test.ts` and observe missing implementation failures.
- [x] Implement bounded evidence projection, validators, recorder and optional report fields.
- [x] Run targeted tests and typecheck.

### Task 2: Independent model review and draft endpoints

Files: `server/review.ts`, `server/structured.ts`, `server/openai.ts`, `server/llm.ts`, `server/app.ts`, `src/agent/remoteAgent.ts`, `src/shared/debug.ts`, `tests/reviewApi.test.ts`, `tests/reviewModels.test.ts`.

Interfaces: optional `LlmService.review(input): Promise<ReviewResult>` and `.draftGuidance(guidance, strategies): Promise<DraftResult>`; API uses current model configuration without a game session.

- [x] Write tests for review after deletion, no-model/invalid payload/output, both provider transports, truncation, and selected-only Unicode-limited draft.
- [x] Run tests and observe new endpoint/operation failures.
- [x] Implement schemas/prompts, bounded validation, usage metadata and safe API errors; keep review isolated from game memory.
- [x] Run targeted tests and typecheck.

### Task 3: Review selection, editable draft and local delivery

Files: `src/ui/reviewSession.ts`, `src/ui/FailureReview.tsx`, `src/ui/App.tsx`, `src/ui/ReportView.tsx`, `src/ui/styles.css`, `tests/reviewSession.test.ts`, `tests/browser-fixture.ts`, task validation.

Interfaces: `ReviewSession` owns immutable report input, deduplicated review request, explicit selection and draft request generations. `FailureReview` emits only a player-confirmed guidance string to App setup.

- [x] Write tests for deduplication, selection invalidation, stale draft responses, no unselected strategies, retry and manual edit length validation.
- [x] Observe RED then implement controller and report UI using existing visual styles.
- [x] Confirm explicit apply resets normalization and preparation; same-guidance retry stays unchanged.
- [x] Run `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`; inspect browser through fixture without paid models.
- [x] Request independent read-only code review, address substantive findings, document local acceptance URL and limitations.

## Completion evidence

All tasks executed sequentially in this chat. RED/GREEN and final commands are recorded in `docs/validation/FAILURE-REVIEW-001.md`. Final independent review findings were corrected and regression tested. Local acceptance keeps this branch/worktree; no push, merge or paid model validation.

User subsequently authorized commit and GitHub PR. The publication integration targets main `67a7703` and replaces the original Task 2 adapter targets with `server/responses.ts`; `server/review.ts` now contains schemas/prompts only. Current-main seed/NPC/UI behavior is retained. Responses tests, 423 full tests, typecheck/build and focused independent review pass. Original local acceptance remains unchanged; no paid model call or merge is authorized by PR creation.
