import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("default pipeline uses OpenCode selection before rendering", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-opencode-e2e-"));
  const workRoot = join(root, "work");
  const jobDirectory = join(workRoot, "opencode-fixture");
  try {
    await mkdir(jobDirectory, { recursive: true });
    await copyFile(resolve("fixtures/events/boss-close-call-e2e.json"), join(jobDirectory, "events.json"));
    const { stdout } = await execFileAsync(process.execPath, [
      resolve("tools/pipeline-run/dist/src/index.js"), resolve("fixtures/media/sample-6s.mp4"),
      "--work-root", workRoot, "--job-id", "opencode-fixture", "--json"
    ], { timeout: 120_000, env: { ...process.env, OPENCODE_PATH: resolve("packages/opencode-selection/test/fixtures/fake-opencode.mjs"), OPENCODE_MODEL: "opencode/mimo-v2.5-free" } });
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!) as { status: string; data: { clips: number; selectionMode: string; opencodeInvoked: boolean } };
    assert.equal(result.status, "ok");
    assert.equal(result.data.selectionMode, "opencode");
    assert.equal(result.data.opencodeInvoked, true);
    assert.equal(result.data.clips, 1);
    const selection = JSON.parse(await readFile(join(jobDirectory, "opencode-selection.json"), "utf8")) as { selected: unknown[] };
    assert.equal(selection.selected.length, 1);
    const config = JSON.parse(await readFile(join(jobDirectory, "opencode.json"), "utf8")) as { permissions: Array<{ effect: string }> };
    assert.equal(config.permissions[0].effect, "deny");
    await access(join(jobDirectory, "exports", "01-boss-close-call.mp4"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing free model fails before media acquisition and records progress", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-opencode-missing-"));
  const jobDirectory = join(root, "missing-model");
  try {
    await assert.rejects(execFileAsync(process.execPath, [
      resolve("tools/pipeline-run/dist/src/index.js"), resolve("fixtures/media/sample-6s.mp4"),
      "--work-root", root, "--job-id", "missing-model", "--json"
    ], { env: { ...process.env, OPENCODE_PATH: resolve("packages/opencode-selection/test/fixtures/fake-opencode.mjs"), FAKE_OPENCODE_NO_MODELS: "1" } }));
    const progress = JSON.parse(await readFile(join(jobDirectory, "progress.json"), "utf8")) as { stage: string; message: string };
    assert.equal(progress.stage, "FAILED");
    assert.match(progress.message, /OPENCODE_FREE_MODEL_UNAVAILABLE/);
    await assert.rejects(access(join(jobDirectory, "analysis-source.mp4")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
