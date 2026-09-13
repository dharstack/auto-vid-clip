import assert from "node:assert/strict";
import test from "node:test";
import { createManifest, nextStage, updateManifestStage } from "../src/index.js";

test("creates restartable manifest with pending stages", () => {
  const manifest = createManifest({ jobId: "job-001", vodId: "123456" });
  assert.equal(manifest.jobId, "job-001");
  assert.equal(manifest.vodId, "123456");
  assert.equal(manifest.stages.resolve, "pending");
  assert.equal(nextStage(manifest), "resolve");
});

test("updates manifest stage and finds next pending stage", () => {
  const manifest = updateManifestStage(createManifest({ jobId: "job-001", vodId: "123456" }), "resolve", "complete");
  assert.equal(manifest.stages.resolve, "complete");
  assert.equal(nextStage(manifest), "acquire");
});
