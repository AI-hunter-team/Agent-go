# Difficulty controls implementation plan

> **For agentic workers:** Use executing-plans for sequential implementation.

**Goal:** Make time limit and extra initial queue population independently configurable and reproducible per run.

**Architecture:** Shared validated settings travel from setup through Engine and model Session to the exported report. Defaults preserve the existing scenario. Only the initial crowd changes; movement, service and guard rules remain as they are.

**Tech Stack:** TypeScript, React/R3F, Express, Vitest.

**Spec:** ../../tasks/DIFFICULTY-001.md

## Constraints and review focus

Use integer time limits60–300 and extra queue people0–8. No paid model calls. Keep old call sites and reports compatible. Check invalid/NaN inputs, empty versus broken lanes, immutable per-run snapshots, retries losing settings, and prompts contradicting the actual deadline.

## Tasks

- [x] Write and observe failing simulation/validation tests; add shared settings, initial crowd extension, per-world time limit and observation support.
- [x] Write and observe failing session/report tests; freeze server session settings and use them in both model prompts, remote client and runner diagnostics.
- [x] Add setup controls, safe input validation, previews, confirmation/clock/report values and preserve settings on start/retry.
- [x] Run a fixed-seed offline difficulty comparison, retain summarized reproducible results and explain its limits.
- [x] Run full checks and browser validation, request a read-only review and resolve findings.
- [x] Integrate only this task into the local preview workspace.
