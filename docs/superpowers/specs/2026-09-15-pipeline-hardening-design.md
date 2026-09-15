# Auto-Clipper Pipeline Hardening Design

## Goal

Make local and cloud-controlled processing safe, deterministic, resumable, cache-aware, selection-rerunnable, operable, and ready for later upload integration without runtime AI or paid services.

## Architecture

Use one shared contracts package for canonical Twitch identity, pipeline stages, lifecycle statuses, artifact metadata, and job state. The local pipeline persists stage state and small JSON artifacts in each job directory; expensive media remains reusable only when metadata proves validity. The API uses D1 as the sole V1 queue, with authenticated atomic worker claims.

The pipeline executes RESOLVE, ACQUIRE, PROBE, PREPROCESS, DETECT, BUILD_CANDIDATES, SCORE, BUILD_RENDER_PLAN, ACQUIRE_RENDER_RANGES, RENDER, VERIFY_EXPORTS, optional CLEANUP, then COMPLETE. FAILED is terminal metadata. Selection reruns start from valid events.json and never reacquire or redetect.

## Safety and trust boundary

Remote jobs accept numeric vodId and server-canonicalize to `https://www.twitch.tv/videos/<vodId>`. Local CLI inputs may remain local files. Worker-only endpoints require `Authorization: Bearer` using `AUTO_CLIPPER_WORKER_TOKEN`; browser endpoints stay separate. Configured CORS origin replaces wildcard production default. Destructive cleanup requires a recognized work-root sentinel and rejects traversal, symlinks, arbitrary paths, active jobs, and incomplete jobs.

## Cache and artifacts

Reusable artifacts carry compact generator, generatorVersion, configHash, input/upstream fingerprints, schemaVersion, and creation metadata. Cache reuse requires matching metadata. Large outputs write to `.part` paths and atomically rename after successful completion. Stage-specific config changes invalidate only affected downstream artifacts.

## Selection and ranking

Add `local:select -- --job <id>` and optional `--render`, composing existing candidate, scoring, and render-plan tools. Ranking uses normalized motion/audio signals, signal agreement, rarity, persistence, event density, semantic bonuses, configurable max clips, temporal clustering, anchor windows, and overlap suppression. AUTO_RENDER renders by default; REVIEW remains retained but excluded unless explicitly included. Zero planned clips is successful.

## UI and operations

Polish `apps/web` using existing components/styles. Selected historical VODs display and submit immutable vodId URLs. UI reflects canonical stage/status semantics and handles loading, empty, error, disabled, selected, focus, and success states across mobile and desktop without new dependencies. Local TUI uses the same stages, redraws one terminal region, heartbeats elapsed time, restores cursor state, and supports JSON output without ANSI. SIGINT propagates one AbortSignal to child processes, preserves completed artifacts, and exits 130.

## Verification

Use temporary fixture work roots, fake binaries, mocked HTTP, and existing small media. Add focused tests for cleanup safety/lifecycle, canonical identity, API auth/claims, stage transitions, cache invalidation, selection reuse, scoring/candidates, zero clips, cancellation, TUI restoration, and JSON output. Run typecheck, tests, build, targeted CLI checks, and visual UI checks when tooling is available. Do not run full real-VOD E2E or inspect generated video binaries.

## Scope

Document current architecture and commands, add simple CI for install/typecheck/test/build, remove only clearly obsolete queue/state/parser/path code, and leave YouTube upload unimplemented.
