-- BUNDLED PENDING MIGRATIONS — ausfuehren im Supabase SQL-Editor
-- Aktuell: 080-084 (Vorlauf) + 086 (clickup_folder_id)


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


-- ===========================================
-- 085_learning.sql
-- ===========================================
-- 085: Learning-Bereich (internes E-Learning, LearningSuite-Style).
-- 3-stufig: courses → modules → lessons. Plus Kategorien, Anhaenge und Fortschritt.

-- ─── Sektion-Permissions am Profile ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_learning      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_learning_edit boolean NOT NULL DEFAULT false;

-- Admins bekommen direkt beides — Override-Logik in lib/auth.ts existiert zwar,
-- aber so klappt's auch wenn jemand direkt RLS gegen die Tabelle laeuft.
UPDATE public.profiles SET can_learning = true, can_learning_edit = true
  WHERE role = 'admin';

-- Helfer: aktueller User darf editieren?
CREATE OR REPLACE FUNCTION public.is_learning_editor()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR can_learning_edit = true)
  );
$$;

-- Helfer: aktueller User darf zumindest lesen?
CREATE OR REPLACE FUNCTION public.is_learning_reader()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR can_learning = true OR can_learning_edit = true)
  );
$$;

-- ─── learning_categories ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_categories_sort_idx
  ON public.learning_categories(sort_order, name);

-- ─── learning_courses ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_courses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid REFERENCES public.learning_categories(id) ON DELETE SET NULL,
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  summary           text,
  cover_image_path  text,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sort_order        integer NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_courses_category_idx ON public.learning_courses(category_id);
CREATE INDEX IF NOT EXISTS learning_courses_status_idx   ON public.learning_courses(status);

-- ─── learning_modules ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_modules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  title      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_modules_course_idx
  ON public.learning_modules(course_id, sort_order);

-- ─── learning_lessons ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_lessons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         uuid NOT NULL REFERENCES public.learning_modules(id) ON DELETE CASCADE,
  title             text NOT NULL,
  sort_order        integer NOT NULL DEFAULT 0,
  content_html      text,
  video_url         text,
  video_provider    text CHECK (video_provider IN ('youtube','loom')),
  estimated_minutes integer,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- FTS-Spalte: Title + content_html mit german dict. HTML-Tags landen mit drin,
  -- sind fuer FTS aber harmlos (ts_vector tokenisiert sie weg).
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(content_html, '')), 'B')
  ) STORED
);

CREATE INDEX IF NOT EXISTS learning_lessons_module_idx
  ON public.learning_lessons(module_id, sort_order);
CREATE INDEX IF NOT EXISTS learning_lessons_search_idx
  ON public.learning_lessons USING GIN (search_tsv);

-- Touch-Trigger fuer updated_at
CREATE OR REPLACE FUNCTION public.learning_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS learning_categories_touch ON public.learning_categories;
CREATE TRIGGER learning_categories_touch BEFORE UPDATE ON public.learning_categories
  FOR EACH ROW EXECUTE FUNCTION public.learning_touch_updated_at();

DROP TRIGGER IF EXISTS learning_courses_touch ON public.learning_courses;
CREATE TRIGGER learning_courses_touch BEFORE UPDATE ON public.learning_courses
  FOR EACH ROW EXECUTE FUNCTION public.learning_touch_updated_at();

DROP TRIGGER IF EXISTS learning_modules_touch ON public.learning_modules;
CREATE TRIGGER learning_modules_touch BEFORE UPDATE ON public.learning_modules
  FOR EACH ROW EXECUTE FUNCTION public.learning_touch_updated_at();

DROP TRIGGER IF EXISTS learning_lessons_touch ON public.learning_lessons;
CREATE TRIGGER learning_lessons_touch BEFORE UPDATE ON public.learning_lessons
  FOR EACH ROW EXECUTE FUNCTION public.learning_touch_updated_at();

-- ─── learning_lesson_attachments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_lesson_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id    uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   integer NOT NULL,
  uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_lesson_attachments_lesson_idx
  ON public.learning_lesson_attachments(lesson_id);

