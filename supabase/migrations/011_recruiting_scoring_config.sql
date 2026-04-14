-- Konfigurierbare Recruiting-Bewertung (single-row)

CREATE TABLE IF NOT EXISTS recruiting_scoring_config (
  id int PRIMARY KEY DEFAULT 1,
  min_job_postings_to_qualify int NOT NULL DEFAULT 1,
  require_hr_contact boolean NOT NULL DEFAULT false,
  require_contact_email boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO recruiting_scoring_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE recruiting_scoring_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recruiting_scoring_read_all" ON recruiting_scoring_config;
CREATE POLICY "recruiting_scoring_read_all" ON recruiting_scoring_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "recruiting_scoring_admin_write" ON recruiting_scoring_config;
CREATE POLICY "recruiting_scoring_admin_write" ON recruiting_scoring_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
