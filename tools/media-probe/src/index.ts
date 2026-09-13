#!/usr/bin/env node
import { probeMedia } from "@auto-clipper/media-tools";
import { positionalArg, printToolResult, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const input = positionalArg(process.argv.slice(2), 0);
    if (!input) {
      throw new Error("ARG_REQUIRED: input media");
    }

    const data = await probeMedia(input);
    printToolResult({ status: "ok", data });
  } catch (error) {
    printToolResult(toToolError(error, "MEDIA_PROBE_FAILED"));
    process.exitCode = 1;
  }
}

await main();
