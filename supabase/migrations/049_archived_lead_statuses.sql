-- Aussortierte Leads: dauerhafte Archivierung ueber CRM-Status mit is_archived=true.
-- Lead bleibt in der DB (kein deleted_at), wird aber aus /leads und /crm ausgeblendet
-- und ist nur im Settings-Bereich „Aussortierte Leads" sichtbar. Liefert der KI ein
-- stabiles Negativ-Signal fuers Scoring-Training.

ALTER TABLE custom_lead_statuses
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS custom_lead_statuses_is_archived_idx
  ON custom_lead_statuses(is_archived)
  WHERE is_archived = true;

-- Seed der zwei „Passt nicht"-Status pro Vertikale.
-- learning_signal='negative' wird automatisch von loadStatusBuckets() in
-- lib/learning/scoring-reviewer.ts beruecksichtigt.
INSERT INTO custom_lead_statuses (id, label, color, description, display_order, is_active, is_archived, learning_signal)
VALUES
  ('recruiting-passt-nicht',
   'Recruiting – Passt nicht',
   '#ef4444',
   'Aussortierter Recruiting-Lead — wird nicht mehr in CRM oder Leads angezeigt, dient der KI als Negativ-Signal.',
   90, true, true, 'negative'),
  ('webdesign-passt-nicht',
   'Webdesign — Passt nicht',
   '#ef4444',
   'Aussortierter Webdesign-Lead — wird nicht mehr in CRM oder Leads angezeigt, dient der KI als Negativ-Signal.',
   91, true, true, 'negative')
ON CONFLICT (id) DO UPDATE
  SET is_archived = EXCLUDED.is_archived,
      learning_signal = EXCLUDED.learning_signal;
