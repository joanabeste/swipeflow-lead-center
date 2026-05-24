-- 064: absences — Abwesenheits-Antraege. Portiert aus Time-Tracking-App.

CREATE TABLE IF NOT EXISTS public.absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('vacation', 'sick', 'other')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absences_to_after_from CHECK (date_to >= date_from)
);

CREATE INDEX IF NOT EXISTS absences_user_from_idx ON public.absences(user_id, date_from);
CREATE INDEX IF NOT EXISTS absences_pending_idx ON public.absences(status) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.absences_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS absences_set_updated_at ON public.absences;
CREATE TRIGGER absences_set_updated_at
  BEFORE UPDATE ON public.absences
  FOR EACH ROW EXECUTE FUNCTION public.absences_touch();

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS absences_select_own_or_admin ON public.absences;
CREATE POLICY absences_select_own_or_admin ON public.absences
  FOR SELECT USING (user_id = auth.uid() OR public.zeit_is_admin());

-- Nutzer duerfen nur 'pending' anlegen — Auto-Approve unterbinden.
DROP POLICY IF EXISTS absences_insert_own_pending ON public.absences;
CREATE POLICY absences_insert_own_pending ON public.absences
  FOR INSERT WITH CHECK (
    (user_id = auth.uid() AND status = 'pending')
    OR public.zeit_is_admin()
  );

DROP POLICY IF EXISTS absences_update_own_pending_or_admin ON public.absences;
CREATE POLICY absences_update_own_pending_or_admin ON public.absences
  FOR UPDATE USING (
    (user_id = auth.uid() AND status = 'pending')
    OR public.zeit_is_admin()
  );

DROP POLICY IF EXISTS absences_delete_own_pending_or_admin ON public.absences;
CREATE POLICY absences_delete_own_pending_or_admin ON public.absences
  FOR DELETE USING (
    (user_id = auth.uid() AND status = 'pending')
    OR public.zeit_is_admin()
  );
