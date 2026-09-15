import { createTwitchAppTokenProvider, extractTwitchVodId, FetchTwitchHelixClient, getArchivedVods, resolveLatestArchivedVod, resolveVodById } from "@auto-clipper/twitch";

interface Env {
  DB: D1Database;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  ALLOWED_ORIGIN?: string;
  AUTO_CLIPPER_WORKER_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return withCors(null, env);
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok" }, env);
      }

      if (url.pathname === "/api/channels") {
        if (request.method === "GET") {
          const rows = await env.DB.prepare("SELECT * FROM watched_channels ORDER BY login ASC").all();
          return json({ status: "ok", data: rows.results }, env);
        }
        if (request.method === "POST") {
          if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) throw new Error("TWITCH_CREDENTIALS_REQUIRED");
          const body = await request.json<{ channel?: string; autoProcess?: boolean; profileId?: string }>();
          const tokenProvider = createTwitchAppTokenProvider({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET });
          const accessToken = await tokenProvider.getAccessToken();
          const client = new FetchTwitchHelixClient({ clientId: env.TWITCH_CLIENT_ID, accessToken });
          const channel = body.channel ?? "";
          const user = await client.getUserByLogin(channel);
          if (!user) throw new Error("TWITCH_USER_NOT_FOUND");
          const latest = (await getArchivedVods(channel, client, 1))[0] ?? null;
          await env.DB.prepare("INSERT INTO watched_channels (broadcaster_id, login, display_name, auto_process, profile_id, last_vod_id) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(user.id, user.login, user.display_name ?? user.login, body.autoProcess ? 1 : 0, body.profileId ?? "generic", latest?.vodId ?? null).run();
          return json({ status: "ok", data: { broadcasterId: user.id, login: user.login, displayName: user.display_name ?? user.login, autoProcess: Boolean(body.autoProcess), profileId: body.profileId ?? "generic", lastVodId: latest?.vodId ?? null } }, env, 201);
        }
      }

      const channelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)$/);
      if (channelMatch && request.method === "PATCH") {
        const body = await request.json<{ enabled?: boolean; autoProcess?: boolean; profileId?: string }>();
        await env.DB.prepare("UPDATE watched_channels SET enabled = COALESCE(?, enabled), auto_process = COALESCE(?, auto_process), profile_id = COALESCE(?, profile_id), updated_at = CURRENT_TIMESTAMP WHERE broadcaster_id = ?")
          .bind(body.enabled === undefined ? null : body.enabled ? 1 : 0, body.autoProcess === undefined ? null : body.autoProcess ? 1 : 0, body.profileId ?? null, channelMatch[1]).run();
        return json({ status: "ok" }, env);
      }
      if (channelMatch && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM watched_channels WHERE broadcaster_id = ?").bind(channelMatch[1]).run();
        return json({ status: "ok" }, env);
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
          return json({ status: "ok", data }, env);
        }
        const data = exactVodId ? await resolveVodById(exactVodId, client) : await resolveLatestArchivedVod(input, client);
        await env.DB.prepare("INSERT OR REPLACE INTO vods (vod_id, channel, title, duration_seconds) VALUES (?, ?, ?, ?)").bind(data.vodId, data.channel, data.title, data.durationSeconds).run();
        return json({ status: "ok", data: { ...data, url: data.url ?? `https://www.twitch.tv/videos/${data.vodId}` } }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/jobs") {
        const body = await request.json<{ vodId: string }>();
        if (!/^\d+$/.test(body.vodId)) throw new Error("VOD_ID_INVALID");
        const input = `https://www.twitch.tv/videos/${body.vodId}`;
        const jobId = `job-${body.vodId}-${Date.now()}`;
        await env.DB.prepare("INSERT INTO analysis_jobs (job_id, vod_id, input, stage, progress, error) VALUES (?, ?, ?, ?, ?, NULL)").bind(jobId, body.vodId, input, "PENDING", 0).run();
        return json({ status: "ok", data: { jobId, stage: "PENDING", progress: 0 } }, env);
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
           SET stage = 'CLAIMED', claimed_by = ?, claimed_at = CURRENT_TIMESTAMP,
               lease_expires_at = ?, last_heartbeat_at = CURRENT_TIMESTAMP,
               attempt_count = COALESCE(attempt_count, 0) + 1, updated_at = CURRENT_TIMESTAMP
           WHERE job_id = (
             SELECT job_id FROM analysis_jobs
             WHERE (stage = 'PENDING' OR (stage IN ('CLAIMED', 'RUNNING') AND lease_expires_at < ?))
             ORDER BY created_at ASC LIMIT 1
           )
           RETURNING job_id, vod_id, input, stage, progress, error, claimed_by, lease_expires_at`
        ).bind(workerId, leaseExpiresAt, new Date(now).toISOString()).first();
        return json({ status: "ok", data: row ?? null }, env);
      }

      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === "PATCH" && jobMatch) {
        requireWorker(request, env);
        const body = await request.json<{ stage: string; status?: string; progress?: number | null; message?: string; elapsedMs?: number; etaMs?: number | null; error?: string | null }>();
        const progress = { jobId: jobMatch[1], stage: body.stage, status: body.status ?? "running", progress: body.progress ?? null, message: body.message ?? body.stage, elapsedMs: body.elapsedMs ?? 0, ...(body.etaMs === undefined ? {} : { etaMs: body.etaMs }) };
        await env.DB.prepare("UPDATE analysis_jobs SET stage = ?, progress = ?, progress_json = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?").bind(body.stage, body.progress ?? null, JSON.stringify(progress), body.error ?? null, jobMatch[1]).run();
        return json({ status: "ok", data: { ...progress, error: body.error ?? null } }, env);
      }

      if (request.method === "GET" && jobMatch) {
        const row = await env.DB.prepare("SELECT job_id, vod_id, stage, progress, progress_json, error FROM analysis_jobs WHERE job_id = ?").bind(jobMatch[1]).first<{ job_id: string; vod_id: string; stage: string; progress: number | null; progress_json: string | null; error: string | null }>();
        if (!row) return json({ status: "error", code: "JOB_NOT_FOUND", message: "Job not found" }, env, 404);
        const progress = row.progress_json ? JSON.parse(row.progress_json) : { jobId: row.job_id, stage: row.stage, status: row.stage === "COMPLETE" ? "complete" : "running", progress: row.progress, message: row.stage, elapsedMs: 0 };
        return json({ status: "ok", data: { ...progress, vodId: row.vod_id, error: row.error } }, env);
      }

      return json({ status: "error", code: "NOT_FOUND", message: "Not found" }, env, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "WORKER_UNAUTHORIZED" ? 401 : message === "WORKER_ID_REQUIRED" || message === "VOD_ID_INVALID" ? 400 : 500;
      return json({ status: "error", code: status === 401 ? "UNAUTHORIZED" : "API_ERROR", message }, env, status);
    }
  }
};

function json(body: unknown, env: Env, status = 200): Response {
  return withCors(JSON.stringify(body), env, status);
}

function withCors(body: BodyInit | null, env: Env, status = 204): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": env.ALLOWED_ORIGIN ?? "http://localhost:5173",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });
}

function requireWorker(request: Request, env: Env): void {
  const expected = env.AUTO_CLIPPER_WORKER_TOKEN;
  if (!expected || request.headers.get("Authorization") !== `Bearer ${expected}`) throw new Error("WORKER_UNAUTHORIZED");
}
