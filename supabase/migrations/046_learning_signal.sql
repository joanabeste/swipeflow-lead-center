-- Pro CRM-Status festlegen, ob er als Trainingssignal in die KI-Scoring-Review einfliesst.
-- 'positive' = Lead war relevant, 'negative' = Lead war nicht passend, NULL = ignorieren.

ALTER TABLE custom_lead_statuses
  ADD COLUMN IF NOT EXISTS learning_signal text
  CHECK (learning_signal IN ('positive','negative') OR learning_signal IS NULL);

CREATE INDEX IF NOT EXISTS custom_lead_statuses_learning_signal_idx
  ON custom_lead_statuses(learning_signal)
  WHERE learning_signal IS NOT NULL;

-- Sinnvolle Defaults seeden (Slug-IDs, falls vorhanden).
UPDATE custom_lead_statuses
  SET learning_signal = 'positive'
  WHERE id IN ('recruiting-todo', 'webdesign-todo')
    AND learning_signal IS NULL;
