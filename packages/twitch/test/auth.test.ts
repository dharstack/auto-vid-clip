import assert from "node:assert/strict";
import test from "node:test";
import { createTwitchAppTokenProvider } from "../src/index.js";

test("requires client ID", async () => {
  const provider = createTwitchAppTokenProvider({
    clientId: "",
    clientSecret: "secret",
    fetch: failFetch,
    nowMs: () => 0
  });

  await assert.rejects(() => provider.getAccessToken(), /TWITCH_CREDENTIALS_REQUIRED/);
});

test("requires client secret", async () => {
  const provider = createTwitchAppTokenProvider({
    clientId: "client",
    clientSecret: "",
    fetch: failFetch,
    nowMs: () => 0
  });

  await assert.rejects(() => provider.getAccessToken(), /TWITCH_CREDENTIALS_REQUIRED/);
});

test("requests token with client credentials and returns access token", async () => {
  const requests: Request[] = [];
  const provider = createTwitchAppTokenProvider({
    clientId: "client",
    clientSecret: "secret",
    nowMs: () => 1000,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return jsonResponse({ access_token: "token-1", expires_in: 3600, token_type: "bearer" });
    }
  });

  assert.equal(await provider.getAccessToken(), "token-1");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url, "https://id.twitch.tv/oauth2/token");
  const body = await requests[0].text();
  assert.match(body, /client_id=client/);
  assert.match(body, /client_secret=secret/);
  assert.match(body, /grant_type=client_credentials/);
});

test("reuses cached valid token", async () => {
  let calls = 0;
  let now = 1000;
  const provider = createTwitchAppTokenProvider({
    clientId: "client",
    clientSecret: "secret",
    nowMs: () => now,
    fetch: async () => {
      calls += 1;
      return jsonResponse({ access_token: `token-${calls}`, expires_in: 3600, token_type: "bearer" });
    }
  });

  assert.equal(await provider.getAccessToken(), "token-1");
  now += 60_000;
  assert.equal(await provider.getAccessToken(), "token-1");
  assert.equal(calls, 1);
});

test("refreshes token near expiration", async () => {
  let calls = 0;
  let now = 1000;
  const provider = createTwitchAppTokenProvider({
    clientId: "client",
    clientSecret: "secret",
    nowMs: () => now,
    refreshSkewMs: 300_000,
    fetch: async () => {
      calls += 1;
      return jsonResponse({ access_token: `token-${calls}`, expires_in: 3600, token_type: "bearer" });
    }
  });

  assert.equal(await provider.getAccessToken(), "token-1");
  now += 3_600_000 - 299_000;
  assert.equal(await provider.getAccessToken(), "token-2");
  assert.equal(calls, 2);
});

test("rejects invalid Twitch token response", async () => {
  const provider = createTwitchAppTokenProvider({
    clientId: "client",
    clientSecret: "secret",
    fetch: async () => jsonResponse({ access_token: "", expires_in: 0, token_type: "bearer" }),
    nowMs: () => 0
  });

  await assert.rejects(() => provider.getAccessToken(), /TWITCH_TOKEN_RESPONSE_INVALID/);
});

test("rejects Twitch OAuth failure without exposing secrets", async () => {
  const provider = createTwitchAppTokenProvider({
    clientId: "client",
    clientSecret: "secret-value",
    fetch: async () => new Response("secret-value upstream detail", { status: 401 }),
    nowMs: () => 0
  });

  await assert.rejects(async () => provider.getAccessToken(), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /TWITCH_TOKEN_REQUEST_FAILED: 401/);
    assert.doesNotMatch(error.message, /secret-value/);
    return true;
  });
});

test("shares in-flight token request across concurrent callers", async () => {
  let calls = 0;
  let release!: (response: Response) => void;
  const responsePromise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const provider = createTwitchAppTokenProvider({
    clientId: "client",
    clientSecret: "secret",
    nowMs: () => 0,
    fetch: async () => {
      calls += 1;
      return responsePromise;
    }
  });

  const first = provider.getAccessToken();
  const second = provider.getAccessToken();
  const third = provider.getAccessToken();
  release(jsonResponse({ access_token: "shared-token", expires_in: 3600, token_type: "bearer" }));

  assert.deepEqual(await Promise.all([first, second, third]), ["shared-token", "shared-token", "shared-token"]);
  assert.equal(calls, 1);
});

async function failFetch(): Promise<Response> {
  throw new Error("fetch should not run");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
