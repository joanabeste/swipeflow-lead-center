-- 074: ClickUp-Integration. Token-Speicherung (verschluesselt) + lokaler Task-Cache.

-- Token + Workspace-Mapping. config_encrypted ist AES-256-GCM, siehe lib/crypto.
CREATE TABLE IF NOT EXISTS public.app_integrations (
  provider text PRIMARY KEY,
  config_encrypted text,  -- Format aus lib/crypto/secrets.ts: iv.tag.cipher (base64)
  workspace_id text,
  workspace_name text,
  configured_by uuid REFERENCES auth.users(id),
  configured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_integrations_admin ON public.app_integrations;
CREATE POLICY app_integrations_admin ON public.app_integrations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Cache fuer ClickUp-Tasks pro Projekt. ClickUp bleibt source-of-truth.
CREATE TABLE IF NOT EXISTS public.clickup_tasks_cache (
  clickup_task_id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text,
  status_color text,
  assignees jsonb,
  due_date timestamptz,
  url text,
  closed boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb
);

CREATE INDEX IF NOT EXISTS clickup_tasks_project_idx ON public.clickup_tasks_cache(project_id);
CREATE INDEX IF NOT EXISTS clickup_tasks_open_idx
  ON public.clickup_tasks_cache(project_id) WHERE closed = false;

ALTER TABLE public.clickup_tasks_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clickup_tasks_cache_read ON public.clickup_tasks_cache;
CREATE POLICY clickup_tasks_cache_read ON public.clickup_tasks_cache
  FOR SELECT USING (auth.role() = 'authenticated');
-- Schreibend nur via Service-Role (Server-Actions) — keine direkten User-Writes.
