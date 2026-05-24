-- 073: projects — Ein Kunde kann mehrere Projekte haben. Schlanker 4-State-Lifecycle.

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('onboarding', 'active', 'paused', 'completed')),
  vertical text CHECK (vertical IN ('webdesign', 'recruiting') OR vertical IS NULL),
  clickup_list_id text,
  started_at date,
  completed_at date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_lead_idx ON public.projects(lead_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects(status);

CREATE OR REPLACE FUNCTION public.projects_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_touch();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS projects_write ON public.projects;
CREATE POLICY projects_write ON public.projects
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Zeit-Entries optional an Projekt haengen (Migration 063 ergaenzen).
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS time_entries_project_idx ON public.time_entries(project_id);
