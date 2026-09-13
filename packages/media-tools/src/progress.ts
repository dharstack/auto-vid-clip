import type { PipelineProgress, PipelineProgressStage } from "@auto-clipper/contracts";

export interface ProgressParseContext {
  jobId: string;
  nowMs: number;
  startedAtMs: number;
}

export interface FfmpegProgressContext extends ProgressParseContext {
  stage: Extract<PipelineProgressStage, "BUILD_PROXY" | "EXTRACT_AUDIO" | "RENDER">;
  totalDurationMs: number;
}

export interface ProgressThrottleContext {
  nowMs: number;
  lastEmittedAtMs: number;
  minIntervalMs?: number;
  minProgressDelta?: number;
}

export function parseYtDlpProgressLine(line: string, context: ProgressParseContext): PipelineProgress | null {
  if (line.includes("[FixupM3u8]") || line.includes("Fixing MPEG-TS")) {
    return baseProgress(context, "FINALIZE_MEDIA", "running", "Finalizing downloaded video", null);
  }

  if (!line.includes("[download]")) return null;

  const percent = matchNumber(line, /([\d.]+)%/);
  if (percent === null) return null;

  const totalMatch = line.match(/of\s+~?([\d.]+)\s*([KMGT]?i?B)/i);
  const speedMatch = line.match(/at\s+([\d.]+)\s*([KMGT]?i?B)\/s/i);
  const etaMatch = line.match(/ETA\s+([0-9:]+)/i);
  const bytesTotal = totalMatch ? parseByteSize(totalMatch[1], totalMatch[2]) : null;
  const progress = roundProgress(clamp(percent / 100, 0, 1));

  return {
    ...baseProgress(context, "DOWNLOAD_ANALYSIS_MEDIA", "running", "Downloading analysis media", progress),
    bytesTotal,
    bytesCompleted: bytesTotal === null ? null : Math.round(bytesTotal * progress),
    speedBytesPerSecond: speedMatch ? parseByteSize(speedMatch[1], speedMatch[2]) : null,
    etaMs: etaMatch ? parseDurationToMs(etaMatch[1]) : null
  };
}

export function parseFfmpegProgress(raw: string, context: FfmpegProgressContext): PipelineProgress {
  const fields = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) fields.set(line.slice(0, separator), line.slice(separator + 1));
  }

  const complete = fields.get("progress") === "end";
  const outTimeMs = parseFfmpegOutTimeMs(fields);
  const speedRealtime = parseSpeed(fields.get("speed"));
  const progress = complete ? 1 : clamp(outTimeMs / context.totalDurationMs, 0, 1);
  const etaMs = complete ? 0 : estimateEtaMs(context.totalDurationMs, outTimeMs, speedRealtime);

  return {
    ...baseProgress(context, context.stage, complete ? "complete" : "running", messageForStage(context.stage), progress),
    etaMs,
    speedRealtime
  };
}

export function shouldEmitProgress(
  previous: PipelineProgress | null,
  next: PipelineProgress,
  context: ProgressThrottleContext
): boolean {
  if (!previous) return true;
  if (previous.stage !== next.stage || previous.status !== next.status) return true;
  if (next.status === "complete" || next.status === "failed") return true;

  const minIntervalMs = context.minIntervalMs ?? 1500;
  const minProgressDelta = context.minProgressDelta ?? 0.01;
  const elapsedSinceEmit = context.nowMs - context.lastEmittedAtMs;

  if (previous.progress !== null && previous.progress !== undefined && next.progress !== null && next.progress !== undefined) {
    if (Math.abs(next.progress - previous.progress) >= minProgressDelta) return true;
  }

  return elapsedSinceEmit >= minIntervalMs;
}

function baseProgress(
  context: ProgressParseContext,
  stage: PipelineProgressStage,
  status: PipelineProgress["status"],
  message: string,
  progress: number | null
): PipelineProgress {
  return {
    jobId: context.jobId,
    stage,
    status,
    progress,
    message,
    elapsedMs: Math.max(0, context.nowMs - context.startedAtMs),
    updatedAt: new Date(context.nowMs).toISOString()
  };
}

function parseByteSize(value: string, unit: string): number {
  const amount = Number(value);
  const normalized = unit.toLowerCase();
  const binary = normalized.includes("i");
  const base = binary ? 1024 : 1000;
  const power = normalized.startsWith("k") ? 1 : normalized.startsWith("m") ? 2 : normalized.startsWith("g") ? 3 : normalized.startsWith("t") ? 4 : 0;
  return Math.round(amount * base ** power);
}

function parseDurationToMs(value: string): number {
  const parts = value.split(":").map(Number);
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds * 1000;
}

function parseFfmpegOutTimeMs(fields: Map<string, string>): number {
  const microValue = fields.get("out_time_us") ?? fields.get("out_time_ms");
  if (microValue) return Math.max(0, Math.round(Number(microValue) / 1000));

  const clockValue = fields.get("out_time");
  if (!clockValue) return 0;
  const match = clockValue.match(/(\d+):(\d+):([\d.]+)/);
  if (!match) return 0;
  return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

function estimateEtaMs(totalDurationMs: number, outTimeMs: number, speedRealtime: number | null): number | null {
  if (!speedRealtime || speedRealtime <= 0) return null;
  return Math.round(Math.max(0, totalDurationMs - outTimeMs) / speedRealtime);
}

function parseSpeed(value: string | undefined): number | null {
  if (!value) return null;
  const speed = Number(value.replace(/x$/, ""));
  return Number.isFinite(speed) ? speed : null;
}

function messageForStage(stage: PipelineProgressStage): string {
  if (stage === "BUILD_PROXY") return "Building analysis proxy";
  if (stage === "EXTRACT_AUDIO") return "Extracting analysis audio";
  if (stage === "RENDER") return "Rendering clips";
  return stage;
}

function matchNumber(value: string, pattern: RegExp): number | null {
  const match = value.match(pattern);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundProgress(value: number): number {
  return Math.round(value * 1000) / 1000;
}
