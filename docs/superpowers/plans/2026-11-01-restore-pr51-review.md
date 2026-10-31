# Restore PR #51 Review Implementation Plan

> **For agentic workers:** Execute inline in this chat; the user has already selected PR #51 as the presentation to restore.

**Goal:** Restore PR #51 presentation on current main and update local acceptance.
**Architecture:** Keep the accessible modal boundary and existing report controller; render ReportSummary in full mode with result/time above three horizontal detail tabs. The user's latest instruction sets next-run guidance first, then replay and full records. Reuse the run's controller for strategies and export; history stays read-only.
**Tech Stack:** Existing React, Radix Dialog, TypeScript, CSS and Vitest.
**Spec:** [User-selected reference and scope](../../tasks/RESTORE-REVIEW-051.md).

## Constraints and review focus

- Do not change simulator outcomes, server APIs, credentials, dependencies or other working trees.
- Preserve boarding wording, old-report compatibility, model binding and draft cancellation.
- Reopening uses the same generated review; historical reports cannot generate or adopt new guidance.
- On narrow screens the report scrolls independently and disclosure headings stay visible.

## Task 1: Reconnect the simplified report

Files: JourneyReview.tsx/CSS, ReportView.tsx, FailureReview.tsx, tests/reviewView.test.ts.

- [x] Add rendered regressions for the supplied report controller and historical read-only strategies; confirm failure.
- [x] Restore the PR #51 report body, then apply the user's follow-up: result/time stay in one column, with next-run/replay/records tabs below. Keep focus handling and historical close navigation.
- [x] Restore automatic analysis only for active model-driven failed reports and keep offline analysis manual. Leaving the strategy tab invalidates pending adoption.
- [x] Run targeted tests and typecheck for the final tab layout.

## Task 2: Verify and hand off

- [x] Run all existing tests, production build and whitespace checks.
- [x] Verify the actual failed result, replay/records, widths and strategy prefill using a local fake service without paid calls. Fix the independently reviewed long-record tab scroll issue and verify panel alignment.
- [x] Update local8085, preserve original tabs and open a new final-build failed report. Record results. No commit or remote action requested.

## Authorized PR handoff

The user subsequently requested commit and GitHub PR creation, limited to journey review. The delivery branch is `codex/restore-review-tabs`, based on main `1a5f73c4bae435b4ea05d2ea05f13e42bc2f8817`. Only recap UI, its test and these recap-specific notes are included. The earlier local acceptance records stay untracked. No merge or deployment is authorized.
