-- Fix: export_logs und filter_log brauchen ON DELETE CASCADE
-- Damit Leads (und damit Imports) gelöscht werden können

-- export_logs: Foreign Key neu mit CASCADE
ALTER TABLE public.export_logs DROP CONSTRAINT IF EXISTS export_logs_lead_id_fkey;
ALTER TABLE public.export_logs
  ADD CONSTRAINT export_logs_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- filter_log: Foreign Key neu mit CASCADE (gleicher Fall)
ALTER TABLE public.filter_log DROP CONSTRAINT IF EXISTS filter_log_lead_id_fkey;
ALTER TABLE public.filter_log
  ADD CONSTRAINT filter_log_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
