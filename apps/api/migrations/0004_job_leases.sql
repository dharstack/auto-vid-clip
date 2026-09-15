ALTER TABLE analysis_jobs ADD COLUMN claimed_by TEXT;
ALTER TABLE analysis_jobs ADD COLUMN claimed_at TEXT;
ALTER TABLE analysis_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE analysis_jobs ADD COLUMN last_heartbeat_at TEXT;
ALTER TABLE analysis_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
