#!/usr/bin/env node
import { createLocalVodMediaProvider } from "@auto-clipper/media";
import { flagValue, positionalArg, printToolResult, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const vodId = positionalArg(process.argv.slice(2), 0);
    if (!vodId) {
      throw new Error("ARG_REQUIRED: vod id");
    }

    const mediaRoot = flagValue(process.argv, "--media-root") ?? "fixtures/media";
    const media = await createLocalVodMediaProvider({ mediaRoot }).acquireAnalysisMedia(vodId);
    printToolResult({ status: "ok", output: media.uri, data: { media } });
  } catch (error) {
    printToolResult(toToolError(error, "MEDIA_ACQUIRE_FAILED"));
    process.exitCode = 1;
  }
}

await main();
