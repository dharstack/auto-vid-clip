export interface MediaSource {
  kind: "local-file" | "remote-url";
  uri: string;
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
}

export interface MediaProbe {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec?: string;
  audioCodec?: string;
}

export interface VodMediaProvider {
  acquireAnalysisMedia(vodId: string): Promise<MediaSource>;
  acquireRange(vodId: string, startMs: number, endMs: number): Promise<MediaSource>;
}
