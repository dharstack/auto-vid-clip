import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverFiles } from "../src/index.js";

test("given generated media under work, when scanning, then only known code roots are traversed", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-scan-"));
  try {
    await mkdir(join(root, "packages/foo/src"), { recursive: true });
    await mkdir(join(root, "packages/foo/test"), { recursive: true });
    await mkdir(join(root, "packages/media/src"), { recursive: true });
    await mkdir(join(root, "packages/foo/exports"), { recursive: true });
    await mkdir(join(root, "packages/foo/ranges"), { recursive: true });
    await mkdir(join(root, "local/media"), { recursive: true });
    await mkdir(join(root, "work"), { recursive: true });
    await mkdir(join(root, ".local"), { recursive: true });
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(root, "packages/foo/src/index.ts"), "export {};");
    await writeFile(join(root, "packages/foo/test/foo.test.ts"), "test");
    await writeFile(join(root, "packages/media/src/index.ts"), "export {}; ");
    await writeFile(join(root, "packages/foo/exports/clip.mp4"), "generated");
    await writeFile(join(root, "packages/foo/ranges/range.mp4"), "generated");
    await writeFile(join(root, "local/media/audio.wav"), "generated");
    await writeFile(join(root, "packages/foo/generated.mp4"), "generated");
    await writeFile(join(root, "work/big-video.mp4"), "generated");
    await writeFile(join(root, ".local/private.json"), "{}");

    assert.deepEqual(await discoverFiles(root), [
      "package.json",
      "packages/foo/src/index.ts",
      "packages/foo/test/foo.test.ts",
      "packages/media/src/index.ts"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
