import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate } from "@auto-clipper/contracts";
import { scoreCandidates } from "../src/index.js";

const candidate: Candidate = {
  id: "cand-1",
  category: "BOSS_CLOSE_CALL",
  startMs: 10000,
  endMs: 34000,
  reasons: ["Boss present", "Health reached 12%", "Boss defeated"],
  events: [
    { type: "BOSS_PRESENT", startMs: 10000, endMs: 16000, confidence: 0.99 },
    { type: "LOW_HEALTH", startMs: 18000, endMs: 22000, confidence: 0.95 },
    { type: "COMBAT_SPIKE", startMs: 24000, endMs: 25000, confidence: 0.82 },
    { type: "BOSS_DEFEATED", startMs: 30000, endMs: 34000, confidence: 0.98 }
  ]
};

test("scores candidates deterministically with threshold decision", () => {
  const [score] = scoreCandidates([candidate]);
  assert.equal(score.candidateId, "cand-1");
  assert.equal(score.score, 0.77);
  assert.equal(score.decision, "REVIEW");
});

test("auto-renders high confidence mixed-event candidate", () => {
  const [score] = scoreCandidates([{ ...candidate, events: [...candidate.events, { type: "MIC_REACTION", startMs: 31000, endMs: 32000, confidence: 0.96 }, { type: "CRITICAL_ATTACK", startMs: 28000, endMs: 29000, confidence: 0.9 }] }]);
  assert.equal(score.score, 0.96);
  assert.equal(score.decision, "AUTO_RENDER");
});
