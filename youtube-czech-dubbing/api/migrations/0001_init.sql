-- VoiceDub jobs table (Cloudflare D1)
-- Aplikace:  wrangler d1 execute voicedub-jobs --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | processing | completed | failed
  payload      TEXT NOT NULL,                     -- JSON (source, target, voice, audio_url, ...)
  created_at   TEXT NOT NULL,
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

-- Usage tracking pro billing
CREATE TABLE IF NOT EXISTS usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    TEXT NOT NULL,
  job_id       TEXT NOT NULL,
  minutes      REAL NOT NULL,
  target_lang  TEXT NOT NULL,
  cost_cents   INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_month ON usage(tenant_id, created_at);
