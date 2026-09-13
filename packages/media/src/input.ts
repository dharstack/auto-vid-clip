export type PipelineInput =
  | { kind: "twitch-channel"; channel: string; url: string }
  | { kind: "twitch-vod"; vodId: string; url: string }
  | { kind: "local-file"; path: string };

export interface AnalysisFormatOptions {
  maxHeight: number;
  maxFps: number;
}

export function classifyPipelineInput(input: string): PipelineInput {
  const trimmed = input.trim();
  if (isHttpUrl(trimmed)) return classifyUrl(trimmed);
  return { kind: "local-file", path: trimmed };
}

export function buildYtDlpAnalysisFormatSelector(options: AnalysisFormatOptions): string {
  const capped = `[height<=${options.maxHeight}][fps<=${options.maxFps}]`;
  const cappedHeight = `[height<=${options.maxHeight}]`;
  return `bv*${capped}+ba/b${capped}/bv*${cappedHeight}+ba/b${cappedHeight}/best${cappedHeight}/best`;
}

export function formatYtDlpDownloadSection(startMs: number, endMs: number): string {
  return `*${formatTimestamp(startMs)}-${formatTimestamp(endMs)}`;
}

function classifyUrl(input: string): PipelineInput {
  const url = new URL(input);
  const isTwitch = url.hostname === "twitch.tv" || url.hostname === "www.twitch.tv";
  if (!isTwitch) throw new Error("INPUT_URL_UNSUPPORTED");

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? "")) {
    return { kind: "twitch-vod", vodId: parts[1], url: input };
  }

  if (parts.length === 1 || (parts.length === 2 && parts[1] === "videos")) {
    if (isChannelName(parts[0])) return { kind: "twitch-channel", channel: parts[0].toLowerCase(), url: input };
  }

  throw new Error("TWITCH_INPUT_UNSUPPORTED");
}

function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isChannelName(value: string | undefined): value is string {
  return Boolean(value && /^[a-zA-Z0-9_]{3,25}$/.test(value));
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.max(0, ms % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${String(milliseconds).padStart(3, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
