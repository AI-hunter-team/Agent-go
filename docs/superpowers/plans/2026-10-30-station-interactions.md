# Station interactions implementation plan

> **For agentic workers:** Use executing-plans, with independent bounded subsystem delegation.

**Goal:** Add straight guard patrols, consent-based NPC queue negotiation, and stairs before platform arrival.

**Architecture:** World owns movement and permissions; Runner freezes time during NPC calls and retains records; server uses the existing structured model transport. Stairs and guard routes keep the existing simulation timestep.

**Tech Stack:** TypeScript, React canvas, Express, Anthropic-compatible DeepSeek, Vitest.

**Spec:** ../specs/2026-10-30-station-interactions-design.md

## Constraints

Preserve uncommitted work and secrets. No new dependencies or paid calls in automated checks. Dialogue max 200 characters and three rounds per NPC.

## Review focus

Invalid or invisible target spends no call; refusal preserves position; stale consent cannot reorder another NPC; cancelled calls remain recorded without execution; crossing gates cannot bypass stairs.

## Tasks

- [x] Guard tests: natural full jump window, front-facing detection, another guard detecting, complaint heading restored. Implement straight routes and remove rotation.
- [x] Negotiation tests: valid/rejected/accepted requests, three-round cap, stale NPC, queue visibility, cancelled responses and cost accounting. Implement sim/negotiation.ts, creative.ts and agent/runner.ts.
- [x] Model tests: strict boolean parsing, raw response, bounded API input and unavailable service. Implement server NPC handler and wire remote agent.
- [x] Stairs tests: gate remains running, timed descend finishes, prerequisites and bypass prevented. Implement world/engine/layout/heuristic and map/progress.
- [x] Display dialogue in live log/replay/report; add stairs time, prompt/tool and user documentation integration.
- [x] Inspect local UI and request independent review; resolve guard-start visibility finding with RED/GREEN regression. Browser offline seed1 reaches platform at82.9s after6s descent.
- [x] Final integration: npm test 202/202, npm run build and git diff --check pass. Live API health confirms configured deepseek-flash; invalid dialogue input returns400 without a model call. No remaining P1/P2 findings from independent review.
