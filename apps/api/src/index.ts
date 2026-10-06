import { createTwitchAppTokenProvider, extractTwitchVodId, FetchTwitchHelixClient, getArchivedVods, normalizeTwitchChannel, resolveLatestArchivedVod, resolveVodById } from "@auto-clipper/twitch";
import { normalizePipelineStage } from "@auto-clipper/contracts";
import { verifyEventSubSignature } from "./eventsub.js";

interface Env {
  DB: D1Database;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  AUTO_CLIPPER_WORKER_TOKEN?: string;
  AUTO_CLIPPER_ADMIN_TOKEN?: string;
  TWITCH_EVENTSUB_SECRET?: string;
  TWITCH_EVENTSUB_CALLBACK_URL?: string;
  WORKER_VERSION?: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const channels = await env.DB.prepare("SELECT broadcaster_id FROM watched_channels WHERE enabled = 1").all<{ broadcaster_id: string }>();
    for (const channel of channels.results) await reconcileChannel(channel.broadcaster_id, env);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
      if (request.method === "OPTIONS") return withCors(null, env, 204, request);
      const url = new URL(request.url);

    try {
      const workerRoute = url.pathname === "/api/worker/heartbeat" || url.pathname === "/api/jobs/claim" || (url.pathname.startsWith("/api/jobs/") && request.method === "PATCH");
      const eventSubWebhook = url.pathname === "/api/eventsub" && request.method === "POST";
      if (url.pathname !== "/health" && !workerRoute && !eventSubWebhook) {
        if (request.method === "GET" || (url.pathname === "/api/resolve" && request.method === "POST")) requireOperator(request, env);
        else requireAdmin(request, env);
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok" }, env, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/api/worker/heartbeat") {
        requireWorker(request, env);
        const body = await request.json<{ workerId?: string; status?: string; currentJobId?: string | null; version?: string }>();
        const workerId = body.workerId?.trim();
        if (!workerId) throw new Error("WORKER_ID_REQUIRED");
        const status = body.status === "RUNNING" ? "RUNNING" : "IDLE";
        await env.DB.prepare(`INSERT INTO worker_state (worker_id, status, current_job_id, last_seen_at, started_at, version)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(worker_id) DO UPDATE SET status = excluded.status, current_job_id = excluded.current_job_id,
            last_seen_at = CURRENT_TIMESTAMP, version = COALESCE(excluded.version, worker_state.version)`)
          .bind(workerId, status, body.currentJobId ?? null, body.version ?? env.WORKER_VERSION ?? null).run();
        return json({ status: "ok", data: { workerId, status, currentJobId: body.currentJobId ?? null } }, env, 200, request);
      }

      if (request.method === "GET" && url.pathname === "/api/worker/status") {
        const row = await env.DB.prepare("SELECT worker_id, status, current_job_id, last_seen_at, started_at, version FROM worker_state ORDER BY last_seen_at DESC LIMIT 1").first<Record<string, unknown>>();
        const lastSeenAt = typeof row?.last_seen_at === "string" ? row.last_seen_at : null;
        const online = Boolean(lastSeenAt && Date.now() - Date.parse(lastSeenAt.replace(" ", "T") + (lastSeenAt.includes("Z") ? "" : "Z")) < 90_000);
        return json({ status: "ok", data: { workerId: row?.worker_id ?? null, online, status: row?.status ?? null, currentJobId: row?.current_job_id ?? null, lastSeenAt, startedAt: row?.started_at ?? null, version: row?.version ?? null } }, env, 200, request);
      }

      if (request.method === "GET" && url.pathname === "/api/eventsub/status") {
        return json({ status: "ok", data: { configured: Boolean(env.TWITCH_EVENTSUB_SECRET && env.TWITCH_EVENTSUB_CALLBACK_URL), type: "stream.offline" } }, env, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/api/eventsub") {
        if (!env.TWITCH_EVENTSUB_SECRET || !(await verifyEventSubSignature(request, env.TWITCH_EVENTSUB_SECRET))) throw new Error("EVENTSUB_UNAUTHORIZED");
        const body = await request.json<{ challenge?: string; subscription?: { type?: string }; event?: { broadcaster_user_id?: string } }>();
        if (body.challenge) return new Response(body.challenge, { status: 200, headers: { "content-type": "text/plain" } });
        if (body.subscription?.type === "stream.offline" && body.event?.broadcaster_user_id) {
          const watched = await env.DB.prepare("SELECT last_vod_id FROM watched_channels WHERE broadcaster_id = ? AND enabled = 1 AND auto_process = 1").bind(body.event.broadcaster_user_id).first<{ last_vod_id: string | null }>();
          if (watched) await reconcileChannel(body.event.broadcaster_user_id, env);
        }
        return json({ status: "ok" }, env, 202, request);
      }

      if (url.pathname === "/api/channels") {
        if (request.method === "GET") {
          const rows = await env.DB.prepare("SELECT * FROM watched_channels ORDER BY login ASC").all();
          return json({ status: "ok", data: rows.results }, env, 200, request);
        }
        if (request.method === "POST") {
          if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) throw new Error("TWITCH_CREDENTIALS_REQUIRED");
          const body = await request.json<{ channel?: string; autoProcess?: boolean; profileId?: string }>();
          const tokenProvider = createTwitchAppTokenProvider({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET });
          const accessToken = await tokenProvider.getAccessToken();
          const client = new FetchTwitchHelixClient({ clientId: env.TWITCH_CLIENT_ID, accessToken });
          const channel = normalizeTwitchChannel(body.channel ?? "");
          const user = await client.getUserByLogin(channel);
          if (!user) throw new Error("TWITCH_USER_NOT_FOUND");
          const latest = (await getArchivedVods(channel, client, 1))[0] ?? null;
          const existing = await env.DB.prepare("SELECT broadcaster_id, login, display_name, enabled, auto_process, profile_id, last_vod_id, eventsub_subscription_id FROM watched_channels WHERE login = ? OR broadcaster_id = ? LIMIT 1").bind(user.login, user.id).first<Record<string, unknown>>();
          if (existing) return json({ status: "ok", data: { ...existing, deduplicated: true } }, env, 200, request);
          await env.DB.prepare("INSERT INTO watched_channels (broadcaster_id, login, display_name, auto_process, profile_id, last_vod_id) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(user.id, user.login, user.display_name ?? user.login, body.autoProcess ? 1 : 0, body.profileId ?? "generic", latest?.vodId ?? null).run();
          if (body.autoProcess) {
            const subscriptionId = await registerStreamOffline(user.id, env).catch(() => null);
            if (subscriptionId) await env.DB.prepare("UPDATE watched_channels SET eventsub_subscription_id = ? WHERE broadcaster_id = ?").bind(subscriptionId, user.id).run();
          }
          return json({ status: "ok", data: { broadcasterId: user.id, login: user.login, displayName: user.display_name ?? user.login, autoProcess: Boolean(body.autoProcess), profileId: body.profileId ?? "generic", lastVodId: latest?.vodId ?? null } }, env, 201, request);
        }
      }

      const channelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)$/);
      if (channelMatch && request.method === "POST") {
        const channel = await env.DB.prepare("SELECT broadcaster_id, auto_process, eventsub_subscription_id FROM watched_channels WHERE broadcaster_id = ?").bind(channelMatch[1]).first<{ broadcaster_id: string; auto_process: number; eventsub_subscription_id: string | null }>();
        if (!channel) return json({ status: "error", code: "CHANNEL_NOT_FOUND", message: "Channel not found" }, env, 404, request);
        const subscriptionId = channel.eventsub_subscription_id ?? await registerStreamOffline(channel.broadcaster_id, env);
        if (subscriptionId && subscriptionId !== channel.eventsub_subscription_id) await env.DB.prepare("UPDATE watched_channels SET eventsub_subscription_id = ?, updated_at = CURRENT_TIMESTAMP WHERE broadcaster_id = ?").bind(subscriptionId, channel.broadcaster_id).run();
        return json({ status: "ok", data: { configured: Boolean(subscriptionId), type: "stream.offline", subscriptionId: subscriptionId ? "configured" : null } }, env, 200, request);
      }
      if (channelMatch && request.method === "PATCH") {
        const body = await request.json<{ enabled?: boolean; autoProcess?: boolean; profileId?: string }>();
        await env.DB.prepare("UPDATE watched_channels SET enabled = COALESCE(?, enabled), auto_process = COALESCE(?, auto_process), profile_id = COALESCE(?, profile_id), updated_at = CURRENT_TIMESTAMP WHERE broadcaster_id = ?")
          .bind(body.enabled === undefined ? null : body.enabled ? 1 : 0, body.autoProcess === undefined ? null : body.autoProcess ? 1 : 0, body.profileId ?? null, channelMatch[1]).run();
        return json({ status: "ok" }, env, 200, request);
      }
      if (channelMatch && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM watched_channels WHERE broadcaster_id = ?").bind(channelMatch[1]).run();
        return json({ status: "ok" }, env, 200, request);
      }

