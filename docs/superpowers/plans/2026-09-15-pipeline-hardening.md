# Pipeline Hardening Implementation Plan

> **For agentic workers:** Execute inline in this session. Do not use subagents, delegated coding, delegated testing, or multi-agent orchestration.

**Goal:** Harden auto-vid-clip into a safe, resumable, cache-aware pipeline with fast selection reruns and polished CLI/Worker/Web operation.

**Architecture:** Consolidate shared contracts first, then harden cleanup/API boundaries, then refactor orchestration and artifacts. Add selection and ranking on top of existing deterministic tools, followed by worker/TUI/UI/docs/CI verification.

**Tech Stack:** TypeScript, npm workspaces, Node.js, Cloudflare Workers/D1, Vite/React, node:test, FFmpeg, yt-dlp.

**Spec:** `docs/superpowers/specs/2026-09-15-pipeline-hardening-design.md`

## Global Constraints

- Work inline in one session; no subagents or delegation.
- Follow `AGENTS.md`; search before reading; inspect targeted files only.
- No paid services, runtime AI, heavy TUI framework, full real-VOD E2E, or generated-binary inspection.
- Reuse existing deterministic tools and shared contracts.
- Use temporary fixture roots and focused tests.

### Task 1: Baseline and shared contracts

**Files:** `packages/contracts/src/*`, `packages/jobs/src/index.ts`, related tests.

- Add failing tests for canonical stages/statuses, terminal completion, per-stage transitions, canonical VOD URL, and artifact metadata fingerprints.
- Run targeted contract/jobs tests; confirm failures.
- Implement one shared stage vocabulary and lifecycle helpers; remove or adapt duplicate vocabularies.
- Run targeted tests and typecheck.

### Task 2: Cleanup safety and lifecycle

**Files:** `tools/job-clean/src/index.ts`, cleanup tests, work-root helpers.

- Add fixture-only tests for readline closure/exit, confirmation modes, eligibility, active/interrupted/failed protection, dry-run/idempotence, zero-heavy-files, sentinel, traversal, symlink, and outside-root rejection.
- Implement `try/finally` readline closure, explicit job-state classification, COMPLETE-only ordinary cleanup, sentinel verification, safe resolved paths, and purge semantics.
- Run cleanup tests plus targeted subprocess CLI checks.

### Task 3: Canonical Twitch identity and API boundary

**Files:** `packages/twitch`, `packages/media`, `apps/api/src/index.ts`, API tests, web job creation.

- Add failing tests for all supported Twitch forms, immutable selected VOD jobs, remote local-path rejection, worker auth, configured CORS, and atomic claim behavior.
- Unify parsing/canonicalization around numeric VOD IDs. Split worker endpoints from browser endpoints and require bearer token. Replace wildcard default with configured origin. Add D1 claim migration/query and lease fields; remove unused queue send/binding if unconsumed.
- Update web selected-VOD submission to use exact canonical URL and worker authorization path.
- Run Twitch/API/web targeted tests and typecheck.

### Task 4: Pipeline orchestration, cancellation, and artifacts

**Files:** `tools/pipeline-run`, media runners, `packages/jobs`, orchestration tests.

- Add failing tests for stage order, explicit transitions, cached/skipped stages, zero clips, verify mismatch, cleanup ordering, stale/valid cache, partial files, SIGINT/130, and JSON ANSI exclusion.
- Implement shared stage runner with one running stage, `AbortController` propagation, completion/failure persistence, metadata validation, config hashes, fingerprints, atomic `.part` outputs, exact planned-export verification, and zero-clip success.
- Remove fake stages and hardcoded binary paths/config duplicates.
- Run focused orchestration tests and targeted fixture CLI checks.

### Task 5: Selection-only workflow and ranking

**Files:** `tools/local-select`, existing candidate/score/render-plan tools, `packages/candidates`, `packages/scoring`, `packages/render-plan`, tests, root scripts.

- Add failing tests proving selection consumes events only, invalidates stale downstream artifacts, reuses valid scores, applies AUTO_RENDER/REVIEW semantics, normalizes signals, caps candidates, and suppresses overlap.
- Compose existing tools; add `local:select` and `--render`; implement metadata-aware candidate/score/render-plan regeneration, hybrid normalized scoring with semantic bonuses, anchored bounded clustering, NMS, max-clips, and optional review inclusion.
- Run selection/scoring/candidate/render-plan tests and fixture CLI checks.

### Task 6: Mortal Shell II detectors

**Files:** existing detector package/path discovered during implementation, fixtures, detector tests.

- Locate current detector implementation/config before reading. Add small fixture-driven tests for raw motion/audio signals and configured boss/health/death/defeat/discovery semantics.
- Implement only deterministic calibrated modules supported by available fixtures; preserve compatibility event names where needed.
- Run detector tests without large VODs.

### Task 7: Worker, TUI, and Web UI polish

**Files:** `tools/local-worker`, `packages/tooling`, `apps/web/src/*`, focused tests.

- Add failing tests for worker retry/backoff/auth/progress/failure elapsed time/shutdown, TUI canonical markers/heartbeat/restoration/JSON, and UI exact VOD display plus responsive/error/empty/focus states where test harness supports them.
- Implement one-job authenticated worker loop, bounded transient retries, clean shutdown, stable TUI redraw/cursor restoration, and existing-style responsive accessible UI without new dependencies.
- Visually inspect changed desktop/mobile web views with available tooling; record unavailable tooling honestly.

### Task 8: Documentation, CI, cleanup review, final verification

**Files:** `README.md`, `.github/workflows/ci.yml`, clearly obsolete code only.

- Update architecture, lifecycle, artifacts, commands, selection workflow, cleanup, worker, detectors, and upload-later boundary.
- Add CI for `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`; no real VOD E2E.
- Search for developer-specific paths, duplicate parsers/stages, unused queue wiring, stale docs, and impossible progress transitions; remove only clearly safe leftovers.
- Run `npm run typecheck`, `npm test`, `npm run build`, targeted cleanup/select/pipeline CLI tests, `git diff --check`, and final status review.

