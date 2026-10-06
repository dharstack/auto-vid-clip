import assert from "node:assert/strict";
import test from "node:test";
import type { Candidate, CandidateScore } from "@auto-clipper/contracts";
import { applyOpenCodeSelection, parseOpenCodeSelection } from "../src/index.js";

const candidates: Candidate[] = [
  { id: "cand-001", category: "INTENSE_COMBAT", startMs: 1000, endMs: 5000, events: [], reasons: [] },
  { id: "cand-002", category: "REACTION", startMs: 7000, endMs: 9000, events: [], reasons: [] }
];
const scores: CandidateScore[] = candidates.map((candidate) => ({ candidateId: candidate.id, score: 0.1, decision: "IGNORE", reasons: [] }));
const model = "opencode/mimo-v2.5-free";

test("uses only validated OpenCode candidate IDs", () => {
  const output = JSON.stringify({ type: "text", part: { text: '{"selected":[{"candidateId":"cand-002","reason":"Nearby signals"}]}' } });
  const selection = parseOpenCodeSelection(output, candidates, model);
  const result = applyOpenCodeSelection(scores, selection);
  assert.deepEqual(result.map((score) => score.decision), ["IGNORE", "REVIEW"]);
  assert.equal(result[1].score, 0.75);
  assert.match(result[1].reasons[0], /OpenCode: Nearby signals/);
});

test("rejects invented candidate IDs and provider errors", () => {
  const invented = JSON.stringify({ type: "text", part: { text: '{"selected":[{"candidateId":"made-up","reason":"guess"}]}' } });
  assert.throws(() => parseOpenCodeSelection(invented, candidates, model), /unknown or repeated candidate ID/);
  const error = JSON.stringify({ type: "error", error: { message: "Model unavailable" } });
  assert.throws(() => parseOpenCodeSelection(error, candidates, model), /Model unavailable/);
});
