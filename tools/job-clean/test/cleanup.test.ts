import { mkdtemp, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildCleanupPlan, executeCleanupPlan } from "../src/index.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "auto-clip-clean-"));
  await writeFile(join(root, ".auto-clipper-root"), "auto-clipper\n");
  const job = join(root, "job-123");
  await mkdir(join(job, "exports"), { recursive: true });
  await mkdir(join(job, "ranges"));
  await writeFile(join(job, "manifest.json"), JSON.stringify({ jobId: "job-123", stages: { render: "complete" } }));
  await writeFile(join(job, "progress.json"), JSON.stringify({ status: "complete" }));
  await writeFile(join(job, "source.mp4"), "source");
  await writeFile(join(job, "analysis-source.mp4"), "analysis");
  await writeFile(join(job, "proxy.mp4"), "proxy");
  await writeFile(join(job, "audio.wav"), "audio");
  await writeFile(join(job, "ranges", "range.mp4"), "range");
  await writeFile(join(job, "exports", "clip.mp4"), "clip");
  return { root, job };
}

describe("cleanup planner", () => {
  test("plans and executes only intermediates for a completed job", async () => {
    const { root, job } = await fixture();
    const plan = await buildCleanupPlan({ workRoot: root, jobId: "job-123" });
    assert.ok(plan.jobs[0].bytesRecoverable > 0);
    assert.ok(plan.jobs[0].delete.some((item) => item.path === join(job, "source.mp4")));
    await executeCleanupPlan(plan);
    await access(join(job, "exports", "clip.mp4"));
    await assert.rejects(readFile(join(job, "source.mp4")));
  });

  test("dry-run produces a plan without deleting", async () => {
    const { root, job } = await fixture();
    const plan = await buildCleanupPlan({ workRoot: root, jobId: "job-123", dryRun: true });
    assert.ok(plan.jobs[0].bytesRecoverable > 0);
    await access(join(job, "source.mp4"));
  });

  test("rejects an unrecognized job directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "auto-clip-clean-"));
    await writeFile(join(root, ".auto-clipper-root"), "auto-clipper\n");
    await mkdir(join(root, "random-folder"));
    await assert.rejects(buildCleanupPlan({ workRoot: root, jobId: "random-folder" }), /CLEAN_JOB_NOT_FOUND/);
  });

  test("does not treat an intermediate complete stage as whole-job complete", async () => {
    const root = await mkdtemp(join(tmpdir(), "auto-clip-clean-"));
    await writeFile(join(root, ".auto-clipper-root"), "auto-clipper\n");
    const job = join(root, "job-456");
    await mkdir(job);
    await writeFile(join(job, "manifest.json"), JSON.stringify({ jobId: "job-456", stages: { DETECT: "complete", RENDER: "pending" } }));
    await writeFile(join(job, "progress.json"), JSON.stringify({ stage: "DETECT", status: "complete" }));
    const plan = await buildCleanupPlan({ workRoot: root, jobId: "job-456" });
    assert.equal(plan.jobs[0].status, "skipped");
  });

  test("rejects missing work-root sentinel", async () => {
    const root = await mkdtemp(join(tmpdir(), "auto-clip-clean-"));
    await assert.rejects(buildCleanupPlan({ workRoot: root, all: true }), /CLEAN_WORK_ROOT_UNRECOGNIZED/);
  });
});
