-- Eigenes Feld für Karriere-Seiten-URL, damit lead.website sauber die Firmen-Homepage bleibt

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS career_page_url text;

-- Bereinigung bestehender Leads: wenn website eine Karriere-Unterseite ist,
-- verschiebe sie ins neue Feld und setze website auf die Homepage
UPDATE leads
SET
  career_page_url = website,
  website = regexp_replace(website, '^(https?://[^/?#]+).*$', '\1')
WHERE
  website IS NOT NULL
  AND career_page_url IS NULL
  AND website ~* '/(karriere|jobs|stellen|karriereseite|karriere-portal|career|careers)(/|$|\?|#)';
