import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { MediaProbe } from "@auto-clipper/contracts";

export interface ProxyBuildOptions {
  input: string;
  output: string;
  height: number;
  fps: number;
}

export interface AudioExtractOptions {
  input: string;
  output: string;
}

export interface RenderClipOptions {
  input: string;
  output: string;
  startMs: number;
  endMs: number;
}

export function parseFfprobeJson(raw: unknown): MediaProbe {
  const data = raw as {
    format?: { duration?: string };
    streams?: Array<Record<string, unknown>>;
  };

  const streams = data.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");

  if (!video) {
    throw new Error("FFPROBE_VIDEO_STREAM_MISSING");
  }

  return {
    durationMs: Math.round(Number(data.format?.duration ?? 0) * 1000),
    width: numberField(video, "width"),
    height: numberField(video, "height"),
    fps: roundFps(parseRate(String(video.avg_frame_rate ?? "0/1"))),
    hasAudio: Boolean(audio),
    videoCodec: stringField(video, "codec_name"),
    audioCodec: audio ? stringField(audio, "codec_name") : undefined
  };
}

export function buildFfprobeArgs(input: string): string[] {
  return [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    input
  ];
}

export function buildProxyBuildArgs(options: ProxyBuildOptions): string[] {
  return [
    "-y",
    "-i",
    options.input,
    "-vf",
    `scale=-2:${options.height},fps=${options.fps}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-an",
    options.output
  ];
}

export function buildAudioExtractArgs(options: AudioExtractOptions): string[] {
  return [
    "-y",
    "-i",
    options.input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    options.output
  ];
}

export function buildRenderClipArgs(options: RenderClipOptions): string[] {
  const startSeconds = (options.startMs / 1000).toFixed(3);
  const durationSeconds = ((options.endMs - options.startMs) / 1000).toFixed(3);
  return [
    "-y",
    "-ss",
    startSeconds,
    "-i",
    options.input,
    "-t",
    durationSeconds,
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
    options.output
  ];
}

export async function probeMedia(input: string): Promise<MediaProbe> {
  const stdout = await runCommand(resolveBinary("ffprobe"), buildFfprobeArgs(input));
  return parseFfprobeJson(JSON.parse(stdout));
}

export async function runFfmpeg(args: string[]): Promise<void> {
  await runCommand(resolveBinary("ffmpeg"), args);
}

export function resolveBinary(name: "ffmpeg" | "ffprobe"): string {
  const envPath = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (envPath) return envPath;

  const wingetPath = `C:\\Users\\dharz\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\${name}.exe`;
  if (existsSync(wingetPath)) return wingetPath;

  return name;
}

function parseRate(rate: string): number {
  const [numerator, denominator] = rate.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function roundFps(value: number): number {
  return Math.round(value * 100) / 100;
}

function numberField(source: Record<string, unknown>, key: string): number {
  const value = Number(source[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`FFPROBE_FIELD_INVALID: ${key}`);
  }
  return value;
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command.toUpperCase()}_FAILED: ${stderr.trim()}`));
      }
    });
  });
}
