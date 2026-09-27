CREATE TABLE IF NOT EXISTS worker_state (
  worker_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'IDLE',
  current_job_id TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  version TEXT
);

UPDATE analysis_jobs SET status = UPPER(status);
DROP INDEX IF EXISTS analysis_jobs_active_vod_unique;
CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_active_vod_unique
  ON analysis_jobs(vod_id) WHERE status IN ('QUEUED', 'CLAIMED', 'RUNNING');
