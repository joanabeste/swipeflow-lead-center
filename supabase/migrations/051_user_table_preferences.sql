-- Pro-User-Tabellen-Layout: Reihenfolge, Breite und Sichtbarkeit der Spalten
-- in /leads und /crm. Bisher wurde nur Sichtbarkeit (als string[]) in
-- profiles.lead_table_columns gespeichert, ohne Reorder/Resize und ohne
-- Pendant fuer /crm. Diese Tabelle vereinheitlicht das.

CREATE TABLE IF NOT EXISTS user_table_preferences (
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  table_key  text NOT NULL CHECK (table_key IN ('leads', 'crm')),
  columns    jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, table_key)
);

ALTER TABLE user_table_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_table_prefs_own_select" ON user_table_preferences;
CREATE POLICY "user_table_prefs_own_select" ON user_table_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_table_prefs_own_write" ON user_table_preferences;
CREATE POLICY "user_table_prefs_own_write" ON user_table_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Bestehende Sichtbarkeits-Prefs aus profiles.lead_table_columns
-- (string[]-Array) als initiale columns-Eintraege fuer table_key='leads'
-- uebernehmen. Idempotent: bestehende Zeilen werden nicht ueberschrieben.
INSERT INTO user_table_preferences (user_id, table_key, columns)
SELECT
  id,
  'leads',
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('key', value))
      FROM jsonb_array_elements_text(lead_table_columns)
    ),
    '[]'::jsonb
  )
FROM profiles
WHERE lead_table_columns IS NOT NULL
ON CONFLICT (user_id, table_key) DO NOTHING;
