# Auto Clipper

Generic Twitch VOD clipper. Cloudflare stores metadata and jobs; local Windows PC performs media work.

## V1 Shape

- React TypeScript web UI accepts a Twitch channel.
- Cloudflare Worker resolves Twitch metadata and coordinates jobs.
- Local Python worker performs heavy media analysis with FFmpeg, ffprobe, OpenCV, and NumPy.
- Shared contracts live in `packages/contracts`.
- Repeated mechanical work becomes deterministic tools under `tools/`.

## Development Rule

One agent, one task, targeted context, deterministic tools, targeted tests.

## Current Phase

Phase 1 foundation: repository structure, contracts, config, docs, and tool result format.
# Mortal Shell II Auto-Clipper

Twitch VOD highlight pipeline. Web UI and Cloudflare API form the control plane; the local Node/TypeScript worker runs yt-dlp, FFmpeg, deterministic detectors, and OpenCode clip selection. Generated media is temporary; JSON artifacts, exports, and logs support resume and fast selection iteration.

## Commands

```bash
npm run local:pipeline -- <vod-or-local-file>
npm run local:pipeline -- <vod-or-local-file> --opencode
npm run local:pipeline -- <vod-or-local-file> --no-opencode
npm run local:pipeline -- <vod-or-local-file> --upload-youtube
npm run local:pipeline -- <vod-or-local-file> --cleanup
npm run local:select -- --job job-<vod-id>
npm run local:select -- --job job-<vod-id> --render
npm run local:clean -- --job job-<id>
npm run local:clean -- --all
npm run local:clean -- --all --dry-run
npm run local:clean -- --all --purge
npm run local:worker
```

`local:select` reads existing `events.json` and regenerates candidates, scores, and render plan without downloading or rerunning detection. `--render` currently reports the selected plan; full render handoff remains pending.

Clip selection uses OpenCode by default for both `local:pipeline` and `local:select`; `--opencode` selects the same mode explicitly, and `--no-opencode` uses deterministic scoring only. The default model is `opencode/mimo-v2.5-free`. Connect a free OpenCode account with `opencode auth login` and confirm that `opencode models` lists the model before running. Set `OPENCODE_MODEL` to another `opencode/*-free` model if the default is unavailable. OpenCode reviews compact candidate event data; it does not inspect the video directly. It returns candidate IDs for review and cannot run tools during selection. Its decision is saved in `opencode-selection.json`. If the free model is unavailable, the job fails before downloading media instead of silently switching modes.

Cleanup keeps exports, JSON artifacts, manifests, progress, and logs. Purge requires `Type DELETE to continue:` interactively or `--yes` non-interactively. Cleanup protects active or incomplete jobs and requires an `.auto-clipper-root` sentinel.

Pipeline order is resolve, acquire, probe, preprocess, detect, candidate formation, scoring, OpenCode selection, render-plan generation, range acquisition, render, verification, optional cleanup, optional YouTube upload, complete. Upload is opt-in and defaults to private.

YouTube upload requires `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `YOUTUBE_REFRESH_TOKEN`. Set optional `YOUTUBE_PRIVACY_STATUS` to `private`, `unlisted`, or `public`. Upload metadata is saved as `youtube-<candidate-id>.json`; rendered exports remain when upload fails.

## Pipeline Trace

View the simplified [pipeline trace](https://dharstack.github.io/auto-vid-clip/).
