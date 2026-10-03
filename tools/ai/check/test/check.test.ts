import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFailure } from "../src/index.js";

test("summarizes TypeScript failure without returning full logs", () => {
  const summary = summarizeFailure("tools/pipeline-run/src/index.ts(2,3): error TS2307: Cannot find module '@x'.\n" + "x".repeat(5000));
  assert.deepEqual(summary, { errorCode: "TS2307", file: "tools/pipeline-run/src/index.ts", message: "Cannot find module '@x'." });
});
