import assert from "node:assert/strict";
import test from "node:test";
import { flagValue, formatCliProgress, formatWorkerJson, formatWorkerMonitor, hasFlag, PipelineProgressRenderer, toToolError } from "../src/index.js";

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

test("renders a stable progress bar with trustworthy metrics", () => {
  const output = formatCliProgress({ jobId: "job-1", stage: "RENDER", status: "running", progress: 0.42, etaMs: 58000, speedRealtime: 1.5, elapsedMs: 120000, message: "Rendering clips", updatedAt: "2026-01-01T00:00:00Z" }, ["RESOLVE"], { vod: "The VOD", durationMs: 600000 });
  assert.match(output, /VOD: The VOD/);
  assert.match(output, /\[████░░░░░░\] 42%/);
  assert.match(output, /ETA 00m 58s/);
  assert.match(output, /1\.5x/);
});

test("renderer redraws in place and freezes failures with resume details", () => {
  const writes: string[] = [];
  const renderer = new PipelineProgressRenderer({ isTTY: true, write: (value) => writes.push(value) });
  renderer.update({ jobId: "job-1", stage: "BUILD_PROXY", status: "running", progress: null, elapsedMs: 1000, message: "Building", updatedAt: "2026-01-01T00:00:00Z" }, []);
  renderer.failure("BUILD_PROXY_FAILED: ffmpeg exited", "work/job-1/logs/ffmpeg-proxy.log", "node tools/pipeline-run/dist/src/index.js input --job-id job-1");
  assert.ok(writes[0].includes("\x1b[H"));
  assert.ok(writes[0].includes("\x1b[0J"));
  assert.match(writes.at(-1) ?? "", /Resume: node tools\/pipeline-run/);
  assert.match(writes.at(-1) ?? "", /Log: work\/job-1\/logs\/ffmpeg-proxy\.log/);
});

test("worker monitor renders idle state without repeated no-job log text", () => {
  const output = formatWorkerMonitor({ api: "CONNECTED", auth: "OK", worker: { workerId: "desktop-main", online: true, status: "IDLE", currentJobId: null, lastSeenAt: "2026-01-01T00:00:00Z", startedAt: "2026-01-01T00:00:00Z", version: "1.0.0" }, queue: 0, job: null, artifacts: { analysisSource: false, proxy: false, audio: false, events: "pending", clips: 0 }, latest: null });
  assert.match(output, /STATUS     IDLE/);
  assert.match(output, /Waiting for activity/);
  assert.doesNotMatch(output, /no job/i);
});

test("worker JSON output is compact and contains no ANSI", () => {
  const output = formatWorkerJson({ api: "CONNECTED", auth: "OK", worker: { workerId: "desktop-main", online: true, status: "RUNNING", currentJobId: "job-1", lastSeenAt: null, startedAt: null, version: "1.0.0" }, queue: 2, job: { jobId: "job-1", vodId: "123", status: "RUNNING", stage: "DETECT", progress: 0.63, message: "Detecting", elapsedMs: 1200, etaMs: null, error: null, worker: "desktop-main", updatedAt: null }, artifacts: { analysisSource: true, proxy: true, audio: true, events: "active", clips: 0 }, latest: "Detecting" });
  assert.match(output, /"stage":"DETECT"/);
  assert.doesNotMatch(output, /\x1b/);
});
