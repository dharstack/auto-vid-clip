import { access, lstat, readdir, readFile, realpath, rm } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative, resolve } from "node:path";

const HEAVY_FILES = new Set(["source.mp4", "analysis-source.mp4", "proxy.mp4", "audio.wav"]);
const HEAVY_DIRS = new Set(["ranges", "tmp", "temp", "frames", "detector-media"]);
const JOB_RE = /^job-[A-Za-z0-9_-]+$/;
const TEMP_FILE_RE = /^(?:.+\.(?:part|ytdl|tmp)|ffmpeg-.+)$/i;
export type CleanupPolicy = "intermediates" | "purge";
export interface CleanupItem { path: string; bytes: number }
export interface CleanupJob { jobId: string; status: "eligible" | "skipped"; reason?: string; policy: CleanupPolicy; delete: CleanupItem[]; keep: string[]; bytesRecoverable: number }
export interface CleanupPlan { workRoot: string; jobs: CleanupJob[]; policy: CleanupPolicy; dryRun?: boolean; bytesRecoverable: number }

function inside(root: string, candidate: string) {
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith(".." ) || isAbsolute(rel)) throw new Error("CLEAN_PATH_OUTSIDE_WORK_ROOT");
}
async function bytes(path: string): Promise<number> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error("CLEAN_PATH_OUTSIDE_WORK_ROOT");
  if (info.isFile()) return info.size;
  if (!info.isDirectory()) return 0;
  const entries = await readdir(path);
  return (await Promise.all(entries.map((entry) => bytes(join(path, entry))))).reduce((a, b) => a + b, 0);
}
async function json(path: string): Promise<any | undefined> { try { return JSON.parse(await readFile(path, "utf8")); } catch { return undefined; } }
async function jobStatus(job: string): Promise<"eligible" | "skipped"> {
  const progress = await json(join(job, "progress.json"));
  if (progress?.stage === "COMPLETE") return "eligible";
  const manifest = await json(join(job, "manifest.json"));
  if (manifest?.stages && Object.keys(manifest.stages).length > 0 && Object.values(manifest.stages).every((value) => value === "complete")) return "eligible";
  return "skipped";
}
async function oneJob(root: string, jobId: string, policy: CleanupPolicy, force: boolean): Promise<CleanupJob> {
  if (!JOB_RE.test(jobId)) throw new Error("CLEAN_JOB_NOT_FOUND");
  const dir = resolve(root, jobId); inside(root, dir);
  let info; try { info = await lstat(dir); } catch { throw new Error("CLEAN_JOB_NOT_FOUND"); }
  if (!info.isDirectory() || info.isSymbolicLink() || !(await access(join(dir, "manifest.json")).then(() => true).catch(() => false))) throw new Error("CLEAN_JOB_NOT_FOUND");
  const status = await jobStatus(dir);
  if (status === "skipped" && !force) return { jobId, status, reason: "incomplete or active", policy, delete: [], keep: [], bytesRecoverable: 0 };
  if (policy === "purge") return { jobId, status: "eligible", policy, delete: [{ path: dir, bytes: await bytes(dir) }], keep: [], bytesRecoverable: await bytes(dir) };
  const del: CleanupItem[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) if (entry.isFile() && TEMP_FILE_RE.test(entry.name)) { const path = join(dir, entry.name); del.push({ path, bytes: await bytes(path) }); }
  for (const name of HEAVY_FILES) { const path = join(dir, name); if (await access(path).then(() => true).catch(() => false)) del.push({ path, bytes: await bytes(path) }); }
  for (const name of HEAVY_DIRS) { const path = join(dir, name); if (await access(path).then(() => true).catch(() => false)) del.push({ path, bytes: await bytes(path) }); }
  const keep = ["exports", "manifest.json", "vod.json", "media.json", "progress.json", "events.json", "candidates.json", "scores.json", "render-plan.json", "logs"].map((name) => join(dir, name));
  return { jobId, status: "eligible", policy, delete: del, keep, bytesRecoverable: del.reduce((sum, item) => sum + item.bytes, 0) };
}
export async function buildCleanupPlan(options: { workRoot: string; jobId?: string; all?: boolean; purge?: boolean; dryRun?: boolean; force?: boolean }): Promise<CleanupPlan> {
  let root = resolve(options.workRoot);
  if (!(await access(join(root, ".auto-clipper-root")).then(() => true).catch(() => false))) throw new Error("CLEAN_WORK_ROOT_UNRECOGNIZED");
  root = await realpath(root);
  if (!!options.jobId === !!options.all) throw new Error(options.jobId ? "CLEAN_SCOPE_CONFLICT" : "CLEAN_SCOPE_REQUIRED");
  const policy = options.purge ? "purge" : "intermediates";
  let ids = options.jobId ? [options.jobId] : (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && JOB_RE.test(entry.name) && !entry.isSymbolicLink()).map((entry) => entry.name).sort();
  const jobs = await Promise.all(ids.map((id) => oneJob(root, id, policy, !!options.force)));
  return { workRoot: root, jobs, policy, dryRun: options.dryRun, bytesRecoverable: jobs.reduce((sum, job) => sum + job.bytesRecoverable, 0) };
}
export async function executeCleanupPlan(plan: CleanupPlan): Promise<number> {
  for (const job of plan.jobs) if (job.status === "eligible") for (const item of job.delete) {
    inside(plan.workRoot, resolve(item.path));
    const info = await lstat(item.path).catch(() => undefined);
    if (info?.isSymbolicLink()) throw new Error("CLEAN_PATH_OUTSIDE_WORK_ROOT");
    await rm(item.path, { recursive: true, force: true });
  }
  return plan.jobs.filter((job) => job.status === "eligible").reduce((sum, job) => sum + job.bytesRecoverable, 0);
}
function human(value: number) { const units = ["B", "KiB", "MiB", "GiB"]; let i = 0; while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; } return `${value.toFixed(i ? 1 : 0)} ${units[i]}`; }
async function main() {
  const argv = process.argv.slice(2), value = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; }, has = (flag: string) => argv.includes(flag);
  const plan = await buildCleanupPlan({ workRoot: value("--work-root") ?? "work", jobId: value("--job"), all: has("--all"), purge: has("--purge"), dryRun: has("--dry-run"), force: has("--force") });
  if (has("--purge") && !has("--dry-run")) {
    if (!has("--yes") && !process.stdin.isTTY) throw new Error("CLEAN_CONFIRMATION_REQUIRED");
    if (!has("--yes") && process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try { const answer = await rl.question("Type DELETE to continue: "); if (answer !== "DELETE") return; }
      finally { rl.close(); }
    }
  }
  const skipped = plan.jobs.filter((job) => job.status === "skipped").length;
  const deleted = has("--dry-run") ? 0 : await executeCleanupPlan(plan);
  const result = { status: "ok", mode: has("--all") ? "all" : "job", policy: plan.policy, dryRun: !!plan.dryRun, jobsEligible: plan.jobs.filter((job) => job.status === "eligible").length, jobsSkipped: skipped, bytesRecoverable: plan.bytesRecoverable, bytesDeleted: deleted };
  if (has("--json")) process.stdout.write(`${JSON.stringify(result)}\n`); else process.stdout.write(`Auto-Clipper Cleanup\n\nJobs eligible: ${result.jobsEligible}\nJobs skipped: ${skipped}\n${has("--dry-run") ? "Recoverable" : "Deleted"}: ${human(has("--dry-run") ? plan.bytesRecoverable : deleted)}\n`);
}
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify({ status: "error", code: message, message })}\n`);
  else process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
