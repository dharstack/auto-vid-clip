import { createTwitchAppTokenProvider, FetchTwitchHelixClient, resolveLatestArchivedVod } from "@auto-clipper/twitch";

interface Env {
  DB: D1Database;
  JOBS: Queue;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  ALLOWED_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return withCors(null, env);
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok" }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/resolve") {
        const body = await request.json<{ input: string }>();
        if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) throw new Error("TWITCH_CREDENTIALS_REQUIRED");
        const tokenProvider = createTwitchAppTokenProvider({
          clientId: env.TWITCH_CLIENT_ID,
          clientSecret: env.TWITCH_CLIENT_SECRET
        });
        const accessToken = await tokenProvider.getAccessToken();
        const data = await resolveLatestArchivedVod(body.input, new FetchTwitchHelixClient({ clientId: env.TWITCH_CLIENT_ID, accessToken }));
        await env.DB.prepare("INSERT OR REPLACE INTO vods (vod_id, channel, title, duration_seconds) VALUES (?, ?, ?, ?)").bind(data.vodId, data.channel, data.title, data.durationSeconds).run();
        return json({ status: "ok", data }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/jobs") {
        const body = await request.json<{ vodId: string; input: string }>();
        const jobId = `job-${body.vodId}-${Date.now()}`;
        await env.DB.prepare("INSERT INTO analysis_jobs (job_id, vod_id, stage, progress, error) VALUES (?, ?, ?, ?, NULL)").bind(jobId, body.vodId, "PENDING", 0).run();
        await env.JOBS.send({ jobId, vodId: body.vodId, input: body.input });
        return json({ status: "ok", data: { jobId, stage: "PENDING", progress: 0 } }, env);
      }

      if (request.method === "GET" && url.pathname === "/api/jobs/next") {
        const row = await env.DB.prepare("SELECT job_id, vod_id, stage, progress, error FROM analysis_jobs WHERE stage = ? ORDER BY created_at ASC LIMIT 1").bind("PENDING").first();
        return json({ status: "ok", data: row ?? null }, env);
      }

      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (request.method === "PATCH" && jobMatch) {
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
      "access-control-allow-origin": env.ALLOWED_ORIGIN ?? "*",
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
