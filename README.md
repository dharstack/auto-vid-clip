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

Deterministic Twitch VOD highlight pipeline. Web UI and Cloudflare API form the control plane; local Node/TypeScript worker runs yt-dlp, FFmpeg, and fixture-driven detectors. Generated media is temporary; JSON artifacts, exports, and logs support resume and fast selection iteration.

## Commands

```bash
npm run local:pipeline -- <vod-or-local-file>
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

Cleanup keeps exports, JSON artifacts, manifests, progress, and logs. Purge requires `Type DELETE to continue:` interactively or `--yes` non-interactively. Cleanup protects active or incomplete jobs and requires an `.auto-clipper-root` sentinel.

Pipeline order is resolve, acquire, probe, preprocess, detect, candidate formation, scoring, render-plan generation, range acquisition, render, verification, optional cleanup, complete. YouTube upload is intentionally reserved for a later integration.
