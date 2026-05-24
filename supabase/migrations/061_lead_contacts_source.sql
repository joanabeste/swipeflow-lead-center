-- Quellen-Markierung fuer lead_contacts, analog zu lead_job_postings.source.
-- Behebt Datenverlust beim Re-Enrich: bisher loescht enrich-lead.ts ALLE
-- Kontakte eines Leads, auch manuell hinzugefuegte und BA-importierte.

ALTER TABLE lead_contacts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('enrichment', 'manual', 'ba_import', 'csv_import'));

-- Backfill: bestehende Kontakte mit source_url sind nahezu sicher vom Enrichment
-- (manuelle Eintraege via UI haben source_url=NULL, siehe addContact in crm/actions.ts).
UPDATE lead_contacts
SET source = 'enrichment'
WHERE source_url IS NOT NULL
  AND source = 'manual';

CREATE INDEX IF NOT EXISTS lead_contacts_lead_source_idx
  ON lead_contacts (lead_id, source);
