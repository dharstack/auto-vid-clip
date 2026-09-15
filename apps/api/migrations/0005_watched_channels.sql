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
