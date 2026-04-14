-- Standard-Anreicherungskriterien pro Service-Modus
-- Admin kann pro Modus (recruiting/webdev) festlegen, was defaultmäßig angereichert wird

CREATE TABLE IF NOT EXISTS enrichment_defaults (
  service_mode text PRIMARY KEY CHECK (service_mode IN ('recruiting', 'webdev')),
  config jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Seed mit den bisherigen hardcoded Defaults
INSERT INTO enrichment_defaults (service_mode, config) VALUES
  ('recruiting', '{"contacts_management":true,"contacts_all":false,"job_postings":true,"career_page":true,"company_details":true}'::jsonb),
  ('webdev',     '{"contacts_management":true,"contacts_all":false,"job_postings":false,"career_page":false,"company_details":true}'::jsonb)
ON CONFLICT (service_mode) DO NOTHING;

-- RLS: Alle Authentifizierten lesen, nur Admin schreiben
ALTER TABLE enrichment_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enrichment_defaults_read_all" ON enrichment_defaults;
CREATE POLICY "enrichment_defaults_read_all" ON enrichment_defaults
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "enrichment_defaults_admin_write" ON enrichment_defaults;
CREATE POLICY "enrichment_defaults_admin_write" ON enrichment_defaults
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
