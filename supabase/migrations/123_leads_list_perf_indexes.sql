-- 123: Performance-Indizes für die Lead-Listen (Neue Leads + CRM).
--
-- Die Listen sortieren standardmäßig nach updated_at DESC und filtern nach
-- status / crm_status_id. Ohne passende Indizes führt das bei jeder Liste zu
-- Seq-Scan + Sort über die gesamte (wachsende) Tabelle. Alle Indizes sind
-- partiell auf deleted_at IS NULL — exakt der Scope, den die Queries nutzen
-- (.is("deleted_at", null)).
--
-- Idempotent (IF NOT EXISTS) → Zero-Downtime, gefahrlos mehrfach ausführbar.

-- Default-Sortierung der Liste: ORDER BY updated_at DESC.
CREATE INDEX IF NOT EXISTS leads_updated_at_desc_idx
  ON leads (updated_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- Status-Filter ("imported"/"qualified"/… ) auf "Neue Leads" und CRM-Scope.
CREATE INDEX IF NOT EXISTS leads_status_idx
  ON leads (status)
  WHERE deleted_at IS NULL;

-- CRM-Status-Filter (Pipeline-Spalte) + Ausblenden archivierter Status.
CREATE INDEX IF NOT EXISTS leads_crm_status_id_idx
  ON leads (crm_status_id)
  WHERE deleted_at IS NULL;
