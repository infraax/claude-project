CREATE TABLE IF NOT EXISTS observations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  schema_version  TEXT NOT NULL DEFAULT '1.0',
  task_type       TEXT NOT NULL,
  protocol_condition TEXT NOT NULL DEFAULT '',
  dispatch_format TEXT NOT NULL DEFAULT '',
  tokens_input    INTEGER NOT NULL,
  tokens_output   INTEGER NOT NULL,
  tokens_cache_read  INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,
  compression_ratio  REAL,
  latency_total_ms   INTEGER NOT NULL,
  outcome         TEXT NOT NULL,
  iterations      INTEGER NOT NULL DEFAULT 1,
  opt_cache       INTEGER NOT NULL DEFAULT 1,
  opt_format_encode INTEGER NOT NULL DEFAULT 1,
  opt_clarity     INTEGER NOT NULL DEFAULT 1,
  opt_llmlingua   INTEGER NOT NULL DEFAULT 1,
  opt_pd          INTEGER NOT NULL DEFAULT 1,
  ablation_condition TEXT,
  ts              TEXT NOT NULL,
  received_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_type ON observations(task_type);
CREATE INDEX IF NOT EXISTS idx_ts        ON observations(ts);
CREATE INDEX IF NOT EXISTS idx_install   ON observations(installation_id);
CREATE INDEX IF NOT EXISTS idx_ablation  ON observations(ablation_condition);
