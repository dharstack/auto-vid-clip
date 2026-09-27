ALTER TABLE analysis_jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'queued';
CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_active_vod_unique
  ON analysis_jobs(vod_id) WHERE status IN ('queued', 'running');
