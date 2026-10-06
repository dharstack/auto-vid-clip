import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("local selection defaults to OpenCode and accepts deterministic opt out", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-local-select-"));
  const jobDirectory = join(root, "fixture");
  const cli = resolve("tools/local-select/dist/src/index.js");
  try {
    await mkdir(jobDirectory, { recursive: true });
    await copyFile(resolve("fixtures/events/boss-close-call-e2e.json"), join(jobDirectory, "events.json"));
    await writeFile(join(jobDirectory, "media.json"), JSON.stringify({ durationMs: 6000 }));
    const { stdout } = await execFileAsync(process.execPath, [cli, "--job", "fixture", "--work-root", root], {
      env: { ...process.env, OPENCODE_PATH: resolve("packages/opencode-selection/test/fixtures/fake-opencode.mjs"), OPENCODE_MODEL: "opencode/mimo-v2.6-flash-free" }
    });
    const result = JSON.parse(stdout) as { selectionMode: string; opencodeInvoked: boolean; clips: number };
    assert.equal(result.selectionMode, "opencode");
    assert.equal(result.opencodeInvoked, true);
    assert.equal(result.clips, 1);
    const selection = JSON.parse(await readFile(join(jobDirectory, "opencode-selection.json"), "utf8")) as { selected: unknown[] };
    assert.equal(selection.selected.length, 1);

    const deterministic = await execFileAsync(process.execPath, [cli, "--job", "fixture", "--work-root", root, "--no-opencode"]);
    const optOut = JSON.parse(deterministic.stdout) as { selectionMode: string; opencodeInvoked: boolean };
    assert.equal(optOut.selectionMode, "deterministic");
    assert.equal(optOut.opencodeInvoked, false);
    await assert.rejects(access(join(jobDirectory, "opencode-selection.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
