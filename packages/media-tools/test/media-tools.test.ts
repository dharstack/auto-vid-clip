import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisMediaArgs,
  buildFfmpegProgressArgs,
  buildAudioExtractArgs,
  buildRenderClipArgs,
  buildProxyBuildArgs,
  parseFfprobeJson,
  parseFfmpegProgress,
  parseYtDlpProgressLine,
  shouldEmitProgress
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

test("builds deterministic analysis-media FFmpeg args", () => {
  assert.deepEqual(buildAnalysisMediaArgs({ input: "source.mp4", output: "analysis-source.mp4", height: 720, fps: 30 }), [
    "-y",
    "-i",
    "source.mp4",
    "-vf",
    "scale=-2:720,fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "27",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "analysis-source.mp4"
  ]);
});

test("adds machine-readable FFmpeg progress before output", () => {
  assert.deepEqual(buildFfmpegProgressArgs(["-y", "-i", "input.mp4", "output.mp4"]), [
    "-y",
    "-i",
    "input.mp4",
    "-progress",
    "pipe:1",
    "-nostats",
    "output.mp4"
  ]);
});

test("parses yt-dlp download progress into compact progress", () => {
  const progress = parseYtDlpProgressLine("[download]  34.5% of 13.85GiB at 4.20MiB/s ETA 36:12", {
    jobId: "job-1",
    nowMs: 11_000,
    startedAtMs: 1_000
  });

  assert.equal(progress?.stage, "DOWNLOAD_ANALYSIS_MEDIA");
  assert.equal(progress?.status, "running");
  assert.equal(progress?.progress, 0.345);
  assert.equal(progress?.bytesTotal, 14_871_324_262);
  assert.equal(progress?.bytesCompleted, 5_130_606_870);
  assert.equal(progress?.speedBytesPerSecond, 4_404_019);
  assert.equal(progress?.etaMs, 2_172_000);
});

test("keeps unknown yt-dlp totals and ETA unknown", () => {
  const progress = parseYtDlpProgressLine("[download]  12.3% at 2.00MiB/s", {
    jobId: "job-1",
    nowMs: 4_000,
    startedAtMs: 1_000
  });

  assert.equal(progress?.progress, 0.123);
  assert.equal(progress?.bytesTotal, null);
  assert.equal(progress?.etaMs, null);
});

test("parses yt-dlp finalization as indeterminate progress", () => {
  const progress = parseYtDlpProgressLine("[FixupM3u8] Fixing MPEG-TS in MP4 container of \"source.mp4\"", {
    jobId: "job-1",
    nowMs: 6_000,
    startedAtMs: 1_000
  });

  assert.equal(progress?.stage, "FINALIZE_MEDIA");
  assert.equal(progress?.status, "running");
  assert.equal(progress?.progress, null);
});

test("parses FFmpeg machine progress with source duration", () => {
  const progress = parseFfmpegProgress("out_time_ms=60000000\nspeed=4.2x\nprogress=continue", {
    jobId: "job-1",
    stage: "BUILD_PROXY",
    totalDurationMs: 120_000,
    nowMs: 11_000,
    startedAtMs: 1_000
  });

  assert.equal(progress.status, "running");
  assert.equal(progress.progress, 0.5);
  assert.equal(progress.etaMs, 14_286);
  assert.equal(progress.speedRealtime, 4.2);
});

test("parses FFmpeg completion", () => {
  const progress = parseFfmpegProgress("out_time_us=120000000\nprogress=end", {
    jobId: "job-1",
    stage: "RENDER",
    totalDurationMs: 120_000,
    nowMs: 11_000,
    startedAtMs: 1_000
  });

  assert.equal(progress.status, "complete");
  assert.equal(progress.progress, 1);
});

test("throttles progress by time and meaningful percent change", () => {
  const previous = { jobId: "job-1", stage: "RENDER" as const, status: "running" as const, progress: 0.5, message: "Rendering", elapsedMs: 1000, updatedAt: "x" };
  const tiny = { ...previous, progress: 0.505, elapsedMs: 1500 };
  const enoughPercent = { ...previous, progress: 0.52, elapsedMs: 1500 };
  const enoughTime = { ...previous, progress: 0.505, elapsedMs: 3000 };

  assert.equal(shouldEmitProgress(previous, tiny, { nowMs: 1500, lastEmittedAtMs: 1000 }), false);
  assert.equal(shouldEmitProgress(previous, enoughPercent, { nowMs: 1500, lastEmittedAtMs: 1000 }), true);
  assert.equal(shouldEmitProgress(previous, enoughTime, { nowMs: 3000, lastEmittedAtMs: 1000 }), true);
});
