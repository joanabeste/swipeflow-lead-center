-- 080: project_notes — freitext Notizen pro Projekt, mehrere pro Projekt erlaubt.
-- Parallel zu lead_notes. Anhaenge spaeter (eigene Migration), falls noetig.

CREATE TABLE IF NOT EXISTS public.project_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_notes_project_idx
  ON public.project_notes(project_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.project_notes_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS project_notes_set_updated_at ON public.project_notes;
CREATE TRIGGER project_notes_set_updated_at
  BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.project_notes_touch();

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

-- Authenticated Lesen — Team-weit sichtbar (analog email_threads).
DROP POLICY IF EXISTS project_notes_select_auth ON public.project_notes;
CREATE POLICY project_notes_select_auth ON public.project_notes
  FOR SELECT TO authenticated USING (true);

-- Insert/Update/Delete nur fuer den Ersteller oder Admin.
DROP POLICY IF EXISTS project_notes_insert_auth ON public.project_notes;
CREATE POLICY project_notes_insert_auth ON public.project_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS project_notes_update_own_or_admin ON public.project_notes;
CREATE POLICY project_notes_update_own_or_admin ON public.project_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS project_notes_delete_own_or_admin ON public.project_notes;
CREATE POLICY project_notes_delete_own_or_admin ON public.project_notes
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
