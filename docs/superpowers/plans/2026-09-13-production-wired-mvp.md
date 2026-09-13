# Production-Wired MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Inline execution only for this repository. Do not use subagents or multi-agent orchestration. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build remaining phases 5-11 so a Twitch VOD URL or local media path can start a deterministic local pipeline and production web/API configs can deploy to Cloudflare and Vercel.

**Architecture:** Cloudflare Worker remains control plane for resolve/job metadata. Vercel React app is browser UI. Local pipeline owns media acquisition, probing, deterministic event detection, candidate grouping, scoring, render planning, and FFmpeg rendering.

**Tech Stack:** TypeScript workspaces, Cloudflare Workers, D1 schema, Vite React, FFmpeg, ffprobe, optional `yt-dlp`.

**Spec:** `docs/PRD.md`

## Global Constraints

- Work inline in this session.
- Never create or use subagents.
- No runtime AI.
- No paid services.
- Cloudflare does not process video.
- Local pipeline may process video through FFmpeg and deterministic tools.
- VOD media acquisition uses `yt-dlp` when given Twitch VOD URLs; local paths stay local.
- Normal tests use fixtures, not full VODs.

---

### Task 1: Candidate, Scoring, Render Plan Packages

**Files:**
- Create: `packages/candidates`
- Create: `packages/scoring`
- Create: `packages/render-plan`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GameplayEvent`, `Candidate`, `CandidateScore`, `RenderPlan`
- Produces: `buildCandidates(events, config)`, `scoreCandidates(candidates, config)`, `buildRenderPlan(scores, candidates, config)`

- [ ] Write failing tests for boss close call grouping, duplicate suppression, score thresholds, render plan timing.
- [ ] Run targeted tests and verify missing modules fail.
- [ ] Implement minimal deterministic logic.
- [ ] Run package tests.

### Task 2: Remaining CLI Tools

**Files:**
- Create: `tools/detect-events`
- Create: `tools/build-candidates`
- Create: `tools/score-candidates`
- Create: `tools/build-render-plan`
- Create: `tools/render-clips`
- Create: `tools/job-status`
- Create: `tools/pipeline-run`

**Interfaces:**
- Consumes: JSON artifacts and media paths.
- Produces: compact `ToolResult` JSON.

- [ ] Write failing tests for pure package logic only.
- [ ] Implement CLIs using package logic.
- [ ] Smoke test CLIs with fixture JSON and dry-run where possible.

### Task 3: Local Worker Pipeline

**Files:**
- Create: `local/worker/src`
- Create: `packages/jobs`
- Create: `tools/pipeline-run/src/index.ts`

**Interfaces:**
- Produces: `work/<job-id>/manifest.json`, `events.json`, `candidates.json`, `scores.json`, `render-plan.json`, `exports/`

- [ ] Write failing tests for manifest creation, stage status, restart-safe artifact writes.
- [ ] Implement job directory and manifest helpers.
- [ ] Implement pipeline orchestration using existing tools/packages.
- [ ] Run targeted tests.

### Task 4: Cloudflare API

**Files:**
- Create: `apps/api/src/index.ts`
- Create: `apps/api/wrangler.jsonc`
- Create: `apps/api/schema.sql`
- Create: `apps/api/package.json`

**Interfaces:**
- `GET /health`
- `POST /api/resolve`
- `POST /api/jobs`
- `GET /api/jobs/:id`

- [ ] Implement Worker routes with CORS.
- [ ] Add D1 schema.
- [ ] Build with Wrangler.

### Task 5: Vercel Web App

**Files:**
- Create: `apps/web/src`
- Create: `apps/web/package.json`
- Create: `apps/web/vercel.json`
- Create: `apps/web/index.html`

**Interfaces:**
- `VITE_API_BASE_URL`

- [ ] Implement React UI for VOD/channel input, resolve, create job, status view, local command hint.
- [ ] Build Vite app.

### Task 6: Production CLI Wiring

**Files:**
- Modify: root `package.json`
- Create: `.env.example`

**Interfaces:**
- `npm run deploy:cloudflare`
- `npm run deploy:vercel`
- `npm run local:pipeline -- <vod-url-or-path>`

- [ ] Add scripts using `wrangler deploy` and `vercel --prod`.
- [ ] Verify CLI availability or report exact install/login commands.
- [ ] Run final tests, typecheck, builds, CLI smoke.

