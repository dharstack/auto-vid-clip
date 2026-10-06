import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("given the six second fixture, when the real pipeline runs, then artifacts and COMPLETE progress exist", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "auto-clipper-e2e-"));
  const workRoot = join(temporaryRoot, "work");
  const jobId = `fixture-${process.pid}-${Date.now()}`;
  const jobDirectory = join(workRoot, jobId);
  const fixture = resolve("fixtures/media/sample-6s.mp4");
  const eventFixture = resolve("fixtures/events/boss-close-call-e2e.json");
  const cli = resolve("tools/pipeline-run/dist/src/index.js");
  try {
    await mkdir(jobDirectory, { recursive: true });
    await copyFile(eventFixture, join(jobDirectory, "events.json"));
    const result = await execFileAsync(process.execPath, [cli, fixture, "--work-root", workRoot, "--job-id", jobId, "--no-opencode", "--json"], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    const messages = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as { status?: string; stage?: string; type?: string; data?: { clips?: number } });
    assert.ok(messages.some((message) => message.type === "pipeline.progress" && message.stage === "COMPLETE" && message.status === "complete"));
    assert.equal(messages.at(-1)?.status, "ok");

    const lines = (await readFile(join(jobDirectory, "progress.json"), "utf8")).trim();
    const progress = JSON.parse(lines) as { stage: string; status: string };
    assert.equal(progress.stage, "COMPLETE");
    assert.equal(progress.status, "complete");
    const artifacts: Record<string, unknown> = {};
    for (const artifact of ["manifest.json", "events.json", "candidates.json", "scores.json", "render-plan.json"]) {
      await access(join(jobDirectory, artifact));
      const content = await readFile(join(jobDirectory, artifact), "utf8");
      assert.doesNotThrow(() => JSON.parse(content), `${artifact} must contain valid JSON`);
      artifacts[artifact] = JSON.parse(content);
    }

    const events = artifacts["events.json"] as unknown[];
    const candidates = artifacts["candidates.json"] as unknown[];
    assert.ok(events.length > 0, "fixture must produce events");
    assert.ok(candidates.length > 0, "fixture must produce candidates");
    const plan = JSON.parse(await readFile(join(jobDirectory, "render-plan.json"), "utf8")) as { clips: Array<{ output: string; startMs: number; endMs: number }> };
    assert.ok(plan.clips.length > 0, "fixture must produce render-plan clips");
    assert.equal(messages.at(-1)?.data?.clips, plan.clips.length);
    const exportsDirectory = join(jobDirectory, "exports");
    let exportCount = 0;
    for (const clip of plan.clips) {
      const exportPath = join(exportsDirectory, clip.output);
      await access(exportPath);
      assert.ok((await stat(exportPath)).size > 0, `${clip.output} must be non-empty`);
      const probe = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", exportPath]);
      const media = JSON.parse(probe.stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
      const streamTypes = new Set(media.streams?.map((stream) => stream.codec_type));
      assert.ok(streamTypes.has("video"), `${clip.output} must contain video`);
      assert.ok(streamTypes.has("audio"), `${clip.output} must contain audio`);
      const durationMs = Number(media.format?.duration) * 1000;
      assert.ok(Number.isFinite(durationMs) && durationMs > 0, `${clip.output} must have a positive duration`);
      assert.ok(Math.abs(durationMs - (clip.endMs - clip.startMs)) < 500, `${clip.output} duration must match its render plan`);
      exportCount += 1;
    }
    assert.ok(exportCount > 0, "pipeline must export at least one clip");
    process.stdout.write(`${JSON.stringify({ type: "pipeline.e2e.summary", events: events.length, candidates: candidates.length, renderPlanClips: plan.clips.length, exports: exportCount, ffprobe: "passed" })}\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
