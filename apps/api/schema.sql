CREATE TABLE IF NOT EXISTS channels (
  channel TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS watched_channels (
  broadcaster_id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_process INTEGER NOT NULL DEFAULT 0,
  profile_id TEXT NOT NULL DEFAULT 'generic',
  last_vod_id TEXT,
  last_reconciled_at TEXT,
  eventsub_subscription_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vods (
  vod_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  job_id TEXT PRIMARY KEY,
  vod_id TEXT NOT NULL,
  input TEXT,
  stage TEXT NOT NULL,
  progress REAL,
  progress_json TEXT,
  error TEXT,
  claimed_by TEXT,
  claimed_at TEXT,
  lease_expires_at TEXT,
  last_heartbeat_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidate_summaries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  category TEXT NOT NULL,
  score REAL NOT NULL,
  decision TEXT NOT NULL,
  reasons_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
