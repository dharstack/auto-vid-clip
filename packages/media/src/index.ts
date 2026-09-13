import type { MediaSource, VodMediaProvider } from "@auto-clipper/contracts";

export interface LocalVodMediaProviderOptions {
  mediaRoot: string;
}

export function createLocalVodMediaProvider(options: LocalVodMediaProviderOptions): VodMediaProvider {
  return {
    async acquireAnalysisMedia(vodId: string): Promise<MediaSource> {
      return {
        kind: "local-file",
        uri: `${trimTrailingSlash(options.mediaRoot)}/${vodId}.mp4`
      };
    },

    async acquireRange(vodId: string, startMs: number, endMs: number): Promise<MediaSource> {
      return {
        kind: "local-file",
        uri: `${trimTrailingSlash(options.mediaRoot)}/${vodId}-${startMs}-${endMs}.mp4`
      };
    }
  };
}

export function isTwitchVodUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (url.hostname === "twitch.tv" || url.hostname === "www.twitch.tv") && url.pathname.startsWith("/videos/");
  } catch {
    return false;
  }
}

export function vodIdFromInput(input: string): string {
  if (isTwitchVodUrl(input)) {
    const url = new URL(input);
    return url.pathname.split("/").filter(Boolean)[1] ?? "unknown";
  }
  const base = input.split(/[\\/]/).at(-1) ?? input;
  return base.replace(/\.[^.]+$/, "") || "local";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/[\\/]+$/, "");
}
