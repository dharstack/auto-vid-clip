import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("worker heartbeat accepts token and status returns safe online fields", async () => {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const env = mockEnv({ workerRow: { worker_id: "desktop-main", status: "RUNNING", current_job_id: "job-1", last_seen_at: now, started_at: now, version: "1.0.0" } });
  const heartbeat = await worker.fetch(new Request("https://example.test/api/worker/heartbeat", { method: "POST", headers: { Authorization: "Bearer secret", "content-type": "application/json" }, body: JSON.stringify({ workerId: "desktop-main", status: "RUNNING", currentJobId: "job-1", version: "1.0.0" }) }), env);
  assert.equal(heartbeat.status, 200);
  const status = await worker.fetch(new Request("https://example.test/api/worker/status", { headers: { Authorization: "Bearer admin-secret" } }), env);
  const body = await status.json() as { data: { online: boolean; currentJobId: string; workerId: string; token?: string } };
  assert.equal(body.data.online, true);
  assert.equal(body.data.currentJobId, "job-1");
  assert.equal(body.data.workerId, "desktop-main");
  assert.equal("token" in body.data, false);
});

test("worker heartbeat rejects missing or wrong token", async () => {
  const env = mockEnv({});
  for (const authorization of [undefined, "Bearer wrong"]) {
    const response = await worker.fetch(new Request("https://example.test/api/worker/heartbeat", { method: "POST", headers: { ...(authorization ? { Authorization: authorization } : {}), "content-type": "application/json" }, body: JSON.stringify({ workerId: "desktop-main", status: "IDLE" }) }), env);
    assert.equal(response.status, 401);
  }
});

test("EventSub status exposes configuration without secrets", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/eventsub/status", { headers: { Authorization: "Bearer admin-secret" } }), mockEnv({}));
  const body = await response.json() as { data: { configured: boolean; type: string; secret?: string } };
  assert.equal(response.status, 200);
  assert.equal(body.data.configured, false);
  assert.equal(body.data.type, "stream.offline");
  assert.equal("secret" in body.data, false);
});

function mockEnv(input: { workerRow?: Record<string, unknown> }) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind() { return { async run() { return {}; } }; },
          async first() { return sql.includes("worker_state") ? input.workerRow ?? null : null; }
        };
      }
    },
    AUTO_CLIPPER_WORKER_TOKEN: "secret",
    AUTO_CLIPPER_ADMIN_TOKEN: "admin-secret",
    ALLOWED_ORIGINS: "https://auto-video-clip-web.vercel.app"
  } as unknown as Parameters<typeof worker.fetch>[1];
}
