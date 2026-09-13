import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAudioExtractArgs,
  buildRenderClipArgs,
  buildProxyBuildArgs,
  parseFfprobeJson
} from "../src/index.js";

test("parses ffprobe JSON into compact media probe", () => {
  const probe = parseFfprobeJson({
    format: { duration: "12.345" },
    streams: [
      {
        codec_type: "video",
        width: 1920,
        height: 1080,
        avg_frame_rate: "60000/1001",
        codec_name: "h264"
      },
      {
        codec_type: "audio",
        codec_name: "aac"
      }
    ]
  });

  assert.deepEqual(probe, {
    durationMs: 12345,
    width: 1920,
    height: 1080,
    fps: 59.94,
    hasAudio: true,
    videoCodec: "h264",
    audioCodec: "aac"
  });
});

test("builds deterministic render clip FFmpeg args", () => {
  assert.deepEqual(buildRenderClipArgs({ input: "vod.mp4", output: "clip.mp4", startMs: 1000, endMs: 61000 }), [
    "-y",
    "-ss",
    "1.000",
    "-i",
    "vod.mp4",
    "-t",
    "60.000",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "clip.mp4"
  ]);
});

test("builds deterministic proxy FFmpeg args", () => {
  assert.deepEqual(buildProxyBuildArgs({ input: "vod.mp4", output: "proxy.mp4", height: 480, fps: 15 }), [
    "-y",
    "-i",
    "vod.mp4",
    "-vf",
    "scale=-2:480,fps=15",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-an",
    "proxy.mp4"
  ]);
});

test("builds deterministic audio extract FFmpeg args", () => {
  assert.deepEqual(buildAudioExtractArgs({ input: "vod.mp4", output: "audio.wav" }), [
    "-y",
    "-i",
    "vod.mp4",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "audio.wav"
  ]);
});
