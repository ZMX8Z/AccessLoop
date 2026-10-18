# Analysis Tasks Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in the existing D worktree. User has requested direct implementation; dev integration is already authorized.

**Goal:** Allow the configured GLM to finish without holding one public HTTP request open past 15 seconds.
**Architecture:** Persist task envelopes in existing C external-operations; Next after runs the existing analysis engine; authenticated GET polls status without new calls.
**Tech Stack:** Next16.3.3/Payload3.91/PostgreSQL/Zod, no new dependency or migration.
**Spec:** docs/superpowers/specs/2026-10-18-analysis-tasks-design.md

## Global Constraints

- Fixed branch codex/d-backend-routing, base dev 4cbe2c7a9ddaa74d428e49af1bcfae2a71e6bb16; never edit root dev directly.
- English UI, Chinese authority/handoff; same owned photo, consent, tool and strict validation.
- Model wait60s; task lease180s; poll2s/max185s; per HTTP15s.
- Keep unlimited local day policy and10/minute; retain all historic usage. No new ORM/connection.

## Review Focus

- Two POSTs/schedules must not charge twice.
- Other anonymous session or admin login must not reveal a task/photo.
- Crash/expired lease must stop pending state without automatic paid replay.
- Pre-call quota failure must be failed task without fake analysis.
- Cancel/manual/new photo must prevent late result overwriting the draft.

## Tasks

- [ ] 1. Add task DTO and failing PG task tests (submit/read/run, dedupe, ownership, lease expiry, quota). Implement src/server/photos/analysis-tasks.ts over existing analysis and storage; extend only Vision timeout/engine lease; assert actual outgoing system prompt in vision tests. Watch red/green.
- [ ] 2. Add POST after scheduling and GET route; sync API_CONTRACTS/technical/requirements. Add HTTP/client poll/cancel/failure tests before implementation. Keep analyzePhoto return type AnalysisDTO for B consumers; add manual escape during waiting.
- [ ] 3. Run check/build/realPG, production HTTP with delayed provider and restart/ownership checks; then one real consented-photo GLM attempt. Record failures and success without fabricated findings.
- [ ] 4. Independent review, fix findings, handoff/API/environment docs, evidence, stage PR todev, merge fixedhead and postmerge regression; safely fast-forward root preserving env/generated files. Do not publish main without new authorization.

## Execution ledger

- Initial diagnosis and scope reviewed. User authorization overrides extra skill approval gates; continue directly.
