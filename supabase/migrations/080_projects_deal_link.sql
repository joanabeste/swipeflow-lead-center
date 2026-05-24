-- 080: projects.deal_id — Rückverlinkung Projekt ↔ Deal.
-- Wird beim Auto-Anlegen eines Projekts aus einem gewonnenen Deal gesetzt.
-- Verhindert Doppel-Anlage und erlaubt Navigation zwischen Pipeline und Fulfillment.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_deal_idx ON public.projects(deal_id);
