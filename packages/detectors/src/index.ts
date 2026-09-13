import type { GameplayEvent } from "@auto-clipper/contracts";
import { spawn } from "node:child_process";

export interface FrameDifferenceSample { timestampMs: number; difference: number; }
export interface MotionDetectorOptions { threshold?: number; minSamples?: number; maxGapMs?: number; }
export interface AudioRmsSample { timestampMs: number; rms: number; }
export interface AudioReactionOptions { baselineWindow?: number; multiplier?: number; minimumRms?: number; }

export function consumeFixedChunks(chunks: Uint8Array[], chunkSize: number, onChunk: (chunk: Uint8Array) => void): void {
  let pending = Buffer.alloc(0);
  for (const chunk of chunks) {
    pending = Buffer.concat([pending, Buffer.from(chunk)]);
    while (pending.length >= chunkSize) {
      onChunk(pending.subarray(0, chunkSize));
      pending = pending.subarray(chunkSize);
    }
  }
  if (pending.length) onChunk(pending);
}

export function detectCombatMotionEvents(samples: FrameDifferenceSample[], options: MotionDetectorOptions = {}): GameplayEvent[] {
  const threshold = options.threshold ?? 0.25;
  const minSamples = options.minSamples ?? 2;
  const maxGapMs = options.maxGapMs ?? 2500;
  const active = [...samples].filter((sample) => Number.isFinite(sample.timestampMs) && sample.difference >= threshold).sort((a, b) => a.timestampMs - b.timestampMs);
  const groups: FrameDifferenceSample[][] = [];
  for (const sample of active) {
    const last = groups.at(-1);
    if (!last || sample.timestampMs - last.at(-1)!.timestampMs > maxGapMs) groups.push([sample]);
    else last.push(sample);
  }
  return groups.filter((group) => group.length >= minSamples).map((group) => {
    const peak = Math.max(...group.map((sample) => sample.difference));
    const intervalMs = group.length > 1 ? group[1].timestampMs - group[0].timestampMs : 0;
    return { type: "COMBAT_SPIKE", startMs: group[0].timestampMs, endMs: group.at(-1)!.timestampMs + Math.max(0, intervalMs), confidence: Math.min(0.99, Math.max(0, peak)), metadata: { source: "mortal-shell-2-motion-v1", samples: group.length, peakDifference: peak } };
  });
}

export function detectAudioReactionEvents(samples: AudioRmsSample[], options: AudioReactionOptions = {}): GameplayEvent[] {
  const baselineWindow = options.baselineWindow ?? 30;
  const multiplier = options.multiplier ?? 2.5;
  const minimumRms = options.minimumRms ?? 0.12;
  const active = samples.filter((sample, index) => {
    const history = samples.slice(Math.max(0, index - baselineWindow), index).map((item) => item.rms).filter((value) => value > 0);
    if (history.length === 0) return false;
    const baseline = history.reduce((sum, value) => sum + value, 0) / history.length;
    return sample.rms >= minimumRms && sample.rms >= baseline * multiplier;
  });
  const groups: AudioRmsSample[][] = [];
  for (const sample of active) {
    const last = groups.at(-1);
    if (!last || sample.timestampMs - last.at(-1)!.timestampMs > 1500) groups.push([sample]);
    else last.push(sample);
  }
  return groups.map((group) => {
    const peak = Math.max(...group.map((sample) => sample.rms));
    return { type: "MIC_REACTION", startMs: group[0].timestampMs, endMs: group.at(-1)!.timestampMs + 1000, confidence: Math.min(0.99, Math.max(0, peak)), metadata: { source: "mortal-shell-2-audio-v1", rms: peak, samples: group.length } };
  });
}

export async function detectEventsFromMedia(options: {
  videoPath: string;
  audioPath?: string;
  ffmpegPath?: string;
  sampleFps?: number;
}): Promise<GameplayEvent[]> {
  const ffmpeg = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  const videoSamples = await readFrameDifferences(ffmpeg, options.videoPath, options.sampleFps ?? 2);
  const events = detectCombatMotionEvents(videoSamples);
  if (options.audioPath) {
    const audioSamples = await readAudioRms(ffmpeg, options.audioPath);
    events.push(...detectAudioReactionEvents(audioSamples));
  }
  return events.sort((left, right) => left.startMs - right.startMs);
}

async function readFrameDifferences(ffmpeg: string, input: string, sampleFps: number): Promise<FrameDifferenceSample[]> {
  const width = 160;
  const height = 90;
  const bytesPerFrame = width * height;
  const samples: FrameDifferenceSample[] = [];
  let previous: Uint8Array | null = null;
  let frame = 0;
  await runRawStream(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", input, "-vf", `fps=${sampleFps},scale=${width}:${height},format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], (current) => {
    if (current.length !== bytesPerFrame) return;
    if (previous) {
      let total = 0;
      for (let index = 0; index < current.length; index += 1) total += Math.abs(current[index] - previous[index]);
      samples.push({ timestampMs: Math.round(frame * 1000 / sampleFps), difference: total / current.length / 255 });
    }
    previous = current;
    frame += 1;
  }, bytesPerFrame);
  return samples;
}

async function readAudioRms(ffmpeg: string, input: string): Promise<AudioRmsSample[]> {
  const sampleRate = 16000;
  const bytesPerSecond = sampleRate * 2;
  const samples: AudioRmsSample[] = [];
  let second = 0;
  await runRawStream(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", input, "-f", "s16le", "-ac", "1", "-ar", String(sampleRate), "pipe:1"], (raw) => {
    const end = raw.length;
    let sum = 0;
    let count = 0;
    for (let index = 0; index + 1 < end; index += 2) {
      const value = raw.readInt16LE(index) / 32768;
      sum += value * value;
      count += 1;
    }
    if (count) samples.push({ timestampMs: second++ * 1000, rms: Math.sqrt(sum / count) });
  }, bytesPerSecond);
  return samples;
}

function runRawStream(command: string, args: string[], onChunk: (chunk: Buffer) => void, chunkSize?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errors: Buffer[] = [];
    let pending = Buffer.alloc(0);
    child.stdout.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      if (!chunkSize) {
        onChunk(pending);
        pending = Buffer.alloc(0);
        return;
      }
      while (pending.length >= chunkSize) {
        onChunk(pending.subarray(0, chunkSize));
        pending = pending.subarray(chunkSize);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`DETECT_MEDIA_FAILED: ${Buffer.concat(errors).toString("utf8").trim()}`));
      if (pending.length && (!chunkSize || pending.length > 1)) onChunk(pending);
      resolve();
    });
  });
}
