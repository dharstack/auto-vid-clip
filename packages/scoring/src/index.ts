import type { Candidate, CandidateDecision, CandidateScore, EventType } from "@auto-clipper/contracts";

export interface ScoringOptions {
  minimumScore?: number;
  autoRenderScore?: number;
  weights?: Partial<Record<EventType, number>>;
}

export const DEFAULT_WEIGHTS: Record<EventType, number> = {
  BOSS_DEFEATED: 0.4,
  BOSS_PRESENT: 0.2,
  LOW_HEALTH: 0.15,
  PLAYER_DEATH: 0.2,
  COMBAT_SPIKE: 0.05,
  CRITICAL_ATTACK: 0.1,
  EXECUTION: 0.25,
  DISCOVERY: 0.15,
  MIC_REACTION: 0.1
};

export function scoreCandidates(candidates: Candidate[], options: ScoringOptions = {}): CandidateScore[] {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const minimumScore = options.minimumScore ?? 0.75;
  const autoRenderScore = options.autoRenderScore ?? 0.9;

  return candidates.map((candidate) => {
    const score = clamp(round2(candidate.events.reduce((sum, event) => sum + weights[event.type] * event.confidence, 0)));
    return {
      candidateId: candidate.id,
      score,
      decision: decisionFor(score, minimumScore, autoRenderScore),
      reasons: candidate.reasons
    };
  });
}

function decisionFor(score: number, minimumScore: number, autoRenderScore: number): CandidateDecision {
  if (score >= autoRenderScore) return "AUTO_RENDER";
  if (score >= minimumScore) return "REVIEW";
  return "IGNORE";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
