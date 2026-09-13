#!/usr/bin/env node
import { buildAudioExtractArgs, runFfmpeg } from "@auto-clipper/media-tools";
import { hasFlag, printToolResult, requireFlagValue, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const input = requireFlagValue(argv, "--input");
    const output = requireFlagValue(argv, "--output");
    const args = buildAudioExtractArgs({ input, output });

    if (!hasFlag(argv, "--dry-run")) {
      await runFfmpeg(args);
    }

    printToolResult({ status: "ok", output, data: { args } });
  } catch (error) {
    printToolResult(toToolError(error, "FFMPEG_AUDIO_FAILED"));
    process.exitCode = 1;
  }
}

await main();
