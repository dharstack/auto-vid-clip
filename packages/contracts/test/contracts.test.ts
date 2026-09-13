import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_CATEGORIES,
  EVENT_TYPES,
  JOB_STATES,
  type ToolResult
} from "../src/index.js";

test("exports V1 event, candidate, and job contracts", () => {
  assert.ok(EVENT_TYPES.includes("BOSS_DEFEATED"));
  assert.ok(CANDIDATE_CATEGORIES.includes("BOSS_CLOSE_CALL"));
  assert.ok(JOB_STATES.includes("ANALYZING"));
});

test("tool result supports compact ok and error schemas", () => {
  const ok: ToolResult<{ eventCount: number }> = {
    status: "ok",
    output: "events.json",
    data: { eventCount: 42 }
  };
  const error: ToolResult = {
    status: "error",
    code: "FFMPEG_PROXY_FAILED",
    message: "Proxy generation failed",
    log: "logs/proxy-build.log"
  };

  assert.equal(ok.status, "ok");
  assert.equal(ok.data?.eventCount, 42);
  assert.equal(error.status, "error");
  assert.equal(error.log, "logs/proxy-build.log");
});
