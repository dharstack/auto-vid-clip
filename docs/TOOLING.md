# Tooling

Deterministic tools live under `tools/`.

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
```

Real Twitch VOD acquisition requires `yt-dlp`. Rendering requires FFmpeg and ffprobe.

Use dry run for artifact flow without downloading or rendering:

```bash
npm run local:pipeline -- https://www.twitch.tv/videos/123456 --dry-run
```

## Deployment

Cloudflare API:

```bash
cd apps/api
npx wrangler login
npx wrangler d1 create auto-video-clip
npx wrangler queues create auto-video-clip-jobs
npx wrangler d1 execute auto-video-clip --file schema.sql --remote
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
npx wrangler deploy
```

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
