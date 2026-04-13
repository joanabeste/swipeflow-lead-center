-- Import-Logs: updated_count Spalte für Re-Import-Updates
ALTER TABLE public.import_logs
  ADD COLUMN IF NOT EXISTS updated_count integer NOT NULL DEFAULT 0;