      if ((request.method === "POST" && url.pathname === "/api/resolve") || (request.method === "GET" && url.pathname === "/api/vods")) {
        if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) throw new Error("TWITCH_CREDENTIALS_REQUIRED");
        const input = request.method === "POST" ? (await request.json<{ input: string }>()).input : url.searchParams.get("channel") ?? "";
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
        const tokenProvider = createTwitchAppTokenProvider({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET });
        const accessToken = await tokenProvider.getAccessToken();
        const client = new FetchTwitchHelixClient({ clientId: env.TWITCH_CLIENT_ID, accessToken });
        const exactVodId = extractTwitchVodId(input);
        if (request.method === "GET") {
          const data = await getArchivedVods(input, client, limit);
          return json({ status: "ok", data }, env, 200, request);
        }
        const data = exactVodId ? await resolveVodById(exactVodId, client) : await resolveLatestArchivedVod(input, client);
        await env.DB.prepare("INSERT OR REPLACE INTO vods (vod_id, channel, title, duration_seconds) VALUES (?, ?, ?, ?)").bind(data.vodId, data.channel, data.title, data.durationSeconds).run();
        return json({ status: "ok", data: { ...data, url: data.url ?? `https://www.twitch.tv/videos/${data.vodId}` } }, env, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/api/jobs") {
        const body = await request.json<{ vodId: string }>();
        if (!/^\d+$/.test(body.vodId)) throw new Error("VOD_ID_INVALID");
        const input = `https://www.twitch.tv/videos/${body.vodId}`;
        const existing = await env.DB.prepare("SELECT job_id, vod_id, status, stage, progress, progress_json, error, claimed_by, updated_at FROM analysis_jobs WHERE vod_id = ? AND status IN ('QUEUED', 'CLAIMED', 'RUNNING') ORDER BY created_at DESC LIMIT 1").bind(body.vodId).first<Record<string, unknown>>();
        if (existing) return json({ status: "ok", data: mapJob(existing, true) }, env, 200, request);
        const jobId = `job-${body.vodId}`;
        await env.DB.prepare("INSERT INTO analysis_jobs (job_id, vod_id, input, status, stage, progress, error) VALUES (?, ?, ?, 'QUEUED', 'RESOLVE', 0, NULL)").bind(jobId, body.vodId, input).run();
        return json({ status: "ok", data: { jobId, vodId: body.vodId, status: "QUEUED", stage: "RESOLVE", progress: 0, message: "Waiting for local worker", elapsedMs: 0, etaMs: null, error: null, worker: null, updatedAt: new Date().toISOString(), deduplicated: false } }, env, 200, request);
      }