-- ─── learning_lesson_progress ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_lesson_progress (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id    uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS learning_lesson_progress_user_idx
  ON public.learning_lesson_progress(user_id);

-- ─── RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.learning_categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_courses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_modules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lessons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lesson_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lesson_progress    ENABLE ROW LEVEL SECURITY;

-- READ: jeder mit can_learning ODER can_learning_edit ODER admin.
-- Kurse: Drafts nur fuer Editoren sichtbar.
DROP POLICY IF EXISTS learning_categories_select ON public.learning_categories;
CREATE POLICY learning_categories_select ON public.learning_categories
  FOR SELECT TO authenticated USING (public.is_learning_reader());

DROP POLICY IF EXISTS learning_courses_select ON public.learning_courses;
CREATE POLICY learning_courses_select ON public.learning_courses
  FOR SELECT TO authenticated
  USING (
    public.is_learning_reader()
    AND (status = 'published' OR public.is_learning_editor())
  );

DROP POLICY IF EXISTS learning_modules_select ON public.learning_modules;
CREATE POLICY learning_modules_select ON public.learning_modules
  FOR SELECT TO authenticated USING (public.is_learning_reader());

DROP POLICY IF EXISTS learning_lessons_select ON public.learning_lessons;
CREATE POLICY learning_lessons_select ON public.learning_lessons
  FOR SELECT TO authenticated USING (public.is_learning_reader());

DROP POLICY IF EXISTS learning_lesson_attachments_select ON public.learning_lesson_attachments;
CREATE POLICY learning_lesson_attachments_select ON public.learning_lesson_attachments
  FOR SELECT TO authenticated USING (public.is_learning_reader());

-- WRITE: nur Editoren (admin oder can_learning_edit).
DROP POLICY IF EXISTS learning_categories_write ON public.learning_categories;
CREATE POLICY learning_categories_write ON public.learning_categories
  FOR ALL TO authenticated
  USING (public.is_learning_editor()) WITH CHECK (public.is_learning_editor());

DROP POLICY IF EXISTS learning_courses_write ON public.learning_courses;
CREATE POLICY learning_courses_write ON public.learning_courses
  FOR ALL TO authenticated
  USING (public.is_learning_editor()) WITH CHECK (public.is_learning_editor());

DROP POLICY IF EXISTS learning_modules_write ON public.learning_modules;
CREATE POLICY learning_modules_write ON public.learning_modules
  FOR ALL TO authenticated
  USING (public.is_learning_editor()) WITH CHECK (public.is_learning_editor());

DROP POLICY IF EXISTS learning_lessons_write ON public.learning_lessons;
CREATE POLICY learning_lessons_write ON public.learning_lessons
  FOR ALL TO authenticated
  USING (public.is_learning_editor()) WITH CHECK (public.is_learning_editor());

DROP POLICY IF EXISTS learning_lesson_attachments_write ON public.learning_lesson_attachments;
CREATE POLICY learning_lesson_attachments_write ON public.learning_lesson_attachments
  FOR ALL TO authenticated
  USING (public.is_learning_editor()) WITH CHECK (public.is_learning_editor());

-- PROGRESS: jeder sieht/schreibt nur eigene Rows.
DROP POLICY IF EXISTS learning_progress_select_own ON public.learning_lesson_progress;
CREATE POLICY learning_progress_select_own ON public.learning_lesson_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS learning_progress_insert_own ON public.learning_lesson_progress;
CREATE POLICY learning_progress_insert_own ON public.learning_lesson_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS learning_progress_delete_own ON public.learning_lesson_progress;
CREATE POLICY learning_progress_delete_own ON public.learning_lesson_progress
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─── Storage-Buckets ─────────────────────────────────────────────
-- learning-attachments: privat, signed URLs. 25 MB pro Datei. Mime-Allowlist analog
-- project_note_attachments.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'learning-attachments',
  'learning-attachments',
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
    'application/vnd.ms-powerpoint',
    'video/mp4','video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- learning-covers: oeffentlich (Kurs-Cover-Bilder werden auf der Uebersicht angezeigt).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'learning-covers',
  'learning-covers',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='learning_attachments_read') THEN
    CREATE POLICY learning_attachments_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'learning-attachments' AND public.is_learning_reader());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='learning_attachments_write') THEN
    CREATE POLICY learning_attachments_write ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'learning-attachments' AND public.is_learning_editor());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='learning_attachments_delete') THEN
    CREATE POLICY learning_attachments_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'learning-attachments' AND public.is_learning_editor());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='learning_covers_write') THEN
    CREATE POLICY learning_covers_write ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'learning-covers' AND public.is_learning_editor());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='learning_covers_delete') THEN
    CREATE POLICY learning_covers_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'learning-covers' AND public.is_learning_editor());
  END IF;
END
$$;


-- ===========================================
-- 086_projects_clickup_folder.sql
-- ===========================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS clickup_folder_id text;
CREATE UNIQUE INDEX IF NOT EXISTS projects_clickup_folder_id_key
  ON public.projects (clickup_folder_id)
  WHERE clickup_folder_id IS NOT NULL;
