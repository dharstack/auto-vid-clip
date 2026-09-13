import type { ToolError, ToolResult } from "@auto-clipper/contracts";
import type { PipelineProgress, PipelineProgressStage } from "@auto-clipper/contracts";

const CLI_STAGES: Array<[PipelineProgressStage, string]> = [
  ["RESOLVE", "Resolve VOD"], ["DOWNLOAD_ANALYSIS_MEDIA", "Prepare analysis media"], ["FINALIZE_MEDIA", "Finalize media"],
  ["PROBE", "Probe media"], ["BUILD_PROXY", "Build proxy"], ["EXTRACT_AUDIO", "Extract audio"], ["DETECT_VIDEO", "Detect gameplay"],
  ["DETECT_AUDIO", "Detect audio"], ["BUILD_CANDIDATES", "Build candidates"], ["SCORE", "Score highlights"],
  ["BUILD_RENDER_PLAN", "Build render plan"], ["ACQUIRE_RENDER_RANGE", "Acquire source ranges"], ["RENDER", "Render clips"]
];

export function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

export function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

export function requireFlagValue(argv: string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (!value || value.startsWith("--")) {
    throw new Error(`ARG_REQUIRED: ${flag}`);
  }
  return value;
}

export function positionalArg(argv: string[], index: number): string | undefined {
  return argv.filter((arg) => !arg.startsWith("--"))[index];
}

export function printToolResult<T extends object>(result: ToolResult<T>): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function toToolError(error: unknown, code: string): ToolError {
  return {
    status: "error",
    code,
    message: error instanceof Error ? error.message : String(error)
  };
}

export function formatCliProgress(progress: PipelineProgress, completedStages: string[] = [], header: { vod?: string; durationMs?: number } = {}): string {
  const lines = ["Mortal Shell II Auto-Clipper", "", header.vod ? `VOD: ${header.vod}` : "", header.durationMs ? `Duration: ${formatElapsed(header.durationMs)}` : "", `Job: ${progress.jobId}`, "", "----------------------------------------"];
  for (const [stage, label] of CLI_STAGES) {
    const marker = stage === progress.stage && progress.status === "running" ? ">" : completedStages.includes(stage) || (stage === progress.stage && progress.status === "complete") ? "x" : "o";
    const suffix = stage === progress.stage && progress.status === "running" ? formatRunningProgress(progress) : "";
    lines.push(`[${marker}] ${label}${suffix}`);
    if (stage === progress.stage && progress.status === "running" && progress.bytesCompleted !== undefined && progress.bytesTotal !== undefined && progress.bytesCompleted !== null && progress.bytesTotal !== null) {
      lines.push(`    ${formatBytes(progress.bytesCompleted)} / ${formatBytes(progress.bytesTotal)}`);
    }
  }
  lines.push("", "----------------------------------------", `Elapsed: ${formatElapsed(progress.elapsedMs)}`);
  return lines.join("\n");
}

function formatRunningProgress(progress: PipelineProgress): string {
  const percent = progress.progress === null || progress.progress === undefined ? "" : ` ${Math.round(progress.progress * 100)}%`;
  const details = progress.speedBytesPerSecond ? ` ${formatBytes(progress.speedBytesPerSecond)}/s` : "";
  const eta = progress.etaMs === null || progress.etaMs === undefined ? "" : ` ETA ${formatElapsed(progress.etaMs)}`;
  return `${percent}${details}${eta}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m` : `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${Math.round(bytes)} B`;
}
