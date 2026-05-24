-- 089: Storage-Bucket fuer E-Mail-Anhaenge. Binaer-Inhalte landen hier;
-- Metadaten + storage_path bleiben in email_thread_messages.attachments (jsonb).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-attachments',
  'email-attachments',
  false,
  26214400,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/zip',
    'application/octet-stream',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'email_attachments_authenticated_read'
  ) THEN
    CREATE POLICY email_attachments_authenticated_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'email-attachments');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'email_attachments_authenticated_write'
  ) THEN
    CREATE POLICY email_attachments_authenticated_write
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'email-attachments');
  END IF;
END
$$;
