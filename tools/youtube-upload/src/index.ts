import { readFile, writeFile } from "node:fs/promises";

export async function uploadYoutubeVideo(options: { filePath: string; title: string; description: string; privacyStatus: "private" | "unlisted" | "public"; outputPath: string; fetchImpl?: typeof fetch }): Promise<{ videoId: string; url: string }> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: required("YOUTUBE_CLIENT_ID"), client_secret: required("YOUTUBE_CLIENT_SECRET"), refresh_token: required("YOUTUBE_REFRESH_TOKEN"), grant_type: "refresh_token" }) });
  if (!tokenResponse.ok) throw new Error(`YOUTUBE_TOKEN_FAILED: ${tokenResponse.status}`);
  const tokenBody = await tokenResponse.json() as { access_token?: string };
  if (!tokenBody.access_token) throw new Error("YOUTUBE_ACCESS_TOKEN_MISSING");
  const bytes = await readFile(options.filePath);
  const start = await fetchImpl("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status", { method: "POST", headers: { Authorization: `Bearer ${tokenBody.access_token}`, "Content-Type": "application/json", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(bytes.byteLength) }, body: JSON.stringify({ snippet: { title: options.title, description: options.description }, status: { privacyStatus: options.privacyStatus } }) });
  if (!start.ok) throw new Error(`YOUTUBE_UPLOAD_INIT_FAILED: ${start.status}`);
  const location = start.headers.get("location");
  if (!location) throw new Error("YOUTUBE_UPLOAD_LOCATION_MISSING");
  const upload = await fetchImpl(location, { method: "PUT", headers: { Authorization: `Bearer ${tokenBody.access_token}`, "Content-Type": "video/mp4", "Content-Length": String(bytes.byteLength) }, body: bytes });
  if (!upload.ok) throw new Error(`YOUTUBE_UPLOAD_FAILED: ${upload.status}`);
  const body = await upload.json() as { id?: string };
  if (!body.id) throw new Error("YOUTUBE_UPLOAD_ID_MISSING");
  const result = { videoId: body.id, url: `https://youtu.be/${body.id}` };
  await writeFile(options.outputPath, JSON.stringify({ ...result, privacyStatus: options.privacyStatus, uploadedAt: new Date().toISOString() }, null, 2));
  return result;
}

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`YOUTUBE_CONFIG_MISSING: ${name}`); return value; }
