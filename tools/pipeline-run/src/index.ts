#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { buildCandidates } from "@auto-clipper/candidates";
import { detectEventsFromProbe } from "@auto-clipper/detectors";
import { createManifest, updateManifestStage } from "@auto-clipper/jobs";
import { isTwitchVodUrl, vodIdFromInput } from "@auto-clipper/media";
import { buildAudioExtractArgs, buildProxyBuildArgs, buildRenderClipArgs, probeMedia, runFfmpeg } from "@auto-clipper/media-tools";
import { buildRenderPlan } from "@auto-clipper/render-plan";
import { scoreCandidates } from "@auto-clipper/scoring";
import { flagValue, hasFlag, positionalArg, printToolResult, toToolError } from "@auto-clipper/tooling";

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const input = positionalArg(argv, 0);
    if (!input) throw new Error("ARG_REQUIRED: VOD URL or local media path");

    const dryRun = hasFlag(argv, "--dry-run");
    const workRoot = flagValue(argv, "--work-root") ?? "work";
    const vodId = vodIdFromInput(input);
    const jobId = `job-${vodId}`;
    const jobDir = join(workRoot, jobId);
    const exportsDir = join(jobDir, "exports");
    await mkdir(exportsDir, { recursive: true });

    let manifest = createManifest({ jobId, vodId });
    await writeJson(join(jobDir, "manifest.json"), manifest);

    const source = join(jobDir, "source.mp4");
    if (!existsSync(source)) {
      if (isTwitchVodUrl(input)) {
        if (dryRun) {
          await writeFile(join(jobDir, "media.json"), JSON.stringify({ kind: "remote-url", uri: input }, null, 2));
        } else {
          await runCommand(resolveYtDlp(), ["-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", source, input]);
        }
      } else {
        await copyFile(resolve(input), source);
      }
    }
    manifest = updateManifestStage(manifest, "acquire", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    const probe = dryRun ? { durationMs: 120000, width: 1920, height: 1080, fps: 60, hasAudio: true } : await probeMedia(source);
    await writeJson(join(jobDir, "media.json"), probe);
    manifest = updateManifestStage(manifest, "probe", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    const proxy = join(jobDir, "proxy.mp4");
    const audio = join(jobDir, "audio.wav");
    if (!dryRun) {
      await runFfmpeg(buildProxyBuildArgs({ input: source, output: proxy, height: 480, fps: 15 }));
      if (probe.hasAudio) await runFfmpeg(buildAudioExtractArgs({ input: source, output: audio }));
    }
    manifest = updateManifestStage(updateManifestStage(manifest, "proxy", "complete"), "audio", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    const events = detectEventsFromProbe(probe);
    await writeJson(join(jobDir, "events.json"), events);
    manifest = updateManifestStage(manifest, "detect", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    const candidates = buildCandidates(events);
    await writeJson(join(jobDir, "candidates.json"), candidates);
    const scores = scoreCandidates(candidates);
    await writeJson(join(jobDir, "scores.json"), scores);
    const plan = buildRenderPlan(candidates, scores, { sourceDurationMs: probe.durationMs });
    await writeJson(join(jobDir, "render-plan.json"), plan);
    manifest = updateManifestStage(updateManifestStage(updateManifestStage(manifest, "candidate", "complete"), "score", "complete"), "renderPlan", "complete");
    await writeJson(join(jobDir, "manifest.json"), manifest);

    if (!dryRun) {
      for (const clip of plan.clips) {
        await runFfmpeg(buildRenderClipArgs({ input: source, output: join(exportsDir, clip.output), startMs: clip.startMs, endMs: clip.endMs }));
      }
    }
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
