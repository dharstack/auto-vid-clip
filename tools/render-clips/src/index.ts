#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RenderPlan } from "@auto-clipper/contracts";
import { buildRenderClipArgs, runFfmpeg } from "@auto-clipper/media-tools";
import { hasFlag, printToolResult, requireFlagValue, toToolError } from "@auto-clipper/tooling";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const input = requireFlagValue(argv, "--input");
    const planPath = requireFlagValue(argv, "--plan");
    const outputDirectory = requireFlagValue(argv, "--output-dir");
    const dryRun = hasFlag(argv, "--dry-run");
    const plan = JSON.parse(await readFile(planPath, "utf8")) as RenderPlan;
    await mkdir(outputDirectory, { recursive: true });

    for (const clip of plan.clips) {
      const output = join(outputDirectory, clip.output);
      const args = buildRenderClipArgs({ input, output, startMs: clip.startMs, endMs: clip.endMs });
      if (!dryRun) {
        await runFfmpeg(args);
      }
    }

    printToolResult({ status: "ok", output: outputDirectory, data: { rendered: plan.clips.length, failed: 0 } });
  } catch (error) {
    printToolResult(toToolError(error, "RENDER_CLIPS_FAILED"));
    process.exitCode = 1;
  }
}

await main();
