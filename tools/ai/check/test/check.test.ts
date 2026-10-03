import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPrerequisites, planChecks, summarizeFailure, writeFailureLog } from "../src/index.js";

test("summarizes TypeScript failure without returning full logs", () => {
  const summary = summarizeFailure("tools/pipeline-run/src/index.ts(2,3): error TS2307: Cannot find module '@x'.\n" + "x".repeat(5000));
  assert.deepEqual(summary, { errorCode: "TS2307", file: "tools/pipeline-run/src/index.ts", message: "Cannot find module '@x'." });
});

test("given scoring changed, when targeted checks are planned, then unrelated workspaces are skipped", () => {
  const checks = planChecks(["packages/scoring/src/index.ts"], [
    { name: "@auto-clipper/scoring", path: "packages/scoring", scripts: { build: "tsc", typecheck: "tsc", test: "node --test" } },
    { name: "@auto-clipper/render-plan", path: "packages/render-plan", scripts: { build: "tsc", typecheck: "tsc", test: "node --test" } }
  ]);
  assert.deepEqual(checks, [
    { step: "build", workspace: "@auto-clipper/scoring" },
    { step: "typecheck", workspace: "@auto-clipper/scoring" },
    { step: "test", workspace: "@auto-clipper/scoring" }
  ]);
});

test("given full mode, when checks are planned, then repository checks run", () => {
  assert.deepEqual(planChecks([], [], true), [
    { step: "build" },
    { step: "typecheck" },
    { step: "test" }
  ]);
});

test("given scoring depends on contracts, when targeted checks are planned, then dependency build runs first", () => {
  const workspaces: Parameters<typeof buildPrerequisites>[1] = [
    { name: "@auto-clipper/contracts", path: "packages/contracts", scripts: { build: "tsc" } },
    { name: "@auto-clipper/scoring", path: "packages/scoring", dependencies: { "@auto-clipper/contracts": "0.1.0" }, scripts: { build: "tsc", typecheck: "tsc", test: "node --test" } }
  ];
  assert.deepEqual(buildPrerequisites(["packages/scoring/src/index.ts"], workspaces), ["@auto-clipper/contracts"]);
});

test("given a failed check, when its log is saved, then full output stays under local state", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-check-"));
  try {
    const output = "full diagnostic output\nsecond line\n";
    const log = await writeFailureLog(root, output, new Date("2026-10-03T12:00:00.000Z"), 7);
    assert.equal(log, ".local/ai/logs/check-2026-10-03T12-00-00-000Z-7.log");
    assert.equal(await readFile(join(root, log), "utf8"), output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
