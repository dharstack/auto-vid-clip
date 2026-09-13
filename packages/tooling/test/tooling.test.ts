import assert from "node:assert/strict";
import test from "node:test";
import { flagValue, hasFlag, toToolError } from "../src/index.js";

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
