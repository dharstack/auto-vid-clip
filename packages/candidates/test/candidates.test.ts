import assert from "node:assert/strict";
import test from "node:test";
import type { GameplayEvent } from "@auto-clipper/contracts";
import { buildCandidates } from "../src/index.js";

const closeCallEvents: GameplayEvent[] = [
  { type: "BOSS_PRESENT", startMs: 10000, endMs: 16000, confidence: 0.99 },
  { type: "LOW_HEALTH", startMs: 18000, endMs: 22000, confidence: 0.95, metadata: { estimatedHealthPercent: 12 } },
  { type: "COMBAT_SPIKE", startMs: 24000, endMs: 25000, confidence: 0.82 },
  { type: "BOSS_DEFEATED", startMs: 30000, endMs: 34000, confidence: 0.98 }
];

test("builds boss close call from related events", () => {
  const candidates = buildCandidates(closeCallEvents);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].category, "BOSS_CLOSE_CALL");
  assert.equal(candidates[0].startMs, 10000);
  assert.equal(candidates[0].endMs, 34000);
  assert.ok(candidates[0].reasons.includes("Boss defeated"));
  assert.ok(candidates[0].reasons.includes("Health reached 12%"));
});

test("suppresses overlapping duplicate candidates", () => {
  const candidates = buildCandidates([
    ...closeCallEvents,
    { type: "CRITICAL_ATTACK", startMs: 32000, endMs: 36000, confidence: 0.9 }
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].endMs, 36000);
});
