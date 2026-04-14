-- Erweitert die erlaubten Werte fÃ¼r import_logs.import_type
-- damit die im Code verwendeten 'ba_job_listing' und 'google_maps' akzeptiert werden

-- Alte Constraint lÃ¶schen (falls vorhanden)
ALTER TABLE import_logs
  DROP CONSTRAINT IF EXISTS import_logs_type_check;

-- Neue Constraint mit erweiterter Werteliste
ALTER TABLE import_logs
  ADD CONSTRAINT import_logs_type_check
  CHECK (import_type IS NULL OR import_type IN (
    'csv',
    'ba_job_listing',
    'google_maps',
    'url',
    'directory',
    'job_listing'  -- Legacy-Wert, falls in Alt-Daten vorhanden
  ));
