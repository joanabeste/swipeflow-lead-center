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

-- Dubletten bereinigen BEVOR der Unique-Index angelegt wird
-- (Re-Enrichments ohne Dubletten-Schutz haben Duplikate erzeugt)
-- Regel: pro (lead_id, url) bleibt der älteste Eintrag, bevorzugt 'ba_import'
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id, url
      ORDER BY
        CASE source
          WHEN 'ba_import' THEN 0
          WHEN 'manual'   THEN 1
          ELSE 2
        END,
        created_at ASC
    ) AS rn
  FROM lead_job_postings
  WHERE url IS NOT NULL
)
DELETE FROM lead_job_postings
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Dublettenschutz: verhindert, dass die gleiche Stelle doppelt reingeschrieben wird
CREATE UNIQUE INDEX IF NOT EXISTS lead_job_postings_lead_url_uniq
  ON lead_job_postings (lead_id, url)
  WHERE url IS NOT NULL;
