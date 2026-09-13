#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { buildCandidates } from "@auto-clipper/candidates";
import { flagValue, positionalArg, printToolResult, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const input = positionalArg(process.argv.slice(2), 0) ?? "events.json";
    const output = flagValue(process.argv, "--output") ?? "candidates.json";
    const candidates = buildCandidates(JSON.parse(await readFile(input, "utf8")));
    await writeFile(output, JSON.stringify(candidates, null, 2));
    printToolResult({ status: "ok", output, data: { candidateCount: candidates.length } });
  } catch (error) {
    printToolResult(toToolError(error, "BUILD_CANDIDATES_FAILED"));
    process.exitCode = 1;
  }
}

await main();
