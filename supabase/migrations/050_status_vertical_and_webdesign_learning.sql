-- Vertikale am CRM-Status: erlaubt eindeutige Zuordnung "dieser Status gehoert
-- zur Recruiting- bzw. Webdesign-Auswertung". NULL = vertikal-agnostisch.
-- Haertet die KI-Trainings-Selektion in lib/learning/scoring-reviewer.ts:
-- bisher wurde learning_signal vertikal-uebergreifend gelesen, ab jetzt
-- per vertical gefiltert (mit NULL als Fallback).

ALTER TABLE custom_lead_statuses
  ADD COLUMN IF NOT EXISTS vertical text
  CHECK (vertical IN ('webdesign', 'recruiting'));

CREATE INDEX IF NOT EXISTS custom_lead_statuses_vertical_signal_idx
  ON custom_lead_statuses(vertical, learning_signal)
  WHERE learning_signal IS NOT NULL;

-- Standard-Status den passenden Vertikalen zuordnen.
UPDATE custom_lead_statuses
  SET vertical = 'recruiting'
  WHERE id IN (
    'recruiting-todo',
    'recruiting-manuelle-ueberpruefung',
    'recruiting-passt-nicht'
  )
  AND vertical IS NULL;

UPDATE custom_lead_statuses
  SET vertical = 'webdesign'
  WHERE id IN (
    'webdesign-lead',
    'webdesign-todo',
    'webdesign-manuelle-ueberpruefung',
    'webdesign-passt-nicht'
  )
  AND vertical IS NULL;

-- Migration 046 hat learning_signal nur fuer 'webdesign-todo' gesetzt; in
-- der Praxis heisst der Webdesign-Eingangsstatus aber oft 'webdesign-lead'
-- (siehe Settings-Screenshot). Beide IDs idempotent abdecken — was nicht
-- existiert, wird einfach uebersprungen.
UPDATE custom_lead_statuses
  SET learning_signal = 'positive'
  WHERE id IN ('webdesign-lead', 'webdesign-todo')
    AND learning_signal IS NULL;
