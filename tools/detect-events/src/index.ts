#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { detectEventsFromMedia } from "@auto-clipper/detectors";
import { flagValue, printToolResult, requireFlagValue, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const input = requireFlagValue(argv, "--input");
    const output = flagValue(argv, "--output") ?? "events.json";
    const audio = flagValue(argv, "--audio");
    const events = await detectEventsFromMedia({ videoPath: input, audioPath: audio });
    await writeFile(output, JSON.stringify(events, null, 2));
    printToolResult({ status: "ok", output, data: { eventCount: events.length } });
  } catch (error) {
    printToolResult(toToolError(error, "DETECT_EVENTS_FAILED"));
    process.exitCode = 1;
  }
}

await main();
