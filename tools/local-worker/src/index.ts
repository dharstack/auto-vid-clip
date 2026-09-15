#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const apiBaseUrl = process.env.AUTO_CLIPPER_API_BASE_URL ?? "http://localhost:8787";
const workerToken = process.env.AUTO_CLIPPER_WORKER_TOKEN;
const pollMs = Number(process.env.AUTO_CLIPPER_WORKER_POLL_MS ?? 5000);
const pipelinePath = join(process.cwd(), "tools", "pipeline-run", "dist", "src", "index.js");

if (!existsSync(pipelinePath)) {
  console.error("LOCAL_WORKER_PIPELINE_BUILD_REQUIRED");
  process.exit(1);
}

while (true) {
  const response = await fetch(`${apiBaseUrl}/api/jobs/next`, { headers: workerToken ? { Authorization: `Bearer ${workerToken}` } : {} });
  const body = await response.json() as { data?: { job_id: string; input?: string; vod_id: string } | null };
  const job = body.data;
  if (job?.input) {
    const code = await runPipeline(job.job_id, job.input);
    if (code !== 0) await updateJob(job.job_id, { stage: "FAILED", status: "failed", progress: null, message: "Local pipeline failed", elapsedMs: 0, error: "PIPELINE_FAILED" });
  } else {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

function runPipeline(jobId: string, input: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [pipelinePath, input, "--api-base-url", apiBaseUrl, "--job-id", jobId], { stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function updateJob(jobId: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`${apiBaseUrl}/api/jobs/${jobId}`, { method: "PATCH", headers: { "content-type": "application/json", ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}) }, body: JSON.stringify(body) });
}
