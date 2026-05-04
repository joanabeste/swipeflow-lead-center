-- Rename: leads.domain → leads.website. Reine Identifier-Umbenennung,
-- der Inhalt bleibt identisch (nackte Domain wie "fahrschule-pagel.de").
-- "website" ist user-facing aussagekräftiger als "domain" — die UI-Labels
-- nutzen ohnehin schon "Website".

ALTER TABLE leads RENAME COLUMN domain TO website;

-- Indizes mit "domain" im Namen mit umbenennen, falls vorhanden.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'leads_domain_idx') THEN
    ALTER INDEX leads_domain_idx RENAME TO leads_website_idx;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_leads_domain') THEN
    ALTER INDEX idx_leads_domain RENAME TO idx_leads_website;
  END IF;
END $$;
