#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { nextStage, PIPELINE_STAGES, type JobManifest } from "@auto-clipper/jobs";
import { flagValue, positionalArg, printToolResult, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const jobId = positionalArg(process.argv.slice(2), 0);
    if (!jobId) throw new Error("ARG_REQUIRED: job id");
    const workRoot = flagValue(process.argv, "--work-root") ?? "work";
    const manifest = JSON.parse(await readFile(join(workRoot, jobId, "manifest.json"), "utf8")) as JobManifest;
    const completed = PIPELINE_STAGES.filter((stage) => manifest.stages[stage] === "complete").length;
    printToolResult({ status: "ok", data: { jobId, stage: nextStage(manifest) ?? "COMPLETE", progress: completed / PIPELINE_STAGES.length, error: manifest.error } });
  } catch (error) {
    printToolResult(toToolError(error, "JOB_STATUS_FAILED"));
    process.exitCode = 1;
  }
}

await main();
