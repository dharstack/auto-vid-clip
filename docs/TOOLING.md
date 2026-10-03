# Tooling

Deterministic tools live under `tools/`.

## OpenCode Development Helpers

OpenCode is the development harness. Fledge Alpha Free is a hosted development model and may be rate-limited; switch models manually or stop when unavailable. Auto Clipper runtime stays deterministic and has no Fledge dependency. Repo AI tools below gather deterministic context and run checks; they do not call an LLM.

Each app, package, and tool owns its `src/` and `test/` directories. Keep docs in `docs/`, fixtures in `fixtures/`, and local state in `.local/` or `work/`. Avoid source files at repository root.

```bash
npm run ai:context -- "fix youtube upload"
npm run ai:impact -- tools/youtube-upload/src/index.ts
npm run ai:check
npm run ai:check -- --full
npm run architecture:json
```

Default `ai:check` runs build, typecheck, and tests only for changed workspaces. `--full` runs repo-wide checks. Failed full output is saved under ignored `.local/ai/logs/`; command output stays compact JSON. AI tools scan known code roots and skip generated/local directories.

`architecture:json` deterministically refreshes root `architecture.json`. It uses shared pipeline stages from `packages/contracts/`.

Local fixture E2E uses real FFmpeg/ffprobe and temporary work state:

```bash
npm run test:e2e
npm run test:all
```

Planned tools:

- `twitch-resolve`
- `media-acquire`
- `media-probe`
- `proxy-build`
- `audio-extract`
- `detect-events`
- `build-candidates`
- `score-candidates`
- `build-render-plan`
- `render-clips`
- `job-status`
- `pipeline-run`

Every tool should accept explicit inputs, support `--json`, return stable compact schemas, write verbose logs to disk, and use meaningful exit codes.

## Local Pipeline

```bash
npm run build
npm run local:pipeline -- https://www.twitch.tv/videos/123456

# Process queued web jobs from local PC
npm run build
npm run local:worker
```

Real Twitch VOD acquisition requires `yt-dlp`. Rendering requires FFmpeg and ffprobe.

Use dry run for artifact flow without downloading or rendering:

```bash
npm run local:pipeline -- https://www.twitch.tv/videos/123456 --dry-run
```

## Deployment

Cloudflare API:

```bash
cd <repo-root>
npm run deploy:cloudflare
cd apps/api
npx wrangler d1 migrations apply auto-video-clip --remote
```

Vercel auto-deploys web. Cloudflare Worker does not auto-deploy from this repository.
Redeploy Worker after API or CORS changes. Apply remote D1 migrations before using watched channels; `0005_watched_channels.sql` is required.

Production Vercel variable:

```text
VITE_API_BASE_URL=https://auto-video-clip-api.dharzannn.workers.dev
```

Set `VITE_API_BASE_URL` in Vercel Production, then redeploy web when changing it.

Local API development uses `apps/api/.dev.vars`:

```text
TWITCH_CLIENT_ID=<client-id>
TWITCH_CLIENT_SECRET=<client-secret>
```

Vercel web:

```bash
cd apps/web
vercel link
vercel env add VITE_API_BASE_URL production
vercel --prod
```