      if (request.method === "POST" && url.pathname === "/api/jobs/claim") {
        requireWorker(request, env);
        const body = await request.json<{ workerId?: string }>();
        const workerId = body.workerId?.trim();
        if (!workerId) throw new Error("WORKER_ID_REQUIRED");
        const leaseMs = 15 * 60 * 1000;
        const now = Date.now();
        const leaseExpiresAt = new Date(now + leaseMs).toISOString();
        const row = await env.DB.prepare(
          `UPDATE analysis_jobs
             SET status = 'RUNNING', stage = COALESCE(NULLIF(stage, ''), 'RESOLVE'), claimed_by = ?, claimed_at = CURRENT_TIMESTAMP,
               lease_expires_at = ?, last_heartbeat_at = CURRENT_TIMESTAMP,
               attempt_count = COALESCE(attempt_count, 0) + 1, updated_at = CURRENT_TIMESTAMP
           WHERE job_id = (
             SELECT job_id FROM analysis_jobs
             WHERE (status IN ('QUEUED', 'CLAIMED') OR (status = 'RUNNING' AND lease_expires_at < ?))
             ORDER BY created_at ASC LIMIT 1
           )
           RETURNING job_id, vod_id, input, status, stage, progress, error, claimed_by, lease_expires_at, last_heartbeat_at`
        ).bind(workerId, leaseExpiresAt, new Date(now).toISOString()).first();
        if (row) await touchWorker(env, workerId, "RUNNING", row.job_id as string);
        return json({ status: "ok", data: row ? { ...row, jobId: row.job_id, vodId: row.vod_id, status: row.status, stage: normalizePipelineStage(String(row.stage)) } : null }, env, 200, request);
      }

