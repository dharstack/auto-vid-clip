#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { buildRenderPlan } from "@auto-clipper/render-plan";
import { flagValue, printToolResult, requireFlagValue, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const candidates = JSON.parse(await readFile(requireFlagValue(argv, "--candidates"), "utf8"));
    const scores = JSON.parse(await readFile(requireFlagValue(argv, "--scores"), "utf8"));
    const output = flagValue(argv, "--output") ?? "render-plan.json";
    const sourceDurationMs = Number(flagValue(argv, "--duration-ms") ?? Number.MAX_SAFE_INTEGER);
    const plan = buildRenderPlan(candidates, scores, { sourceDurationMs });
    await writeFile(output, JSON.stringify(plan, null, 2));
    printToolResult({ status: "ok", output, data: { clipCount: plan.clips.length } });
  } catch (error) {
    printToolResult(toToolError(error, "BUILD_RENDER_PLAN_FAILED"));
    process.exitCode = 1;
  }
}

await main();
