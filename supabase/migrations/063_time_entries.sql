-- 063: time_entries — Zeiterfassung. Portiert aus Time-Tracking-App + lead_id-Bridge fuer Phase 4.

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  note text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_end_after_start CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_running_per_user
  ON public.time_entries(user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS time_entries_user_started_idx
  ON public.time_entries(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS time_entries_lead_idx
  ON public.time_entries(lead_id) WHERE lead_id IS NOT NULL;

-- updated_at-Trigger im LC-Stil (siehe bestehende Migrationen).
CREATE OR REPLACE FUNCTION public.time_entries_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS time_entries_set_updated_at ON public.time_entries;
CREATE TRIGGER time_entries_set_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_touch();

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_entries_select_own_or_admin ON public.time_entries;
CREATE POLICY time_entries_select_own_or_admin ON public.time_entries
  FOR SELECT USING (user_id = auth.uid() OR public.zeit_is_admin());

DROP POLICY IF EXISTS time_entries_insert_own ON public.time_entries;
CREATE POLICY time_entries_insert_own ON public.time_entries
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.zeit_is_admin());

DROP POLICY IF EXISTS time_entries_update_own_or_admin ON public.time_entries;
CREATE POLICY time_entries_update_own_or_admin ON public.time_entries
  FOR UPDATE USING (user_id = auth.uid() OR public.zeit_is_admin());

DROP POLICY IF EXISTS time_entries_delete_own_or_admin ON public.time_entries;
CREATE POLICY time_entries_delete_own_or_admin ON public.time_entries
  FOR DELETE USING (user_id = auth.uid() OR public.zeit_is_admin());
