# Architecture

Cloudflare is the control plane. Local PC is the video processor.

## Flow

1. Web UI accepts Twitch channel input.
2. Cloudflare Worker resolves channel and latest archived VOD.
3. Job metadata is stored in D1.
4. Local worker acquires media and runs deterministic tools.
5. Events become candidates.
6. Candidates are scored.
7. Render plan becomes local MP4 clips.

## Boundary

After detectors write `events.json`, no later stage performs video analysis.
