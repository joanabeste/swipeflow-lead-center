-- Datei-Anhänge an Lead-Notizen (Screenshots, PDFs, Office-Dokumente).
-- Notiz hat 0..N Anhänge; ON DELETE CASCADE saeubert die DB-Zeilen automatisch.
-- Storage-Objekte muessen die App-Action zusaetzlich entfernen (siehe lib/notes/attachments.ts).

CREATE TABLE IF NOT EXISTS lead_note_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id       uuid NOT NULL REFERENCES lead_notes(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES leads(id)       ON DELETE CASCADE,
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_note_attachments_note_id_idx ON lead_note_attachments(note_id);
CREATE INDEX IF NOT EXISTS lead_note_attachments_lead_id_idx ON lead_note_attachments(lead_id);

ALTER TABLE lead_note_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lead_note_attachments'
      AND policyname = 'note_attachments_authenticated_all'
  ) THEN
    CREATE POLICY note_attachments_authenticated_all
      ON lead_note_attachments
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Storage-Bucket: privat, signed URLs zur Auslieferung. 25 MB pro Datei.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-note-attachments',
  'lead-note-attachments',
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
      AND policyname = 'lead_note_attachments_authenticated_read'
  ) THEN
    CREATE POLICY lead_note_attachments_authenticated_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'lead-note-attachments');
  END IF;
END
$$;
