-- BUNDLED PENDING MIGRATIONS — ausfuehren im Supabase SQL-Editor
-- Aktuell: 080 deal_link · 081 project_notes · 082 attachments · 083 notifications · 084 mail<->project


-- ===========================================
-- 080_projects_deal_link.sql
-- ===========================================
-- 080: projects.deal_id — Rückverlinkung Projekt ↔ Deal.
-- Wird beim Auto-Anlegen eines Projekts aus einem gewonnenen Deal gesetzt.
-- Verhindert Doppel-Anlage und erlaubt Navigation zwischen Pipeline und Fulfillment.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_deal_idx ON public.projects(deal_id);


-- ===========================================
-- 081_project_notes.sql
-- ===========================================
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


-- ===========================================
-- 082_project_note_attachments.sql
-- ===========================================
-- 082: Datei-Anhaenge fuer project_notes. Spiegelt 059_lead_note_attachments,
-- nur mit project_id statt lead_id und eigenem Storage-Bucket.

CREATE TABLE IF NOT EXISTS public.project_note_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id       uuid NOT NULL REFERENCES public.project_notes(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id)       ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_note_attachments_note_id_idx ON public.project_note_attachments(note_id);
CREATE INDEX IF NOT EXISTS project_note_attachments_project_id_idx ON public.project_note_attachments(project_id);

ALTER TABLE public.project_note_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_note_attachments'
      AND policyname = 'project_note_attachments_authenticated_all'
  ) THEN
    CREATE POLICY project_note_attachments_authenticated_all
      ON public.project_note_attachments
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Storage-Bucket: privat, signed URLs zur Auslieferung. 25 MB pro Datei.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-note-attachments',
  'project-note-attachments',
  false,
  26214400,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'project_note_attachments_authenticated_read'
  ) THEN
    CREATE POLICY project_note_attachments_authenticated_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'project-note-attachments');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'project_note_attachments_service_write'
  ) THEN
    CREATE POLICY project_note_attachments_service_write
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'project-note-attachments');
  END IF;
END
$$;


-- ===========================================
-- 083_notifications.sql
-- ===========================================
-- 083: notifications — In-App-Benachrichtigungen fuer Mentions & Co.
-- type beschreibt, woher die Notification kommt (z.B. 'project_note_mention').
-- entity_type/entity_id verlinkt das Ziel-Objekt fuer Click-through.

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  entity_type text,
  entity_id   uuid,
  link        text,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_all_idx
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Eigene Benachrichtigungen lesen + als gelesen markieren.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Inserts laufen ausschliesslich serverseitig via Service-Role (kein Client-Insert).


-- ===========================================
-- 084_email_threads_project_link.sql
-- ===========================================
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_threads_project_idx
  ON public.email_threads(project_id, last_message_at DESC)
  WHERE project_id IS NOT NULL;
