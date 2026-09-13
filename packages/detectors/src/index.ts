import type { GameplayEvent, MediaProbe } from "@auto-clipper/contracts";

export function detectEventsFromProbe(probe: MediaProbe): GameplayEvent[] {
  const duration = Math.max(probe.durationMs, 1);
  const first = Math.floor(duration * 0.25);
  const middle = Math.floor(duration * 0.5);
  const last = Math.floor(duration * 0.75);

  const events: GameplayEvent[] = [
    {
      type: "BOSS_PRESENT",
      startMs: Math.max(0, middle - 16000),
      endMs: Math.min(duration, middle + 16000),
      confidence: 0.82,
      metadata: { source: "deterministic-probe" }
    },
    {
      type: "LOW_HEALTH",
      startMs: Math.max(0, middle - 4000),
      endMs: Math.min(duration, middle - 1000),
      confidence: 0.8,
      metadata: { estimatedHealthPercent: 18, source: "deterministic-probe" }
    },
    {
      type: "COMBAT_SPIKE",
      startMs: Math.max(0, middle - 3000),
      endMs: Math.min(duration, middle + 4000),
      confidence: 0.78,
      metadata: { source: "deterministic-probe" }
    },
    {
      type: "CRITICAL_ATTACK",
      startMs: Math.max(0, middle - 2500),
      endMs: Math.min(duration, middle + 2500),
      confidence: 0.76,
      metadata: { source: "deterministic-probe" }
    },
    {
      type: "BOSS_DEFEATED",
      startMs: Math.max(0, middle + 7000),
      endMs: Math.min(duration, middle + 10000),
      confidence: 0.82,
      metadata: { source: "deterministic-probe" }
    }
  ];

  if (probe.hasAudio) {
    events.push({
      type: "MIC_REACTION",
      startMs: Math.max(0, last - 2000),
      endMs: Math.min(duration, last + 3000),
      confidence: 0.8,
      metadata: { source: "audio-present" }
    });
  }

  return events;
}
