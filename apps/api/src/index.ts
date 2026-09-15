import { createTwitchAppTokenProvider, extractTwitchVodId, FetchTwitchHelixClient, getArchivedVods, resolveLatestArchivedVod, resolveVodById } from "@auto-clipper/twitch";

interface Env {
  DB: D1Database;
  JOBS: Queue;
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
        await env.JOBS.send({ jobId, vodId: body.vodId, input });
        return json({ status: "ok", data: { jobId, stage: "PENDING", progress: 0 } }, env);
      }

      if (request.method === "GET" && url.pathname === "/api/jobs/next") {
        requireWorker(request, env);
        const row = await env.DB.prepare("SELECT job_id, vod_id, input, stage, progress, error FROM analysis_jobs WHERE stage = ? ORDER BY created_at ASC LIMIT 1").bind("PENDING").first();
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
      return json({ status: "error", code: "API_ERROR", message: error instanceof Error ? error.message : String(error) }, env, 500);
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
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });
}

function requireWorker(request: Request, env: Env): void {
  const expected = env.AUTO_CLIPPER_WORKER_TOKEN;
  if (!expected || request.headers.get("Authorization") !== `Bearer ${expected}`) throw new Error("WORKER_UNAUTHORIZED");
}
