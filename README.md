# Mortal Shell II Auto-Clipper

Inline-only, deterministic-first auto-clipper for turning a Twitch channel's latest Mortal Shell II VOD into ranked local MP4 highlights.

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
