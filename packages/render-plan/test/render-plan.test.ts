import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, CandidateScore } from "@auto-clipper/contracts";
import { buildRenderPlan } from "../src/index.js";

const candidate: Candidate = {
  id: "cand-1",
  category: "BOSS_CLOSE_CALL",
  startMs: 10000,
  endMs: 34000,
  reasons: [],
  events: []
};

const score: CandidateScore = {
  candidateId: "cand-1",
  score: 0.96,
  decision: "AUTO_RENDER",
  reasons: []
};

test("builds render plan with pre-roll, post-roll, and slug output", () => {
  const plan = buildRenderPlan([candidate], [score], { sourceDurationMs: 120000 });
  assert.deepEqual(plan.clips, [
    {
      candidateId: "cand-1",
      startMs: 0,
      endMs: 44000,
      category: "BOSS_CLOSE_CALL",
      score: 0.96,
      output: "01-boss-close-call.mp4"
    }
  ]);
});
