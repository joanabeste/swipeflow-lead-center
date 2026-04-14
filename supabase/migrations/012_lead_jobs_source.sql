-- Herkunft der Stellen: BA-Import, Enrichment (KI) oder Manuell

ALTER TABLE lead_job_postings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'enrichment'
    CHECK (source IN ('ba_import', 'enrichment', 'manual'));

-- Bestehende BA-Import-Jobs nachträglich markieren
-- Heuristik: Leads, die eine career_page_url haben und als CSV importiert wurden,
-- haben ihre initialen Jobs aus dem BA-Import erhalten.
UPDATE lead_job_postings jp
SET source = 'ba_import'
FROM leads l
WHERE jp.lead_id = l.id
  AND l.source_type = 'csv'
  AND l.career_page_url IS NOT NULL
  AND jp.source = 'enrichment';

-- Dublettenschutz: verhindert, dass die gleiche Stelle doppelt reingeschrieben wird
CREATE UNIQUE INDEX IF NOT EXISTS lead_job_postings_lead_url_uniq
  ON lead_job_postings (lead_id, url)
  WHERE url IS NOT NULL;
