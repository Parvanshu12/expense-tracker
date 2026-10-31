-- Background bank statement imports (Cloudflare Workflow per job).
CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'reading', 'extracting', 'saving', 'done', 'failed', 'undone')),
  total_pages INTEGER NOT NULL DEFAULT 0,
  pages_done INTEGER NOT NULL DEFAULT 0,
  found INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  -- JSON array of { at, text } lines shown as the live progress log.
  events TEXT NOT NULL DEFAULT '[]',
  -- JSON array of { description, amount, date, matched } rows skipped as duplicates.
  skipped_rows TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_import_jobs_user ON import_jobs(user_id, created_at DESC);

-- Which import created a transaction (for "Undo import" and review questions).
ALTER TABLE transactions ADD COLUMN import_job_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_import ON transactions(import_job_id);