      if (request.method === "GET" && url.pathname === "/api/jobs") {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
        const rows = await env.DB.prepare("SELECT job_id, vod_id, status, stage, progress, progress_json, error, claimed_by, created_at, updated_at FROM analysis_jobs ORDER BY created_at DESC LIMIT ?").bind(limit).all<Record<string, unknown>>();
        return json({ status: "ok", data: rows.results.map((row) => mapJob(row)) }, env, 200, request);
      }

      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === "PATCH" && jobMatch) {
        requireWorker(request, env);
        const body = await request.json<{ workerId?: string; stage?: string; status?: string; progress?: number | null; message?: string; elapsedMs?: number; etaMs?: number | null; error?: string | null; heartbeat?: boolean; clipsPlanned?: number | null; clipsRendered?: number | null }>();
        const row = await env.DB.prepare("SELECT claimed_by, lease_expires_at FROM analysis_jobs WHERE job_id = ?").bind(jobMatch[1]).first<{ claimed_by: string | null; lease_expires_at: string | null }>();
        if (!row || (body.workerId && row.claimed_by !== body.workerId)) throw new Error("JOB_NOT_OWNED");
        const leaseExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        if (body.heartbeat) {
          await env.DB.prepare("UPDATE analysis_jobs SET lease_expires_at = ?, last_heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE job_id = ? AND claimed_by = ?").bind(leaseExpiresAt, jobMatch[1], body.workerId ?? row.claimed_by).run();
          return json({ status: "ok", data: { jobId: jobMatch[1], heartbeat: true, leaseExpiresAt } }, env, 200, request);
        }
        const stage = normalizePipelineStage(body.stage ?? "RESOLVE");
        const normalizedStatus = String(body.status ?? "RUNNING").toUpperCase();
        const jobStatus = normalizedStatus === "COMPLETE" ? "COMPLETE" : normalizedStatus === "FAILED" ? "FAILED" : normalizedStatus === "INTERRUPTED" ? "INTERRUPTED" : "RUNNING";
        const progress = { jobId: jobMatch[1], stage, status: jobStatus, progress: body.progress ?? null, message: body.message ?? stage, elapsedMs: body.elapsedMs ?? 0, ...(body.etaMs === undefined ? {} : { etaMs: body.etaMs }), ...(body.clipsPlanned === undefined ? {} : { clipsPlanned: body.clipsPlanned }), ...(body.clipsRendered === undefined ? {} : { clipsRendered: body.clipsRendered }) };
        await env.DB.prepare("UPDATE analysis_jobs SET status = ?, stage = ?, progress = ?, progress_json = ?, error = ?, lease_expires_at = ?, last_heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE job_id = ? AND claimed_by = ?").bind(jobStatus, stage, body.progress ?? null, JSON.stringify(progress), body.error ?? null, leaseExpiresAt, jobMatch[1], body.workerId ?? row.claimed_by).run();
        if (body.workerId) await touchWorker(env, body.workerId, jobStatus === "RUNNING" ? "RUNNING" : "IDLE", jobStatus === "RUNNING" ? jobMatch[1] : null);
        return json({ status: "ok", data: { ...progress, error: body.error ?? null, leaseExpiresAt } }, env, 200, request);
      }

      if (request.method === "GET" && jobMatch) {
        const row = await env.DB.prepare("SELECT job_id, vod_id, status, stage, progress, progress_json, error, lease_expires_at, last_heartbeat_at FROM analysis_jobs WHERE job_id = ?").bind(jobMatch[1]).first<{ job_id: string; vod_id: string; status: string; stage: string; progress: number | null; progress_json: string | null; error: string | null; lease_expires_at: string | null; last_heartbeat_at: string | null }>();
        if (!row) return json({ status: "error", code: "JOB_NOT_FOUND", message: "Job not found" }, env, 404, request);
        const progress = row.progress_json ? JSON.parse(row.progress_json) : { jobId: row.job_id, stage: row.stage, status: row.status, progress: row.progress, message: row.stage, elapsedMs: null, etaMs: null };
        return json({ status: "ok", data: { ...progress, stage: normalizePipelineStage(String(progress.stage ?? row.stage)), vodId: row.vod_id, status: String(row.status).toUpperCase(), leaseExpiresAt: row.lease_expires_at, lastHeartbeatAt: row.last_heartbeat_at, error: row.error } }, env, 200, request);
      }

      return json({ status: "error", code: "NOT_FOUND", message: "Not found" }, env, 404, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "ADMIN_UNAUTHORIZED" || message === "WORKER_UNAUTHORIZED" || message === "EVENTSUB_UNAUTHORIZED" ? 401 : message === "WORKER_ID_REQUIRED" || message === "VOD_ID_INVALID" ? 400 : 500;
      return json({ status: "error", code: status === 401 ? "UNAUTHORIZED" : "API_ERROR", message }, env, status, request);
    }
  }
};

