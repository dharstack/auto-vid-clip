import type { JobTelemetry, WorkerStatusSnapshot } from "@auto-clipper/contracts";

export interface ArtifactSnapshot {
  analysisSource: boolean;
  proxy: boolean;
  audio: boolean;
  events: "active" | "ready" | "pending";
  clips: number;
}

export interface MonitorSnapshot {
  api: "CONNECTED" | "DISCONNECTED";
  auth: "OK" | "FAILED" | "UNKNOWN";
  worker: WorkerStatusSnapshot;
  queue: number;
  job: JobTelemetry | null;
  artifacts: ArtifactSnapshot;
  latest: string | null;
  connectionMessage?: string;
}

export function formatWorkerMonitor(snapshot: MonitorSnapshot): string {
  const job = snapshot.job;
  const lines = [
    "AUTO CLIPPER LOCAL WORKER", "",
    `API        ${snapshot.api}${snapshot.connectionMessage ? ` (${snapshot.connectionMessage})` : ""}`,
    `AUTH       ${snapshot.auth}`,
    `WORKER     ${snapshot.worker.workerId ?? "unknown"}`,
    `STATUS     ${snapshot.worker.status ?? (snapshot.worker.online ? "IDLE" : "OFFLINE")}`, "",
    `QUEUE      ${snapshot.queue}`,
    `JOB        ${job?.jobId ?? "none"}`,
    `VOD        ${job?.vodId ?? "none"}`, "",
    `STAGE      ${job?.stage ?? "—"}`,
    `PROGRESS   ${job?.progress == null ? "—" : `${Math.round(job.progress * 100)}%`}`,
    job ? `${progressBar(job.progress)} ${job.progress == null ? "" : `${Math.round(job.progress * 100)}%`}` : "",
    `ELAPSED    ${formatDuration(job?.elapsedMs)}`,
    `ETA        ${job?.etaMs == null ? "—" : `~${formatDuration(job.etaMs)}`}`, "",
    "LATEST", snapshot.latest ?? "Waiting for activity", "",
    "LOCAL ARTIFACTS",
    `analysis source    ${mark(snapshot.artifacts.analysisSource)}`,
    `proxy              ${mark(snapshot.artifacts.proxy)}`,
    `audio              ${mark(snapshot.artifacts.audio)}`,
    `events             ${snapshot.artifacts.events}`,
    `clips              ${snapshot.artifacts.clips}`, "",
    "LOGS", job ? `work/${job.jobId}/logs/` : "work/<job-id>/logs/", "",
    "Ctrl+C = stop safely"
  ];
  return lines.filter((line, index) => !(line === "" && lines[index - 1] === "")).join("\n");
}

export function formatWorkerJson(snapshot: MonitorSnapshot): string {
  return JSON.stringify({
    type: "worker.status", api: snapshot.api, auth: snapshot.auth,
    workerId: snapshot.worker.workerId, online: snapshot.worker.online,
    status: snapshot.worker.status, jobId: snapshot.job?.jobId ?? null,
    stage: snapshot.job?.stage ?? null, progress: snapshot.job?.progress ?? null,
    queue: snapshot.queue, latest: snapshot.latest
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function mark(value: boolean): string { return value ? "✓" : "○"; }
function progressBar(progress: number | null): string {
  if (progress == null) return "                     ";
  const width = 21;
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}
