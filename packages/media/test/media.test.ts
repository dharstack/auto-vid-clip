import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYtDlpAnalysisFormatSelector,
  classifyPipelineInput,
  createLocalVodMediaProvider,
  formatYtDlpDownloadSection,
  isTwitchVodUrl,
  vodIdFromInput
} from "../src/index.js";

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

test("classifies channel URL, direct VOD URL, and local file input", () => {
  assert.deepEqual(classifyPipelineInput("https://www.twitch.tv/mauledbygrizzly/videos"), {
    kind: "twitch-channel",
    channel: "mauledbygrizzly",
    url: "https://www.twitch.tv/mauledbygrizzly/videos"
  });
  assert.deepEqual(classifyPipelineInput("https://www.twitch.tv/videos/2872824469"), {
    kind: "twitch-vod",
    vodId: "2872824469",
    url: "https://www.twitch.tv/videos/2872824469"
  });
  assert.deepEqual(classifyPipelineInput("C:/media/vod.mp4"), {
    kind: "local-file",
    path: "C:/media/vod.mp4"
  });
});

test("rejects unsupported HTTP URLs instead of treating them as local files", () => {
  assert.throws(() => classifyPipelineInput("https://example.com/video.mp4"), /INPUT_URL_UNSUPPORTED/);
  assert.throws(() => classifyPipelineInput("https://www.twitch.tv/popout/mauledbygrizzly/chat"), /TWITCH_INPUT_UNSUPPORTED/);
});

test("builds low-cost yt-dlp analysis selector", () => {
  assert.equal(
    buildYtDlpAnalysisFormatSelector({ maxHeight: 720, maxFps: 30 }),
    "bv*[height<=720][fps<=30]+ba/b[height<=720][fps<=30]/bv*[height<=720]+ba/b[height<=720]/best[height<=720]/best"
  );
});

test("formats source range download section", () => {
  assert.equal(formatYtDlpDownloadSection(7_890_000, 7_932_500), "*02:11:30.000-02:12:12.500");
});
