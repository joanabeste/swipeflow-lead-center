-- 084: email_threads.project_id — Mail-Thread einem konkreten Projekt zuordnen.
-- Bisher haengt ein Thread nur am Kunden (lead_id). Bei Kunden mit mehreren
-- Projekten will man pro Projekt die zugehoerigen Mails sehen.
-- project_id ist optional (nullable) — Threads ohne Projekt-Zuordnung bleiben
-- weiterhin auf Kunden-Ebene sichtbar.

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_threads_project_idx
  ON public.email_threads(project_id, last_message_at DESC)
  WHERE project_id IS NOT NULL;
