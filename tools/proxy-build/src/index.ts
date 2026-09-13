#!/usr/bin/env node
import { buildProxyBuildArgs, runFfmpeg } from "@auto-clipper/media-tools";
import { flagValue, hasFlag, printToolResult, requireFlagValue, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const input = requireFlagValue(argv, "--input");
    const output = requireFlagValue(argv, "--output");
    const height = Number(flagValue(argv, "--height") ?? 480);
    const fps = Number(flagValue(argv, "--fps") ?? 15);
    const args = buildProxyBuildArgs({ input, output, height, fps });

    if (!hasFlag(argv, "--dry-run")) {
      await runFfmpeg(args);
    }

    printToolResult({ status: "ok", output, data: { args } });
  } catch (error) {
    printToolResult(toToolError(error, "FFMPEG_PROXY_FAILED"));
    process.exitCode = 1;
  }
}

await main();
