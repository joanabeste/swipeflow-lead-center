-- Original-CSV-Datei beim Import in Supabase Storage ablegen, damit sie aus
-- der „Vergangene Imports"-Liste heruntergeladen werden kann (Debugging,
-- Nachvollzug). Nach Ablauf von csv_expires_at wird die Datei vom
-- Cleanup-Cron entfernt und der Pfad genullt.

ALTER TABLE import_logs
  ADD COLUMN IF NOT EXISTS csv_storage_path text,
  ADD COLUMN IF NOT EXISTS csv_size_bytes integer,
  ADD COLUMN IF NOT EXISTS csv_expires_at timestamptz;

-- Storage-Bucket fuer die Original-CSVs. Nicht public — Zugriff laeuft
-- ueber kurzlebige signed URLs aus dem /api/import/[id]/download-Endpoint.
INSERT INTO storage.buckets (id, name, public)
VALUES ('import-csvs', 'import-csvs', false)
ON CONFLICT (id) DO NOTHING;
