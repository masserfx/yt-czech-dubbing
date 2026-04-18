-- A9: Usage tracking — new denormalized columns on jobs for fast aggregation.
-- Aplikace: wrangler d1 migrations apply voicedub-jobs
--
-- D1 (SQLite) ADD COLUMN = O(1) metadata-only, bezpečné online. Historické rows
-- zůstávají s NULL/0 — sidepanel zobrazí disclaimer "stats od 2026-04-17".

ALTER TABLE jobs ADD COLUMN translator_provider TEXT;
ALTER TABLE jobs ADD COLUMN characters_synthesized INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN duration_seconds REAL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN endpoint TEXT DEFAULT 'dub';

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_created ON jobs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_provider ON jobs(tenant_id, translator_provider);
