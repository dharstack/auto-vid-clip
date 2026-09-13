export interface TwitchChannel {
  provider: "twitch";
  channel: string;
  userId: string;
  displayName?: string;
}

export interface Vod {
  provider: "twitch";
  channel: string;
  vodId: string;
  title: string;
  durationSeconds: number;
  createdAt?: string;
  url?: string;
}

export interface TwitchResolveResult {
  provider: "twitch";
  channel: string;
  vodId: string;
  title: string;
  durationSeconds: number;
  createdAt?: string;
  url?: string;
}
