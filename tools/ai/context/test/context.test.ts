import assert from "node:assert/strict";
import test from "node:test";
import { rankFiles } from "../src/index.js";

test("ranks Youtube upload workspace files for upload task", () => {
  const files = [
    "tools/youtube-upload/src/index.ts",
    "tools/pipeline-run/src/index.ts",
    "packages/scoring/src/index.ts"
  ];
  const ranked = rankFiles("fix youtube upload", files, { "tools/pipeline-run/src/index.ts": 'import { uploadYoutubeVideo } from "@auto-clipper/tool-youtube-upload";' });
  assert.deepEqual(ranked.slice(0, 2), ["tools/youtube-upload/src/index.ts", "tools/pipeline-run/src/index.ts"]);
});
