CREATE TABLE IF NOT EXISTS watch_accounts (
  id TEXT NOT NULL PRIMARY KEY,
  x_username TEXT NOT NULL,
  x_user_id TEXT,
  display_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  baseline_post_id TEXT,
  last_seen_post_id TEXT,
  last_polled_at TEXT,
  last_poll_status TEXT,
  last_poll_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS watch_accounts_x_username_key ON watch_accounts (x_username);
CREATE INDEX IF NOT EXISTS watch_accounts_enabled_idx ON watch_accounts (enabled);

CREATE TABLE IF NOT EXISTS x_posts_raw (
  id TEXT NOT NULL PRIMARY KEY,
  x_post_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_user_id TEXT,
  posted_at TEXT NOT NULL,
  text_content TEXT NOT NULL,
  permalink_url TEXT NOT NULL,
  is_reply INTEGER NOT NULL DEFAULT 0 CHECK (is_reply IN (0, 1)),
  is_repost INTEGER NOT NULL DEFAULT 0 CHECK (is_repost IN (0, 1)),
  raw_payload_json TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS x_posts_raw_x_post_id_key ON x_posts_raw (x_post_id);
CREATE INDEX IF NOT EXISTS x_posts_raw_author_username_posted_at_idx ON x_posts_raw (author_username, posted_at);

CREATE TABLE IF NOT EXISTS delivery_targets (
  id TEXT NOT NULL PRIMARY KEY,
  target_key TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_targets_target_key_key ON delivery_targets (target_key);
CREATE INDEX IF NOT EXISTS delivery_targets_enabled_idx ON delivery_targets (enabled);

CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT NOT NULL PRIMARY KEY,
  x_post_id TEXT NOT NULL,
  target_key TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  locked_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (x_post_id) REFERENCES x_posts_raw (x_post_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (target_key) REFERENCES delivery_targets (target_key) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_events_x_post_id_target_key_key ON delivery_events (x_post_id, target_key);
CREATE INDEX IF NOT EXISTS delivery_events_status_next_retry_at_idx ON delivery_events (status, next_retry_at);

CREATE TABLE IF NOT EXISTS poll_runs (
  id TEXT NOT NULL PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  accounts_total INTEGER NOT NULL DEFAULT 0,
  accounts_succeeded INTEGER NOT NULL DEFAULT 0,
  accounts_failed INTEGER NOT NULL DEFAULT 0,
  new_posts_detected INTEGER NOT NULL DEFAULT 0,
  events_created INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS poll_runs_started_at_idx ON poll_runs (started_at);
