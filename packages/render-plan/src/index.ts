import { DEFAULT_CONFIG } from "@auto-clipper/config";
import type { Candidate, CandidateScore, RenderPlan } from "@auto-clipper/contracts";

export interface RenderPlanOptions {
  sourceDurationMs?: number;
  maxClips?: number;
  preRollSeconds?: number;
  postRollSeconds?: number;
}

export function buildRenderPlan(
  candidates: Candidate[],
  scores: CandidateScore[],
  options: RenderPlanOptions = {}
): RenderPlan {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const maxClips = options.maxClips ?? DEFAULT_CONFIG.maxClips;
  const preRollMs = (options.preRollSeconds ?? DEFAULT_CONFIG.clip.preRollSeconds) * 1000;
  const postRollMs = (options.postRollSeconds ?? DEFAULT_CONFIG.clip.postRollSeconds) * 1000;
  const durationMs = options.sourceDurationMs ?? Number.MAX_SAFE_INTEGER;

  const renderable = scores
    .filter((score) => score.decision !== "IGNORE")
    .sort((left, right) => right.score - left.score)
    .slice(0, maxClips);

  return {
    clips: renderable.map((score, index) => {
      const candidate = byId.get(score.candidateId);
      if (!candidate) {
        throw new Error(`RENDER_PLAN_CANDIDATE_MISSING: ${score.candidateId}`);
      }
      return {
        candidateId: candidate.id,
        startMs: Math.max(0, candidate.startMs - preRollMs),
        endMs: Math.min(durationMs, candidate.endMs + postRollMs),
        category: candidate.category,
        score: score.score,
        output: `${String(index + 1).padStart(2, "0")}-${slug(candidate.category)}.mp4`
      };
    })
  };
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}
