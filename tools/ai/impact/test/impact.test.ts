import assert from "node:assert/strict";
import test from "node:test";
import { findImporters } from "../src/index.js";

test("finds package importers by package name", () => {
  const importers = findImporters("@auto-clipper/tool-youtube-upload", [
    { file: "tools/pipeline-run/src/index.ts", text: 'import { uploadYoutubeVideo } from "@auto-clipper/tool-youtube-upload";' },
    { file: "tools/job-clean/src/index.ts", text: "export {};" }
  ]);
  assert.deepEqual(importers, ["tools/pipeline-run/src/index.ts"]);
});
