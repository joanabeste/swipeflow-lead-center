-- 111: Projekt-Typen mit Feature-Set + Social als Projekt-Typ.
--
-- Bisher hatten Projekte nur `vertical`/`status` und alle dieselben festen Tabs.
-- Jetzt: admin-definierbare `project_types` (Label, Farbe, Icon, Feature-Set).
-- Jedes Projekt bekommt einen Typ; die Detailseite zeigt nur dessen Features.
-- Social Media wird ein Feature/Projekt-Typ: das Board hängt künftig an einem
-- Projekt (statt 1:1 am Lead). Bestehende Boards werden je in ein
-- „Social Media"-Projekt migriert.
--
-- WICHTIG: Migration 109 (Social) muss VOR dieser angewandt sein. Der Social-
-- Re-scope (Phase E) ist defensiv `IF EXISTS social_boards` geschützt, läuft also
-- auch durch, wenn 109 noch fehlt — dann aber OHNE Board-Umhängung.

-- ─── Phase A: project_types (admin-definierbar; spiegelt custom_lead_statuses) ──

CREATE TABLE IF NOT EXISTS public.project_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,            -- stabiler Key (Seed/Backfill)
  label         text NOT NULL,
  color         text NOT NULL DEFAULT '#6b7280',
  icon          text,                            -- lucide-Icon-Name (z.B. 'Globe')
  features      text[] NOT NULL DEFAULT '{}',    -- Teilmenge des Code-Katalogs
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_types_display_order_idx ON public.project_types(display_order);

-- updated_at-Trigger: bestehende generische Funktion aus 073 wiederverwenden.
DROP TRIGGER IF EXISTS project_types_set_updated_at ON public.project_types;
CREATE TRIGGER project_types_set_updated_at
  BEFORE UPDATE ON public.project_types
  FOR EACH ROW EXECUTE FUNCTION public.projects_touch();

ALTER TABLE public.project_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_types_select ON public.project_types;
CREATE POLICY project_types_select ON public.project_types
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS project_types_write ON public.project_types;
CREATE POLICY project_types_write ON public.project_types
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─── Phase B: Starter-Typen seeden (feste IDs, idempotent) ──────────────────

INSERT INTO public.project_types (id, slug, label, color, icon, features, display_order, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111','website','Website','#3b82f6','Globe',
     ARRAY['tasks','mails','notes'], 10, true),
  ('22222222-2222-2222-2222-222222222222','social-media','Social Media','#a855f7','Megaphone',
     ARRAY['social','notes','mails'], 20, true),
  ('33333333-3333-3333-3333-333333333333','recruiting','Recruiting','#10b981','Briefcase',
     ARRAY['tasks','mails','notes'], 30, true)
ON CONFLICT (id) DO NOTHING;

-- ─── Phase C: projects.project_type_id (nullable; Alt-Projekte bleiben gültig) ──

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type_id uuid REFERENCES public.project_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS projects_type_idx ON public.projects(project_type_id);

-- ─── Phase D: bestehende Projekte aus `vertical` auf einen Typ mappen ──────────

UPDATE public.projects SET project_type_id = '11111111-1111-1111-1111-111111111111'
  WHERE project_type_id IS NULL AND vertical = 'webdesign';
UPDATE public.projects SET project_type_id = '33333333-3333-3333-3333-333333333333'
  WHERE project_type_id IS NULL AND vertical = 'recruiting';
-- vertical = 'sonstiges'/NULL bleibt ohne Typ (Fallback: nur Übersicht).

-- ─── Phase E: Social-Board re-scope lead → project (nur falls 109 angewandt) ───

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'social_boards'
  ) THEN
    -- project_id ergänzen (zunächst nullable für Backfill).
    ALTER TABLE public.social_boards
      ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

    -- Je bestehendem Board ein „Social Media"-Projekt anlegen und direkt verlinken.
    -- CTE bindet jedes Board an SEIN eigenes neues Projekt (lead_id ist 1:1 dank
    -- alter UNIQUE(lead_id)-Bedingung).
    WITH new_proj AS (
      INSERT INTO public.projects (lead_id, name, status, project_type_id)
      SELECT b.lead_id, 'Social Media', 'active', '22222222-2222-2222-2222-222222222222'
      FROM public.social_boards b
      WHERE b.project_id IS NULL
      RETURNING id AS project_id, lead_id
    )
    UPDATE public.social_boards b
    SET project_id = np.project_id
    FROM new_proj np
    WHERE b.lead_id = np.lead_id AND b.project_id IS NULL;

    -- Eindeutigkeit umschwenken: lead_id 1:1 → project_id 1:1.
    ALTER TABLE public.social_boards DROP CONSTRAINT IF EXISTS social_boards_lead_id_key;
    ALTER TABLE public.social_boards ALTER COLUMN project_id SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_boards_project_id_key') THEN
      ALTER TABLE public.social_boards ADD CONSTRAINT social_boards_project_id_key UNIQUE (project_id);
    END IF;
    CREATE INDEX IF NOT EXISTS social_boards_project_idx ON public.social_boards(project_id);
    -- lead_id bleibt NOT NULL (denormalisiert) → Storage-Pfade {leadId}/… unverändert.
  END IF;
END $$;
