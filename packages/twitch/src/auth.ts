export interface TwitchAppTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface TwitchAppTokenProviderOptions {
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof fetch;
  nowMs?: () => number;
  refreshSkewMs?: number;
  tokenUrl?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

interface TwitchTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

let sharedCache: CachedToken | null = null;
let sharedInFlight: Promise<string> | null = null;

export function createTwitchAppTokenProvider(options: TwitchAppTokenProviderOptions): TwitchAppTokenProvider {
  const fetchFn = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const nowMs = options.nowMs ?? Date.now;
  const refreshSkewMs = options.refreshSkewMs ?? 300_000;
  const tokenUrl = options.tokenUrl ?? "https://id.twitch.tv/oauth2/token";
  let localCache: CachedToken | null = null;
  let localInFlight: Promise<string> | null = null;
  const useSharedState = !options.fetch && !options.nowMs && options.refreshSkewMs === undefined && !options.tokenUrl;

  return {
    async getAccessToken(): Promise<string> {
      const cache = useSharedState ? sharedCache : localCache;
      if (cache && cache.expiresAtMs - refreshSkewMs > nowMs()) {
        return cache.accessToken;
      }

      const inFlight = useSharedState ? sharedInFlight : localInFlight;
      if (inFlight) {
        return inFlight;
      }

      const request = requestToken({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        fetchFn,
        nowMs,
        tokenUrl
      }).then((token) => {
        if (useSharedState) {
          sharedCache = token;
        } else {
          localCache = token;
        }
        return token.accessToken;
      }).finally(() => {
        if (useSharedState) {
          sharedInFlight = null;
        } else {
          localInFlight = null;
        }
      });

      if (useSharedState) {
        sharedInFlight = request;
      } else {
        localInFlight = request;
      }

      return request;
    }
  };
}

async function requestToken(input: {
  clientId?: string;
  clientSecret?: string;
  fetchFn: typeof fetch;
  nowMs: () => number;
  tokenUrl: string;
}): Promise<CachedToken> {
  if (!input.clientId || !input.clientSecret) {
    throw new Error("TWITCH_CREDENTIALS_REQUIRED");
  }

  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "client_credentials"
  });

  const response = await input.fetchFn(input.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`TWITCH_TOKEN_REQUEST_FAILED: ${response.status}`);
  }

  const data = (await response.json()) as TwitchTokenResponse;
  if (
    typeof data.access_token !== "string" ||
    data.access_token.length === 0 ||
    typeof data.expires_in !== "number" ||
    data.expires_in <= 0 ||
    typeof data.token_type !== "string" ||
    data.token_type.toLowerCase() !== "bearer"
  ) {
    throw new Error("TWITCH_TOKEN_RESPONSE_INVALID");
  }

  return {
    accessToken: data.access_token,
    expiresAtMs: input.nowMs() + data.expires_in * 1000
  };
}
