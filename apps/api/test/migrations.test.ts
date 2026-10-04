import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("given an empty database, when all migrations run in order, then required final schema exists", async () => {
  const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
  const migrationDirectory = join(apiRoot, "migrations");
  const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  const database = new DatabaseSync(":memory:");
  try {
    for (const name of migrationNames) database.exec(await readFile(join(migrationDirectory, name), "utf8"));

    const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(({ name }) => name));
    for (const table of ["channels", "vods", "analysis_jobs", "candidate_summaries", "exports", "settings", "watched_channels", "worker_state"]) {
      assert.ok(tables.has(table), `${table} must exist`);
    }

    const columns = (table: string) => new Set((database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(({ name }) => name));
    const requiredColumns: Record<string, string[]> = {
      channels: ["channel", "provider", "user_id", "created_at"],
      vods: ["vod_id", "channel", "title", "duration_seconds", "created_at"],
      analysis_jobs: ["job_id", "vod_id", "input", "status", "stage", "progress", "progress_json", "claimed_by", "claimed_at", "lease_expires_at", "last_heartbeat_at", "attempt_count", "created_at", "updated_at"],
      candidate_summaries: ["id", "job_id", "category", "score", "decision", "reasons_json"],
      exports: ["id", "job_id", "output", "created_at"],
      settings: ["key", "value_json"],
      watched_channels: ["broadcaster_id", "login", "display_name", "enabled", "auto_process", "profile_id", "last_vod_id", "last_reconciled_at", "eventsub_subscription_id", "created_at", "updated_at"],
      worker_state: ["worker_id", "status", "current_job_id", "last_seen_at", "started_at", "version"]
    };
    for (const [table, required] of Object.entries(requiredColumns)) {
      const actual = columns(table);
      for (const column of required) assert.ok(actual.has(column), `${table}.${column} must exist`);
    }
  } finally {
    database.close();
  }
});
