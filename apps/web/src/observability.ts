export const PIPELINE_STAGES = ["RESOLVE", "DOWNLOAD_ANALYSIS_MEDIA", "PROBE", "BUILD_PROXY", "EXTRACT_AUDIO", "DETECT", "BUILD_CANDIDATES", "SCORE", "BUILD_RENDER_PLAN", "ACQUIRE_RENDER_RANGE", "RENDER", "VERIFY_EXPORTS", "CLEANUP"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export const STAGE_LABELS: Record<PipelineStage, string> = {
  RESOLVE: "Resolve VOD", DOWNLOAD_ANALYSIS_MEDIA: "Acquire Analysis Media", PROBE: "Probe", BUILD_PROXY: "Build Proxy", EXTRACT_AUDIO: "Extract Audio", DETECT: "Detect Events", BUILD_CANDIDATES: "Build Candidates", SCORE: "Score", BUILD_RENDER_PLAN: "Build Render Plan", ACQUIRE_RENDER_RANGE: "Acquire Render Range", RENDER: "Render", VERIFY_EXPORTS: "Verify Exports", CLEANUP: "Cleanup"
};
export interface WorkerStatusSnapshot { workerId: string | null; online: boolean; status: "IDLE" | "RUNNING" | null; currentJobId: string | null; lastSeenAt: string | null; startedAt: string | null; version: string | null; }
