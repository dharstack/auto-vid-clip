export const PIPELINE_PROGRESS_STAGES = [
  "RESOLVE",
  "DOWNLOAD_ANALYSIS_MEDIA",
  "FINALIZE_MEDIA",
  "PROBE",
  "BUILD_PROXY",
  "EXTRACT_AUDIO",
  "DETECT_VIDEO",
  "DETECT_AUDIO",
  "BUILD_CANDIDATES",
  "SCORE",
  "BUILD_RENDER_PLAN",
  "ACQUIRE_RENDER_RANGE",
  "RENDER",
  "COMPLETE",
  "FAILED"
] as const;

export type PipelineProgressStage = (typeof PIPELINE_PROGRESS_STAGES)[number];

export type PipelineProgressStatus = "pending" | "running" | "complete" | "failed";

export interface PipelineProgress {
  jobId: string;
  stage: PipelineProgressStage;
  status: PipelineProgressStatus;
  progress?: number | null;
  message: string;
  elapsedMs: number;
  etaMs?: number | null;
  bytesCompleted?: number | null;
  bytesTotal?: number | null;
  speedBytesPerSecond?: number | null;
  speedRealtime?: number | null;
  updatedAt: string;
}
