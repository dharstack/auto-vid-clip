#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { buildCandidates } from "@auto-clipper/candidates";
import { detectEventsFromMedia } from "@auto-clipper/detectors";
import { createManifest, updateManifestStage } from "@auto-clipper/jobs";
import { buildYtDlpAnalysisFormatSelector, classifyPipelineInput, vodIdFromInput } from "@auto-clipper/media";
import { buildAnalysisMediaArgs, buildAudioExtractArgs, buildProxyBuildArgs, buildRenderClipArgs, parseYtDlpProgressLine, probeMedia, runFfmpegWithProgress, shouldEmitProgress } from "@auto-clipper/media-tools";
import { buildRenderPlan } from "@auto-clipper/render-plan";
import { scoreCandidates } from "@auto-clipper/scoring";
import { flagValue, hasFlag, positionalArg, printToolResult, toToolError } from "@auto-clipper/tooling";

let remoteProgressEndpoint: string | undefined;

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const input = positionalArg(argv, 0);
    if (!input) throw new Error("ARG_REQUIRED: VOD URL or local media path");

    const dryRun = hasFlag(argv, "--dry-run");
    const workRoot = flagValue(argv, "--work-root") ?? "work";
    const apiBaseUrl = flagValue(argv, "--api-base-url") ?? process.env.AUTO_CLIPPER_API_BASE_URL;
    const resolvedInput = await resolvePipelineInput(input, apiBaseUrl);
    const vodId = resolvedInput.vodId;
    const jobId = flagValue(argv, "--job-id") ?? `job-${vodId}`;
    remoteProgressEndpoint = apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, "")}/api/jobs/${jobId}` : undefined;
    const jobDir = join(workRoot, jobId);
    const exportsDir = join(jobDir, "exports");
    await mkdir(exportsDir, { recursive: true });
    await writeProgress(jobDir, { jobId, stage: "RESOLVE", status: "complete", progress: 1, message: "Resolved input", elapsedMs: 0 });

    let manifest = await loadManifest(jobDir, jobId, vodId);

    const analysisSource = join(jobDir, "analysis-source.mp4");
    const source = join(jobDir, "source.mp4");
    if (!existsSync(analysisSource)) {
      await writeProgress(jobDir, { jobId, stage: "DOWNLOAD_ANALYSIS_MEDIA", status: "running", progress: null, message: "Preparing analysis media", elapsedMs: 0 });
      if (existsSync(source)) {
        if (!dryRun) {
          const sourceProbe = await probeMedia(source);
          await runProgressFfmpeg(jobDir, buildAnalysisMediaArgs({ input: source, output: analysisSource, height: 720, fps: 30 }), {
            jobId, stage: "BUILD_PROXY", totalDurationMs: sourceProbe.durationMs, message: "Preparing analysis media", logName: "ffmpeg-analysis-source.log"
          });
        }
      } else if (resolvedInput.kind === "twitch-vod") {
        if (dryRun) {
          await writeFile(join(jobDir, "media.json"), JSON.stringify({ kind: "remote-url", uri: resolvedInput.url }, null, 2));
        } else {
          await runYtDlpWithProgress(jobDir, resolveYtDlp(), [
            "-f",
            buildYtDlpAnalysisFormatSelector({ maxHeight: 720, maxFps: 30 }),
            "--merge-output-format",
            "mp4",
            "--newline",
            "-o",
            analysisSource,
            resolvedInput.url
          ]);
        }
      } else {
        await copyFile(resolve(resolvedInput.path), analysisSource);
      }
    }
    await writeProgress(jobDir, { jobId, stage: "DOWNLOAD_ANALYSIS_MEDIA", status: "complete", progress: 1, message: "Analysis media ready", elapsedMs: 0 });
    manifest = updateManifestStage(manifest, "acquire", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    await writeProgress(jobDir, { jobId, stage: "PROBE", status: "running", progress: null, message: "Probing analysis media", elapsedMs: 0 });
    const probe = dryRun ? { durationMs: 120000, width: 1280, height: 720, fps: 30, hasAudio: true } : existsSync(join(jobDir, "media.json"))
      ? JSON.parse(await readFile(join(jobDir, "media.json"), "utf8"))
      : await probeMedia(analysisSource);
    await writeJson(join(jobDir, "media.json"), probe);
    await writeProgress(jobDir, { jobId, stage: "PROBE", status: "complete", progress: 1, message: "Probe complete", elapsedMs: 0 });
    manifest = updateManifestStage(manifest, "probe", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    const proxy = join(jobDir, "proxy.mp4");
    const audio = join(jobDir, "audio.wav");
    if (!dryRun) {
      if (!existsSync(proxy)) {
        await writeProgress(jobDir, { jobId, stage: "BUILD_PROXY", status: "running", progress: null, message: "Building analysis proxy", elapsedMs: 0 });
        await runProgressFfmpeg(jobDir, buildProxyBuildArgs({ input: analysisSource, output: proxy, height: 480, fps: 15 }), {
          jobId, stage: "BUILD_PROXY", totalDurationMs: probe.durationMs, message: "Building analysis proxy", logName: "ffmpeg-proxy.log"
        });
      }
      await writeProgress(jobDir, { jobId, stage: "BUILD_PROXY", status: "complete", progress: 1, message: "Analysis proxy ready", elapsedMs: 0 });
      if (probe.hasAudio && !existsSync(audio)) {
        await writeProgress(jobDir, { jobId, stage: "EXTRACT_AUDIO", status: "running", progress: null, message: "Extracting analysis audio", elapsedMs: 0 });
        await runProgressFfmpeg(jobDir, buildAudioExtractArgs({ input: analysisSource, output: audio }), {
          jobId, stage: "EXTRACT_AUDIO", totalDurationMs: probe.durationMs, message: "Extracting analysis audio", logName: "ffmpeg-audio.log"
        });
      }
    }
    await writeProgress(jobDir, { jobId, stage: "EXTRACT_AUDIO", status: "complete", progress: 1, message: "Audio ready", elapsedMs: 0 });
    manifest = updateManifestStage(updateManifestStage(manifest, "proxy", "complete"), "audio", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    await writeProgress(jobDir, { jobId, stage: "DETECT_VIDEO", status: "running", progress: null, message: "Detecting gameplay events", elapsedMs: 0 });
    const events = existsSync(join(jobDir, "events.json"))
      ? JSON.parse(await readFile(join(jobDir, "events.json"), "utf8"))
      : dryRun ? [] : await detectWithProgress(jobDir, jobId, proxy, audio);
    await writeJson(join(jobDir, "events.json"), events);
    await writeProgress(jobDir, { jobId, stage: "DETECT_VIDEO", status: "complete", progress: 1, message: "Gameplay events ready", elapsedMs: 0 });
    manifest = updateManifestStage(manifest, "detect", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    await writeProgress(jobDir, { jobId, stage: "BUILD_CANDIDATES", status: "running", progress: null, message: "Building candidates", elapsedMs: 0 });
    const candidates = existsSync(join(jobDir, "candidates.json"))
      ? JSON.parse(await readFile(join(jobDir, "candidates.json"), "utf8"))
      : buildCandidates(events);
    await writeJson(join(jobDir, "candidates.json"), candidates);
    await writeProgress(jobDir, { jobId, stage: "SCORE", status: "running", progress: null, message: "Scoring candidates", elapsedMs: 0 });
    const scores = existsSync(join(jobDir, "scores.json"))
      ? JSON.parse(await readFile(join(jobDir, "scores.json"), "utf8"))
      : scoreCandidates(candidates);
    await writeJson(join(jobDir, "scores.json"), scores);
    await writeProgress(jobDir, { jobId, stage: "BUILD_RENDER_PLAN", status: "running", progress: null, message: "Building render plan", elapsedMs: 0 });
    const plan = existsSync(join(jobDir, "render-plan.json"))
      ? JSON.parse(await readFile(join(jobDir, "render-plan.json"), "utf8"))
      : buildRenderPlan(candidates, scores, { sourceDurationMs: probe.durationMs });
    await writeJson(join(jobDir, "render-plan.json"), plan);
    await writeProgress(jobDir, { jobId, stage: "BUILD_RENDER_PLAN", status: "complete", progress: 1, message: "Render plan ready", elapsedMs: 0 });
    manifest = updateManifestStage(updateManifestStage(updateManifestStage(manifest, "candidate", "complete"), "score", "complete"), "renderPlan", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    if (!dryRun) {
      const renderInput = existsSync(source) ? source : analysisSource;
      for (const clip of plan.clips) {
        const output = join(exportsDir, clip.output);
        if (!existsSync(output)) {
          await writeProgress(jobDir, { jobId, stage: "RENDER", status: "running", progress: null, message: `Rendering ${basename(clip.output)}`, elapsedMs: 0 });
          await runProgressFfmpeg(jobDir, buildRenderClipArgs({ input: renderInput, output, startMs: clip.startMs, endMs: clip.endMs }), {
            jobId, stage: "RENDER", totalDurationMs: clip.endMs - clip.startMs, message: `Rendering ${basename(clip.output)}`, logName: "render.log"
          });
        }
      }
    }
    await writeProgress(jobDir, { jobId, stage: "COMPLETE", status: "complete", progress: 1, message: "Pipeline complete", elapsedMs: 0 });
    manifest = updateManifestStage(updateManifestStage(manifest, "resolve", "complete"), "render", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    printToolResult({ status: "ok", output: exportsDir, data: { jobId, clips: plan.clips.length, manifest: join(jobDir, "manifest.json") } });
  } catch (error) {
    printToolResult(toToolError(error, "PIPELINE_RUN_FAILED"));
    process.exitCode = 1;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2));
}

async function loadManifest(jobDir: string, jobId: string, vodId: string) {
  const path = join(jobDir, "manifest.json");
  if (existsSync(path)) {
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (existing.jobId === jobId && existing.vodId === vodId) return existing;
  }
  const manifest = createManifest({ jobId, vodId });
  await writeJson(path, manifest);
  return manifest;
}

async function detectWithProgress(jobDir: string, jobId: string, proxy: string, audio: string): Promise<Awaited<ReturnType<typeof detectEventsFromMedia>>> {
  const startedAtMs = Date.now();
  const heartbeat = setInterval(() => {
    void writeProgress(jobDir, { jobId, stage: "DETECT_VIDEO", status: "running", progress: null, message: "Detecting gameplay events", elapsedMs: Date.now() - startedAtMs });
  }, 5000);
  try {
    await writeProgress(jobDir, { jobId, stage: "DETECT_VIDEO", status: "running", progress: null, message: "Detecting gameplay events", elapsedMs: 0 });
    const events = await detectEventsFromMedia({ videoPath: proxy, audioPath: existsSync(audio) ? audio : undefined });
    await writeProgress(jobDir, { jobId, stage: "DETECT_AUDIO", status: "complete", progress: 1, message: "Audio events ready", elapsedMs: Date.now() - startedAtMs });
    return events;
  } finally {
    clearInterval(heartbeat);
  }
}

async function writeProgress(
  jobDir: string,
  progress: { jobId: string; stage: string; status: string; progress?: number | null; message: string; elapsedMs: number }
): Promise<void> {
  const snapshot = { ...progress, updatedAt: new Date().toISOString() };
  await writeJson(join(jobDir, "progress.json"), snapshot);
  if (remoteProgressEndpoint) {
    await globalThis.fetch(remoteProgressEndpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot)
    }).catch(() => undefined);
  }
}

async function runProgressFfmpeg(
  jobDir: string,
  args: string[],
  options: { jobId: string; stage: "BUILD_PROXY" | "EXTRACT_AUDIO" | "RENDER"; totalDurationMs: number; message: string; logName: string }
): Promise<void> {
  const startedAtMs = Date.now();
  let previous = null as Awaited<ReturnType<typeof parseYtDlpProgressLine>>;
  let lastEmittedAtMs = startedAtMs;
  await mkdir(join(jobDir, "logs"), { recursive: true });
  await runFfmpegWithProgress(args, {
    ...options,
    onProgress: async (progress) => {
      const nowMs = Date.now();
      if (!shouldEmitProgress(previous, progress, { nowMs, lastEmittedAtMs })) return;
      previous = progress;
      lastEmittedAtMs = nowMs;
      await writeProgress(jobDir, progress);
    },
    onLog: (chunk) => appendFile(join(jobDir, "logs", options.logName), chunk)
  });
}

async function runYtDlpWithProgress(jobDir: string, command: string, args: string[]): Promise<void> {
  await mkdir(join(jobDir, "logs"), { recursive: true });
  await new Promise<void>((resolveCommand, reject) => {
    const startedAtMs = Date.now();
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let pending = "";
    let previous = null as Awaited<ReturnType<typeof parseYtDlpProgressLine>>;
    let lastEmittedAtMs = startedAtMs;
    let callbackChain = Promise.resolve();
    const handle = (chunk: string) => {
      appendFile(join(jobDir, "logs", "yt-dlp.log"), chunk).catch(reject);
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const progress = parseYtDlpProgressLine(line, { jobId: basename(jobDir), nowMs: Date.now(), startedAtMs });
        if (!progress) continue;
        const nowMs = Date.now();
        if (shouldEmitProgress(previous, progress, { nowMs, lastEmittedAtMs })) {
          previous = progress;
          lastEmittedAtMs = nowMs;
          callbackChain = callbackChain.then(() => writeProgress(jobDir, progress));
        }
      }
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", handle);
    child.stderr.on("data", (chunk: string) => { stderr += chunk; handle(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (pending) handle(`${pending}\n`);
      callbackChain.then(() => code === 0 ? resolveCommand() : reject(new Error(`YTDLP_FAILED: ${stderr.trim()}`)), reject);
    });
  });
}

async function resolvePipelineInput(input: string, apiBaseUrl: string | undefined): Promise<
  | { kind: "twitch-vod"; vodId: string; url: string }
  | { kind: "local-file"; vodId: string; path: string }
> {
  const parsed = classifyPipelineInput(input);
  if (parsed.kind === "twitch-vod") return parsed;
  if (parsed.kind === "local-file") return { ...parsed, vodId: vodIdFromInput(parsed.path) };

  if (!apiBaseUrl) {
    throw new Error("TWITCH_CHANNEL_RESOLVE_REQUIRED: pass --api-base-url or set AUTO_CLIPPER_API_BASE_URL");
  }

  const response = await globalThis.fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: parsed.url })
  });
  if (!response.ok) throw new Error(`TWITCH_CHANNEL_RESOLVE_FAILED: ${response.status}`);
  const body = await response.json() as { data?: { vodId?: string }, vod?: { id?: string } };
  const vodId = body.data?.vodId ?? body.vod?.id;
  if (!vodId) throw new Error("TWITCH_CHANNEL_RESOLVE_INVALID");
  return { kind: "twitch-vod", vodId, url: `https://www.twitch.tv/videos/${vodId}` };
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolveCommand() : reject(new Error(`${command.toUpperCase()}_FAILED: ${code}`)));
  });
}

function resolveYtDlp(): string {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const userInstall = "C:\\Users\\dharz\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe";
  if (existsSync(userInstall)) return userInstall;
  return "yt-dlp";
}

await main();
