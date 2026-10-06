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

test("reviews nearby motion and audio signals from real media", () => {
  const events: Candidate["events"] = [
    { type: "MIC_REACTION", startMs: 77000, endMs: 78000, confidence: 0.143 },
    { type: "COMBAT_SPIKE", startMs: 81500, endMs: 85500, confidence: 0.328 }
  ];
  const [score] = scoreCandidates([{ ...candidate, category: "INTENSE_COMBAT", events }]);
  assert.equal(score.score, 0.78);
  assert.equal(score.decision, "REVIEW");
});

test("ignores isolated or distant low confidence signals", () => {
  const audio = { type: "MIC_REACTION" as const, startMs: 0, endMs: 1000, confidence: 0.143 };
  const motion = { type: "COMBAT_SPIKE" as const, startMs: 7000, endMs: 11000, confidence: 0.328 };
  const [isolated, distant] = scoreCandidates([
    { ...candidate, events: [audio] },
    { ...candidate, events: [audio, motion] }
  ]);
  assert.equal(isolated.decision, "IGNORE");
  assert.equal(distant.decision, "IGNORE");
});
