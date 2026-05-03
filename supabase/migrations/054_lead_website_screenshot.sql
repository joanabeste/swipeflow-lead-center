-- Screenshot der Lead-Website (für visuelle Webdesign-Analyse via Vision-LLM
-- und Anzeige in der Lead-Detailseite). Speicherort ist Supabase Storage,
-- in der Tabelle hinterlegen wir nur den Pfad — Auslieferung läuft über
-- signed URLs, die vom Server bei Bedarf generiert werden.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS website_screenshot_path text,
  ADD COLUMN IF NOT EXISTS website_screenshot_taken_at timestamptz;

-- Toggle in der Webdesign-Scoring-Konfiguration: Visuelle Analyse via Screenshot
-- statt textbasierter HTML-Analyse. Default false → opt-in pro Mode.
ALTER TABLE webdev_scoring_config
  ADD COLUMN IF NOT EXISTS screenshot_visual_analysis boolean NOT NULL DEFAULT false;

-- Storage-Bucket anlegen — privat, Auslieferung nur über signed URLs.
-- file_size_limit: 5 MB reicht für 1280×800 JPEG quality 80 (~150 KB) mit Reserve.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-screenshots',
  'website-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Schreib- und Löschzugriff: nur Service-Role (Server-Side Enrichment-Pipeline).
-- Lesezugriff: nur authenticated User der App, weil signed URLs sowieso über
-- den Server generiert werden. Die Policies sind permissiv für authenticated,
-- weil das Auslieferungs-Pattern signed URLs nutzt — nicht direkten Object-Read.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'website_screenshots_authenticated_read'
  ) THEN
    CREATE POLICY website_screenshots_authenticated_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'website-screenshots');
  END IF;
END
$$;
