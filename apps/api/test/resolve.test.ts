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
    ALLOWED_ORIGIN: "*",
    ...overrides
  }) as unknown as Parameters<typeof worker.fetch>[1];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
