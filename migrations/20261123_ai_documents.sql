-- Niyam Next assistant document knowledge, 2026-11-23.
-- Additive, idempotent schema change; run only on reviewed staging first.
-- Do NOT run against production without owner-approved cutover procedures.
BEGIN;
CREATE TABLE IF NOT EXISTS niyam_ai_documents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES niyam_accounts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_hash text NOT NULL,
  extracted_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, content_hash)
);
CREATE INDEX IF NOT EXISTS niyam_ai_documents_account_time
  ON niyam_ai_documents (account_id, created_at DESC);
COMMIT;
