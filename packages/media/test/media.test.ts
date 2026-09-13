import assert from "node:assert/strict";
import test from "node:test";
import { createLocalVodMediaProvider, isTwitchVodUrl, vodIdFromInput } from "../src/index.js";

test("local provider maps analysis media to explicit local path", async () => {
  const provider = createLocalVodMediaProvider({ mediaRoot: "fixtures/media" });
  const media = await provider.acquireAnalysisMedia("123456");

  assert.deepEqual(media, {
    kind: "local-file",
    uri: "fixtures/media/123456.mp4"
  });
});

test("detects Twitch VOD URLs and extracts VOD id", () => {
  assert.equal(isTwitchVodUrl("https://www.twitch.tv/videos/123456"), true);
  assert.equal(vodIdFromInput("https://www.twitch.tv/videos/123456"), "123456");
  assert.equal(vodIdFromInput("C:/media/vod.mp4"), "vod");
});

test("local provider maps range media without doing video work", async () => {
  const provider = createLocalVodMediaProvider({ mediaRoot: "fixtures/media" });
  const media = await provider.acquireRange("123456", 1000, 5000);

  assert.deepEqual(media, {
    kind: "local-file",
    uri: "fixtures/media/123456-1000-5000.mp4"
  });
});
