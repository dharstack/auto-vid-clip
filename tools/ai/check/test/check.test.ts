import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildPrerequisites, getChangedFiles, planChecks, summarizeFailure, writeFailureLog } from "../src/index.js";

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

test("given a committed scoring change on a feature branch, when changed files are collected, then scoring is checked", async () => {
  const root = await mkdtemp(join(tmpdir(), "auto-clipper-git-check-"));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "-b", "master");
    git("config", "user.name", "AI check test");
    git("config", "user.email", "ai-check@example.test");
    await mkdir(join(root, "packages", "scoring", "src"), { recursive: true });
    await writeFile(join(root, "packages", "scoring", "src", "index.ts"), "export {};\n");
    git("add", ".");
    git("commit", "-m", "baseline");
    git("switch", "-c", "feature");
    await writeFile(join(root, "packages", "scoring", "src", "index.ts"), "export const changed = true;\n");
    git("commit", "-am", "change scoring");

    const changedFiles = getChangedFiles(root);
    const checks = planChecks(changedFiles, [
      { name: "@auto-clipper/scoring", path: "packages/scoring", scripts: { build: "tsc", typecheck: "tsc", test: "node --test" } },
      { name: "@auto-clipper/render-plan", path: "packages/render-plan", scripts: { build: "tsc", typecheck: "tsc", test: "node --test" } }
    ]);
    assert.ok(changedFiles.includes("packages/scoring/src/index.ts"));
    assert.ok(checks.some(({ workspace }) => workspace === "@auto-clipper/scoring"));
    assert.ok(!checks.some(({ workspace }) => workspace === "@auto-clipper/render-plan"));

    await writeFile(join(root, "packages", "scoring", "src", "index.ts"), "export const unstaged = true;\n");
    await writeFile(join(root, "packages", "scoring", "test-staged.ts"), "export {};\n");
    git("add", "packages/scoring/test-staged.ts");
    await writeFile(join(root, "packages", "scoring", "test-untracked.ts"), "export {};\n");
    const workingChanges = getChangedFiles(root);
    assert.ok(workingChanges.includes("packages/scoring/src/index.ts"));
    assert.ok(workingChanges.includes("packages/scoring/test-staged.ts"));
    assert.ok(workingChanges.includes("packages/scoring/test-untracked.ts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("given contracts changed, when targeted checks are planned, then reverse dependents are checked", () => {
  const scripts = { build: "tsc", typecheck: "tsc", test: "node --test" };
  const checks = planChecks(["packages/contracts/src/pipeline.ts"], [
    { name: "@auto-clipper/tool-pipeline-run", path: "tools/pipeline-run", dependencies: { "@auto-clipper/scoring": "0.1.0" }, scripts },
    { name: "@auto-clipper/scoring", path: "packages/scoring", dependencies: { "@auto-clipper/contracts": "0.1.0" }, scripts },
    { name: "@auto-clipper/contracts", path: "packages/contracts", scripts }
  ]);
  assert.deepEqual(new Set(checks.map(({ workspace }) => workspace)), new Set([
    "@auto-clipper/contracts",
    "@auto-clipper/scoring",
    "@auto-clipper/tool-pipeline-run"
  ]));
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
