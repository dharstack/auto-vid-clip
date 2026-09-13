import assert from "node:assert/strict";
import test from "node:test";
import { flagValue, formatCliProgress, hasFlag, toToolError } from "../src/index.js";

test("reads flags from argv", () => {
  const argv = ["--input", "vod.mp4", "--json"];

  assert.equal(flagValue(argv, "--input"), "vod.mp4");
  assert.equal(hasFlag(argv, "--json"), true);
  assert.equal(flagValue(argv, "--missing"), undefined);
});

test("turns unknown errors into compact tool error", () => {
  assert.deepEqual(toToolError(new Error("boom"), "TOOL_FAILED"), {
    status: "error",
    code: "TOOL_FAILED",
    message: "boom"
  });
});

test("formats compact pipeline dashboard without fake unknown progress", () => {
  const output = formatCliProgress({ jobId: "job-1", stage: "BUILD_PROXY", status: "running", progress: null, message: "Building analysis proxy", elapsedMs: 120000, updatedAt: "2026-01-01T00:00:00Z" }, ["RESOLVE", "DOWNLOAD_ANALYSIS_MEDIA"]);
  assert.ok(output.includes("[x] Resolve VOD"));
  assert.ok(output.includes("[>] Build proxy"));
  assert.ok(output.includes("Elapsed: 02m 00s"));
  assert.ok(!output.includes("NaN%"));
});
