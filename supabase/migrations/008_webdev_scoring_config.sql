-- Konfigurierbare Webdesign-Bewertung
-- Einzelne Zeile (id=1) — Admin kann Strenge, Checks und Schwellwerte festlegen

CREATE TABLE IF NOT EXISTS webdev_scoring_config (
  id int PRIMARY KEY DEFAULT 1,
  strictness text NOT NULL DEFAULT 'normal' CHECK (strictness IN ('lax', 'normal', 'strict')),
  design_focus text,
  min_issues_to_qualify int NOT NULL DEFAULT 2,
  slow_load_threshold_ms int NOT NULL DEFAULT 3000,
  very_slow_load_threshold_ms int NOT NULL DEFAULT 5000,
  check_ssl boolean NOT NULL DEFAULT true,
  check_responsive boolean NOT NULL DEFAULT true,
  check_meta_tags boolean NOT NULL DEFAULT true,
  check_alt_tags boolean NOT NULL DEFAULT true,
  check_outdated_html boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Standard-Zeile anlegen
INSERT INTO webdev_scoring_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- RLS: Lesen alle auth, Schreiben nur Admin
ALTER TABLE webdev_scoring_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webdev_scoring_read_all" ON webdev_scoring_config;
CREATE POLICY "webdev_scoring_read_all" ON webdev_scoring_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "webdev_scoring_admin_write" ON webdev_scoring_config;
CREATE POLICY "webdev_scoring_admin_write" ON webdev_scoring_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
