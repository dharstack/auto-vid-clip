export const JOB_STATUSES = ["QUEUED", "CLAIMED", "RUNNING", "COMPLETE", "FAILED", "INTERRUPTED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const PIPELINE_STAGES = [
  "RESOLVE",
  "DOWNLOAD_ANALYSIS_MEDIA",
  "PROBE",
  "BUILD_PROXY",
  "EXTRACT_AUDIO",
  "DETECT",
  "BUILD_CANDIDATES",
  "SCORE",
  "BUILD_RENDER_PLAN",
  "ACQUIRE_RENDER_RANGE",
  "RENDER",
  "VERIFY_EXPORTS",
  "CLEANUP"
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  RESOLVE: "Resolve VOD",
  DOWNLOAD_ANALYSIS_MEDIA: "Acquire Analysis Media",
  PROBE: "Probe",
  BUILD_PROXY: "Build Proxy",
  EXTRACT_AUDIO: "Extract Audio",
  DETECT: "Detect Events",
  BUILD_CANDIDATES: "Build Candidates",
  SCORE: "Score",
  BUILD_RENDER_PLAN: "Build Render Plan",
  ACQUIRE_RENDER_RANGE: "Acquire Render Range",
  RENDER: "Render",
  VERIFY_EXPORTS: "Verify Exports",
  CLEANUP: "Cleanup"
};

const LEGACY_STAGE_MAP: Record<string, PipelineStage> = {
  RESOLVE: "RESOLVE",
  DOWNLOAD_ANALYSIS_MEDIA: "DOWNLOAD_ANALYSIS_MEDIA",
  PROBE: "PROBE",
  BUILD_PROXY: "BUILD_PROXY",
  EXTRACT_AUDIO: "EXTRACT_AUDIO",
  DETECT_VIDEO: "DETECT",
  DETECT_AUDIO: "DETECT",
  DETECT: "DETECT",
  BUILD_CANDIDATES: "BUILD_CANDIDATES",
  SCORE: "SCORE",
  BUILD_RENDER_PLAN: "BUILD_RENDER_PLAN",
  ACQUIRE_RENDER_RANGE: "ACQUIRE_RENDER_RANGE",
  RENDER: "RENDER",
  VERIFY_EXPORTS: "VERIFY_EXPORTS",
  CLEANUP: "CLEANUP",
  COMPLETE: "CLEANUP"
};

export function normalizePipelineStage(stage: string): PipelineStage {
  return LEGACY_STAGE_MAP[stage.toUpperCase()] ?? "RESOLVE";
}

export type WorkerStatus = "IDLE" | "RUNNING";

export interface WorkerStatusSnapshot {
  workerId: string | null;
  online: boolean;
  status: WorkerStatus | null;
  currentJobId: string | null;
  lastSeenAt: string | null;
  startedAt: string | null;
  version: string | null;
}

export interface JobTelemetry {
  jobId: string;
  vodId: string;
  status: JobStatus | string;
  stage: PipelineStage | string;
  progress: number | null;
  message: string | null;
  elapsedMs: number | null;
  etaMs: number | null;
  error: string | null;
  worker: string | null;
  updatedAt: string | null;
  lastSuccessfulStage?: PipelineStage | string | null;
  clipsPlanned?: number | null;
  clipsRendered?: number | null;
}