async function reconcileChannel(broadcasterId: string, env: Env): Promise<void> {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return;
  const channel = await env.DB.prepare("SELECT login, last_vod_id, auto_process, eventsub_subscription_id FROM watched_channels WHERE broadcaster_id = ?").bind(broadcasterId).first<{ login: string; last_vod_id: string | null; auto_process: number; eventsub_subscription_id: string | null }>();
  if (!channel) return;
  if (channel.auto_process && !channel.eventsub_subscription_id) {
    const subscriptionId = await registerStreamOffline(broadcasterId, env).catch(() => null);
    if (subscriptionId) await env.DB.prepare("UPDATE watched_channels SET eventsub_subscription_id = ? WHERE broadcaster_id = ?").bind(subscriptionId, broadcasterId).run();
  }
  const token = await createTwitchAppTokenProvider({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET }).getAccessToken();
  const vod = (await getArchivedVods(channel.login, new FetchTwitchHelixClient({ clientId: env.TWITCH_CLIENT_ID, accessToken: token }), 1))[0];
  if (!vod || vod.vodId === channel.last_vod_id) return;
  await env.DB.prepare("INSERT OR IGNORE INTO vods (vod_id, channel, title, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?)").bind(vod.vodId, vod.channel, vod.title, vod.durationSeconds, vod.createdAt ?? null).run();
  await env.DB.prepare("UPDATE watched_channels SET last_vod_id = ?, last_reconciled_at = CURRENT_TIMESTAMP WHERE broadcaster_id = ?").bind(vod.vodId, broadcasterId).run();
  const jobId = `job-${vod.vodId}`;
  await env.DB.prepare("INSERT OR IGNORE INTO analysis_jobs (job_id, vod_id, input, status, stage, progress, error) VALUES (?, ?, ?, 'QUEUED', 'RESOLVE', 0, NULL)").bind(jobId, vod.vodId, vod.url).run();
}

