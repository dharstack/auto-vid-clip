import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("resolve requires client secret instead of configured access token", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "mauledbygrizzly" })
    }),
    mockEnv({ TWITCH_CLIENT_ID: "client" })
  );
  const body = await response.json() as { message: string };

  assert.equal(response.status, 500);
  assert.equal(body.message, "TWITCH_CREDENTIALS_REQUIRED");
});

test("CORS allowlist accepts production and localhost, rejects unknown origins", async () => {
  for (const origin of ["https://auto-video-clip-web.vercel.app", "http://localhost:5173"]) {
    const response = await worker.fetch(new Request("https://example.test/health", { headers: { Origin: origin } }), mockEnv());
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
  const rejected = await worker.fetch(new Request("https://example.test/health", { headers: { Origin: "https://evil.example.com" } }), mockEnv());
  assert.equal(rejected.headers.has("access-control-allow-origin"), false);
});

test("CORS preflight returns required methods and headers", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/channels", {
    method: "OPTIONS",
    headers: {
      Origin: "https://auto-video-clip-web.vercel.app",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type, authorization"
    }
  }), mockEnv());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://auto-video-clip-web.vercel.app");
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /DELETE/);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /authorization/);
});

test("resolve obtains app token then calls Helix", async () => {
  const requests: Request[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);

    if (request.url === "https://id.twitch.tv/oauth2/token") {
      return jsonResponse({ access_token: "app-token", expires_in: 3600, token_type: "bearer" });
    }

    if (request.url.startsWith("https://api.twitch.tv/helix/users")) {
      assert.equal(request.headers.get("Client-Id"), "client");
      assert.equal(request.headers.get("Authorization"), "Bearer app-token");
      return jsonResponse({ data: [{ id: "user-1", login: "mauledbygrizzly" }] });
    }

    if (request.url.startsWith("https://api.twitch.tv/helix/videos")) {
      assert.equal(request.headers.get("Client-Id"), "client");
      assert.equal(request.headers.get("Authorization"), "Bearer app-token");
      return jsonResponse({
        data: [
          {
            id: "123456",
            title: "Mortal Shell II",
            duration: "2h",
            created_at: "2026-01-01T00:00:00Z",
            type: "archive"
          }
        ]
      });
    }

    return jsonResponse({ error: "unexpected request" }, 500);
  }) as typeof fetch;

  try {
    const response = await worker.fetch(
      new Request("https://example.test/api/resolve", {
        method: "POST",
        body: JSON.stringify({ input: "mauledbygrizzly" })
      }),
      mockEnv({ TWITCH_CLIENT_ID: "client", TWITCH_CLIENT_SECRET: "secret" })
    );
    const body = await response.json() as { status: string; data: { vodId: string } };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.data.vodId, "123456");
    assert.equal(requests.filter((request) => request.url === "https://id.twitch.tv/oauth2/token").length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("channel creation normalizes Twitch channel URLs before Helix lookup", async () => {
  const requests: Request[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url === "https://id.twitch.tv/oauth2/token") return jsonResponse({ access_token: "app-token", expires_in: 3600, token_type: "bearer" });
    if (request.url.startsWith("https://api.twitch.tv/helix/users")) {
      assert.equal(new URL(request.url).searchParams.get("login"), "mauledbygrizzly");
      return jsonResponse({ data: [{ id: "user-1", login: "mauledbygrizzly", display_name: "MauledByGrizzly" }] });
    }
    if (request.url.startsWith("https://api.twitch.tv/helix/videos")) return jsonResponse({ data: [] });
    return jsonResponse({ error: "unexpected request" }, 500);
  }) as typeof fetch;
  try {
    const response = await worker.fetch(new Request("https://example.test/api/channels", {
      method: "POST",
      body: JSON.stringify({ channel: " https://www.twitch.tv/mauledbygrizzly/videos " })
    }), mockEnv({ TWITCH_CLIENT_ID: "client", TWITCH_CLIENT_SECRET: "secret" }));
    assert.equal(response.status, 201);
    assert.equal(requests.filter((request) => request.url.includes("/users")).length, 2);
    assert.ok(requests.filter((request) => request.url.includes("/users")).every((request) => new URL(request.url).searchParams.get("login") === "mauledbygrizzly"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function mockEnv(overrides: Partial<Record<"TWITCH_CLIENT_ID" | "TWITCH_CLIENT_SECRET", string>> = {}) {
  return ({
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async run() {
                return {};
              },
              async first() {
                return null;
              }
            };
          }
        };
      }
    },
    JOBS: {
      async send() {}
    },
    ALLOWED_ORIGINS: "https://auto-video-clip-web.vercel.app,http://localhost:5173",
    ...overrides
  }) as unknown as Parameters<typeof worker.fetch>[1];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
