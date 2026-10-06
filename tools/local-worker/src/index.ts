#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import type { JobTelemetry, WorkerStatusSnapshot } from "@auto-clipper/contracts";
import { formatWorkerJson, formatWorkerMonitor, type ArtifactSnapshot, type MonitorSnapshot } from "@auto-clipper/tooling";

const argv = process.argv.slice(2);
const apiBaseUrl = process.env.AUTO_CLIPPER_API_BASE_URL ?? "http://localhost:8787";
const workerToken = process.env.AUTO_CLIPPER_WORKER_TOKEN;
const workerId = process.env.AUTO_CLIPPER_WORKER_ID ?? `${hostname()}-worker`;
const version = process.env.AUTO_CLIPPER_WORKER_VERSION ?? "0.1.0";
const pollMs = Number(process.env.AUTO_CLIPPER_WORKER_POLL_MS ?? 5000);
const jsonMode = argv.includes("--json");
const monitorOnly = argv.includes("--monitor");
const oneShot = argv.includes("--once");
const workRoot = process.env.AUTO_CLIPPER_WORK_ROOT ?? "work";
const pipelinePath = join(process.cwd(), "tools", "pipeline-run", "dist", "src", "index.js");

if (!monitorOnly && !workerToken) fail("AUTH FAILED: set AUTO_CLIPPER_WORKER_TOKEN");
if (!monitorOnly && !existsSync(pipelinePath)) fail("PIPELINE BUILD REQUIRED: run npm run build");

let lastOutput = "";
let stopped = false;
let lastIdleHeartbeat = 0;

async function main(): Promise<void> {
  if (monitorOnly) {
    await monitorLoop();
    return;
  }
  try { await heartbeat("IDLE", null); } catch (error) { fail(formatConnectionError(error)); }
  process.once("SIGINT", () => { stopped = true; });
  try {
    while (!stopped) {
      try {
        const claim = await request<{ data?: { job_id: string; input?: string } | null }>("/api/jobs/claim", { method: "POST", auth: true, body: { workerId } });
        if (claim.data?.input) {
          await heartbeat("RUNNING", claim.data.job_id);
          const code = await runPipeline(claim.data.job_id, claim.data.input);
          if (code !== 0) await updateJob(claim.data.job_id, { stage: "RENDER", status: "FAILED", progress: null, message: "Local pipeline failed", error: "PIPELINE_FAILED" });
          await heartbeat("IDLE", null);
          lastIdleHeartbeat = Date.now();
        } else {
          await render(await snapshot());
          if (Date.now() - lastIdleHeartbeat >= 45_000) { await heartbeat("IDLE", null); lastIdleHeartbeat = Date.now(); }
        }
      } catch (error) {
        const message = formatConnectionError(error);
        await render(await snapshot(message, message.includes("401") || message.includes("403") ? "FAILED" : undefined)).catch(() => undefined);
        await sleep(Math.max(pollMs, 10_000));
      }
      await sleep(pollMs);
    }
  } finally {
    await heartbeat("IDLE", null).catch(() => undefined);
  }
}

async function monitorLoop(): Promise<void> {
  process.once("SIGINT", () => { stopped = true; });
  do {
    await render(await snapshot());
    if (oneShot) return;
    await sleep(3000);
  } while (!stopped);
}

async function runPipeline(jobId: string, input: string): Promise<number> {
  return new Promise((resolve) => {
    const monitorTimer = setInterval(() => { void snapshot().then(render).catch(() => undefined); }, 3000);
    const heartbeatTimer = setInterval(() => { void heartbeat("RUNNING", jobId).catch(() => undefined); }, 45_000);
    const child = spawn(process.execPath, [pipelinePath, input, "--api-base-url", apiBaseUrl, "--job-id", jobId], { stdio: jsonMode ? "ignore" : "inherit", env: { ...process.env, AUTO_CLIPPER_WORKER_ID: workerId, AUTO_CLIPPER_WORKER_TOKEN: workerToken } });
    child.on("error", () => resolve(1));
    child.on("close", (code) => { clearInterval(monitorTimer); clearInterval(heartbeatTimer); void snapshot().then(render).catch(() => undefined); resolve(code ?? 1); });
  });
}

async function heartbeat(status: "IDLE" | "RUNNING", currentJobId: string | null): Promise<void> {
  await request("/api/worker/heartbeat", { method: "POST", auth: true, body: { workerId, status, currentJobId, version } });
}

async function updateJob(jobId: string, body: Record<string, unknown>): Promise<void> {
  await request(`/api/jobs/${jobId}`, { method: "PATCH", auth: true, body: { workerId, ...body } });
}

async function snapshot(connectionMessage?: string, authOverride?: "FAILED" | "UNKNOWN"): Promise<MonitorSnapshot> {
  try {
    const [worker, jobs] = await Promise.all([
      request<{ data: WorkerStatusSnapshot }>("/api/worker/status", { auth: true }),
      request<{ data: JobTelemetry[] }>("/api/jobs?limit=100", { auth: true })
    ]);
    const workerState = worker.data;
    const jobsList = jobs.data ?? [];
    const job = jobsList.find((item) => item.jobId === workerState.currentJobId || item.worker === workerId) ?? null;
    const queue = jobsList.filter((item) => ["QUEUED", "CLAIMED"].includes(item.status.toUpperCase())).length;
    return { api: "CONNECTED", auth: authOverride ?? (workerToken ? "OK" : "UNKNOWN"), worker: workerState, queue, job, artifacts: artifacts(job), latest: job?.message ?? null, connectionMessage };
  } catch (error) {
    const message = formatConnectionError(error);
    return { api: "DISCONNECTED", auth: message.includes("401") || message.includes("403") ? "FAILED" : "UNKNOWN", worker: emptyWorker(), queue: 0, job: null, artifacts: artifacts(null), latest: message, connectionMessage: message };
  }
}

async function request<T = unknown>(path: string, options: { method?: string; auth?: boolean; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, { method: options.method ?? "GET", headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.auth ? { Authorization: `Bearer ${workerToken}` } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  } catch (error) { throw new Error(`CONNECTION_FAILED: ${error instanceof Error ? error.message : String(error)}`); }
  const body = await response.json().catch(() => ({})) as { message?: string } & T;
  if (!response.ok) throw new Error(`WORKER_API_${response.status}: ${body.message ?? response.statusText}`);
  return body;
}

function artifacts(job: JobTelemetry | null): ArtifactSnapshot {
  if (!job) return { analysisSource: false, proxy: false, audio: false, events: "pending", clips: 0 };
  const dir = join(workRoot, job.jobId);
  const exportsDir = join(dir, "exports");
  return { analysisSource: existsSync(join(dir, "analysis-source.mp4")), proxy: existsSync(join(dir, "proxy.mp4")), audio: existsSync(join(dir, "audio.wav")), events: existsSync(join(dir, "events.json")) ? "ready" : "active", clips: existsSync(exportsDir) ? readdirSync(exportsDir).length : 0 };
}

async function render(snapshotValue: MonitorSnapshot): Promise<void> {
  const output = jsonMode ? formatWorkerJson(snapshotValue) : formatWorkerMonitor(snapshotValue);
  if (output === lastOutput) return;
  lastOutput = output;
  process.stdout.write(jsonMode ? `${output}\n` : process.stdout.isTTY ? `\x1b[H\x1b[0J${output}` : `${output}\n\n`);
}

function emptyWorker(): WorkerStatusSnapshot { return { workerId, online: false, status: null, currentJobId: null, lastSeenAt: null, startedAt: null, version }; }
function formatConnectionError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function fail(message: string): never { console.error(message); process.exit(1); }

await main();
