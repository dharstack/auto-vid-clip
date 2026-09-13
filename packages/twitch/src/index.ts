import type { TwitchResolveResult, Vod } from "@auto-clipper/contracts";

export * from "./auth.js";

export interface TwitchHelixUser {
  id: string;
  login: string;
  display_name?: string;
}

export interface TwitchHelixVideo {
  id: string;
  title: string;
  duration: string;
  created_at: string;
  type: string;
  url?: string;
}

export interface GetVideosOptions {
  type: "archive";
  first: number;
}

export interface TwitchHelixClient {
  getUserByLogin(login: string): Promise<TwitchHelixUser | null>;
  getVideosByUserId(userId: string, options: GetVideosOptions): Promise<TwitchHelixVideo[]>;
}

export function normalizeTwitchChannel(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("TWITCH_CHANNEL_INVALID: empty input");
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return validateChannel(trimmed);
  }

  const url = new URL(trimmed);
  const host = url.hostname.toLowerCase();
  if (host !== "twitch.tv" && host !== "www.twitch.tv") {
    throw new Error("TWITCH_CHANNEL_INVALID: expected twitch.tv URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 1) {
    return validateChannel(parts[0]);
  }
  if (parts.length === 2 && parts[1] === "videos") {
    return validateChannel(parts[0]);
  }

  throw new Error("TWITCH_CHANNEL_INVALID: expected channel URL");
}

export function parseTwitchDurationSeconds(duration: string): number {
  const match = duration.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) {
    throw new Error(`TWITCH_DURATION_INVALID: ${duration}`);
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function getLatestArchivedVod(channel: string, videos: TwitchHelixVideo[]): Vod {
  const archive = videos
    .filter((video) => video.type === "archive")
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];

  if (!archive) {
    throw new Error("TWITCH_VOD_NOT_FOUND: no archived VOD");
  }

  return {
    provider: "twitch",
    channel,
    vodId: archive.id,
    title: archive.title,
    durationSeconds: parseTwitchDurationSeconds(archive.duration),
    createdAt: archive.created_at,
    url: archive.url
  };
}

export async function resolveLatestArchivedVod(
  input: string,
  client: TwitchHelixClient
): Promise<TwitchResolveResult> {
  const channel = normalizeTwitchChannel(input);
  const user = await client.getUserByLogin(channel);
  if (!user) {
    throw new Error(`TWITCH_USER_NOT_FOUND: ${channel}`);
  }

  const videos = await client.getVideosByUserId(user.id, { type: "archive", first: 1 });
  const vod = getLatestArchivedVod(channel, videos);

  return {
    provider: "twitch",
    channel: vod.channel,
    vodId: vod.vodId,
    title: vod.title,
    durationSeconds: vod.durationSeconds
  };
}

export class FetchTwitchHelixClient implements TwitchHelixClient {
  constructor(
    private readonly credentials: { clientId: string; accessToken: string },
    private readonly apiBase = "https://api.twitch.tv/helix"
  ) {}

  async getUserByLogin(login: string): Promise<TwitchHelixUser | null> {
    const response = await this.get<{ data: TwitchHelixUser[] }>("/users", { login });
    return response.data[0] ?? null;
  }

  async getVideosByUserId(userId: string, options: GetVideosOptions): Promise<TwitchHelixVideo[]> {
    const response = await this.get<{ data: TwitchHelixVideo[] }>("/videos", {
      user_id: userId,
      type: options.type,
      first: String(options.first)
    });
    return response.data;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.apiBase}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      headers: {
        "Client-Id": this.credentials.clientId,
        Authorization: `Bearer ${this.credentials.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`TWITCH_API_ERROR: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}

function validateChannel(channel: string): string {
  const normalized = channel.toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(normalized)) {
    throw new Error(`TWITCH_CHANNEL_INVALID: ${channel}`);
  }
  return normalized;
}
