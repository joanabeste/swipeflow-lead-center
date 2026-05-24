-- 067: leads.assigned_to — Wer ist fuer einen Lead zustaendig?
-- Wird vom Provisions-System gelesen (066/068): erreicht der Lead einen
-- Trigger-Status, bekommt der assigned_to-User die Provision.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_assigned_to_idx
  ON public.leads(assigned_to) WHERE assigned_to IS NOT NULL;