async function touchWorker(env: Env, workerId: string, status: "IDLE" | "RUNNING", currentJobId: string | null): Promise<void> {
  await env.DB.prepare(`INSERT INTO worker_state (worker_id, status, current_job_id, last_seen_at, started_at, version)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(worker_id) DO UPDATE SET status = excluded.status, current_job_id = excluded.current_job_id,
      last_seen_at = CURRENT_TIMESTAMP, version = COALESCE(excluded.version, worker_state.version)`)
    .bind(workerId, status, currentJobId, env.WORKER_VERSION ?? null).run();
}

async function registerStreamOffline(broadcasterId: string, env: Env): Promise<string | null> {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET || !env.TWITCH_EVENTSUB_SECRET || !env.TWITCH_EVENTSUB_CALLBACK_URL) return null;
  const accessToken = await createTwitchAppTokenProvider({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET }).getAccessToken();
  const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: { "Client-Id": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "stream.offline", version: "1", condition: { broadcaster_user_id: broadcasterId }, transport: { method: "webhook", callback: env.TWITCH_EVENTSUB_CALLBACK_URL, secret: env.TWITCH_EVENTSUB_SECRET } })
  });
  if (!response.ok) return null;
  const body = await response.json() as { data?: Array<{ id?: string }> };
  return body.data?.[0]?.id ?? null;
}

function mapJob(row: Record<string, unknown>, deduplicated = false): Record<string, unknown> {
  let progress: Record<string, unknown> = {};
  if (typeof row.progress_json === "string") {
    try { progress = JSON.parse(row.progress_json) as Record<string, unknown>; } catch { progress = {}; }
  }
  return {
    jobId: row.job_id,
    vodId: row.vod_id,
    status: String(row.status ?? "QUEUED").toUpperCase(),
    stage: normalizePipelineStage(String(progress.stage ?? row.stage ?? "RESOLVE")),
    progress: row.progress ?? progress.progress ?? null,
    message: progress.message ?? null,
    elapsedMs: progress.elapsedMs ?? null,
    etaMs: progress.etaMs ?? null,
    error: row.error ?? null,
    worker: row.claimed_by ?? null,
    updatedAt: row.updated_at ?? progress.updatedAt ?? null,
    createdAt: row.created_at ?? null,
    clipsPlanned: progress.clipsPlanned ?? null,
    clipsRendered: progress.clipsRendered ?? null,
    ...(deduplicated ? { deduplicated: true } : {})
  };
}

function json(body: unknown, env: Env, status = 200, request?: Request): Response {
  return withCors(JSON.stringify(body), env, status, request);
}

function withCors(body: BodyInit | null, env: Env, status = 204, request?: Request): Response {
  const origin = request?.headers.get("Origin");
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? "https://auto-video-clip-web.vercel.app,http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type, authorization"
  };
  if (origin && allowedOrigins.includes(origin)) headers["access-control-allow-origin"] = origin;
  return new Response(body, {
    status,
    headers
  });
}

function requireWorker(request: Request, env: Env): void {
  const expected = env.AUTO_CLIPPER_WORKER_TOKEN;
  if (!expected || request.headers.get("Authorization") !== `Bearer ${expected}`) throw new Error("WORKER_UNAUTHORIZED");
}

function requireAdmin(request: Request, env: Env): void {
  const expected = env.AUTO_CLIPPER_ADMIN_TOKEN;
  if (!expected || request.headers.get("Authorization") !== `Bearer ${expected}`) throw new Error("ADMIN_UNAUTHORIZED");
}

function requireOperator(request: Request, env: Env): void {
  const authorization = request.headers.get("Authorization");
  if (env.AUTO_CLIPPER_ADMIN_TOKEN && authorization === `Bearer ${env.AUTO_CLIPPER_ADMIN_TOKEN}`) return;
  if (env.AUTO_CLIPPER_WORKER_TOKEN && authorization === `Bearer ${env.AUTO_CLIPPER_WORKER_TOKEN}`) return;
  throw new Error("ADMIN_UNAUTHORIZED");
}
