import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { rankFiles } from "../src/index.js";

const execFileAsync = promisify(execFile);

test("ranks Youtube upload workspace files for upload task", () => {
  const files = [
    "tools/youtube-upload/src/index.ts",
    "tools/pipeline-run/src/index.ts",
    "packages/scoring/src/index.ts"
  ];
  const ranked = rankFiles("fix youtube upload", files, { "tools/pipeline-run/src/index.ts": 'import { uploadYoutubeVideo } from "@auto-clipper/tool-youtube-upload";' });
  assert.deepEqual(ranked.slice(0, 2), ["tools/youtube-upload/src/index.ts", "tools/pipeline-run/src/index.ts"]);
});

test("given work contains generated media, when context CLI scans, then code is found and output stays compact", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-context-"));
  try {
    await mkdir(join(root, "packages/foo/src"), { recursive: true });
    await mkdir(join(root, "packages/foo/test"), { recursive: true });
    await mkdir(join(root, "work"), { recursive: true });
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(root, "packages/foo/src/index.ts"), "export const foo = true;");
    await writeFile(join(root, "packages/foo/test/foo.test.ts"), "test");
    await writeFile(join(root, "work/video.mp4"), "generated media");

    const cli = fileURLToPath(new URL("../src/index.js", import.meta.url));
    const result = await execFileAsync(process.execPath, [cli, "foo"], { cwd: root });
    const output = JSON.parse(result.stdout) as { files: string[] };
    assert.deepEqual(output.files, ["packages/foo/src/index.ts", "packages/foo/test/foo.test.ts"]);
    assert.equal(result.stdout.trim().split("\n").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
