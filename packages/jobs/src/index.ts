export const PIPELINE_STAGES = [
  "resolve",
  "acquire",
  "probe",
  "proxy",
  "audio",
  "detect",
  "candidate",
  "score",
  "renderPlan",
  "render"
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type StageStatus = "pending" | "complete" | "failed";

export interface JobManifest {
  jobId: string;
  vodId: string;
  pipelineVersion: string;
  stages: Record<PipelineStage, StageStatus>;
  error: string | null;
}

export function createManifest(input: { jobId: string; vodId: string; pipelineVersion?: string }): JobManifest {
  return {
    jobId: input.jobId,
    vodId: input.vodId,
    pipelineVersion: input.pipelineVersion ?? "1.0.0",
    stages: Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage, "pending"])) as Record<PipelineStage, StageStatus>,
    error: null
  };
}

export function updateManifestStage(manifest: JobManifest, stage: PipelineStage, status: StageStatus, error: string | null = null): JobManifest {
  return {
    ...manifest,
    stages: {
      ...manifest.stages,
      [stage]: status
    },
    error
  };
}

export function nextStage(manifest: JobManifest): PipelineStage | null {
  return PIPELINE_STAGES.find((stage) => manifest.stages[stage] === "pending") ?? null;
}
