export const EVENT_TYPES = [
  "BOSS_PRESENT",
  "BOSS_DEFEATED",
  "LOW_HEALTH",
  "PLAYER_DEATH",
  "COMBAT_SPIKE",
  "CRITICAL_ATTACK",
  "EXECUTION",
  "DISCOVERY",
  "MIC_REACTION"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const CANDIDATE_CATEGORIES = [
  "BOSS_KILL",
  "BOSS_CLOSE_CALL",
  "EXECUTION",
  "CRITICAL_ATTACK",
  "INTENSE_COMBAT",
  "FUNNY_DEATH",
  "REACTION",
  "DISCOVERY"
] as const;

export type CandidateCategory = (typeof CANDIDATE_CATEGORIES)[number];

export const JOB_STATES = [
  "PENDING",
  "ACQUIRING_MEDIA",
  "PROBING",
  "PREPROCESSING",
  "ANALYZING",
  "BUILDING_CANDIDATES",
  "SCORING",
  "RENDERING",
  "COMPLETE",
  "FAILED"
] as const;

export type JobState = (typeof JOB_STATES)[number];

export interface GameplayEvent {
  type: EventType;
  startMs: number;
  endMs: number;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Candidate {
  id: string;
  category: CandidateCategory;
  startMs: number;
  endMs: number;
  events: GameplayEvent[];
  reasons: string[];
}

export type CandidateDecision = "AUTO_RENDER" | "REVIEW" | "IGNORE";

export interface CandidateScore {
  candidateId: string;
  score: number;
  decision: CandidateDecision;
  reasons: string[];
}

export interface RenderPlanClip {
  candidateId: string;
  startMs: number;
  endMs: number;
  category: CandidateCategory;
  score: number;
  output: string;
}

export interface RenderPlan {
  clips: RenderPlanClip[];
}

export interface AnalysisJob {
  jobId: string;
  vodId: string;
  stage: JobState;
  progress: number;
  error: string | null;
}
