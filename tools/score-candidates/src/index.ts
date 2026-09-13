#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { scoreCandidates } from "@auto-clipper/scoring";
import { flagValue, positionalArg, printToolResult, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const input = positionalArg(process.argv.slice(2), 0) ?? "candidates.json";
    const output = flagValue(process.argv, "--output") ?? "scores.json";
    const scores = scoreCandidates(JSON.parse(await readFile(input, "utf8")));
    await writeFile(output, JSON.stringify(scores, null, 2));
    printToolResult({ status: "ok", output, data: { renderable: scores.filter((s) => s.decision === "AUTO_RENDER").length, review: scores.filter((s) => s.decision === "REVIEW").length, ignored: scores.filter((s) => s.decision === "IGNORE").length } });
  } catch (error) {
    printToolResult(toToolError(error, "SCORE_CANDIDATES_FAILED"));
    process.exitCode = 1;
  }
}

await main();
