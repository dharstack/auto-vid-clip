import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArchitectureIndex, collectTables } from "../src/index.js";

test("extracts D1 table names deterministically", () => {
  assert.deepEqual(collectTables("CREATE TABLE IF NOT EXISTS vods (id TEXT);\nCREATE TABLE jobs (id TEXT);"), ["jobs", "vods"]);
});

test("given a minimal repo, when architecture index is built, then version and contract stages are recorded", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-architecture-"));
  try {
    await mkdir(join(root, "apps/api/src"), { recursive: true });
    await mkdir(join(root, "packages/demo/test"), { recursive: true });
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(root, "apps/api/schema.sql"), "CREATE TABLE jobs (id TEXT);");
    await writeFile(join(root, "apps/api/src/index.ts"), "const route = url.pathname === '/api/jobs';");
    await writeFile(join(root, "packages/demo/package.json"), JSON.stringify({ name: "@auto-clipper/demo", dependencies: {} }));
    await writeFile(join(root, "packages/demo/test/demo.test.ts"), "test");

    const index = await buildArchitectureIndex(root);
    assert.deepEqual(await buildArchitectureIndex(root), index);
    assert.equal(index.schemaVersion, 1);
    assert.deepEqual(index.pipelineStages, ["RESOLVE", "DOWNLOAD_ANALYSIS_MEDIA", "FINALIZE_MEDIA", "PROBE", "BUILD_PROXY", "EXTRACT_AUDIO", "DETECT_VIDEO", "DETECT_AUDIO", "BUILD_CANDIDATES", "SCORE", "BUILD_RENDER_PLAN", "ACQUIRE_RENDER_RANGE", "RENDER", "COMPLETE", "FAILED"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
