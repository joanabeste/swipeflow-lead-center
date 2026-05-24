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
