-- Konsolidierung: `domain` wird Single Source of Truth für die Web-Adresse.
-- `website` wird entfernt, weil es in 95 % redundant zu `domain` ist und mit
-- `career_page_url` ein dediziertes Feld für Subpages existiert.

-- 1. Karriere-Subpages aus `website` retten (Altdaten, bevor career_page_url
--    eingeführt wurde). Nur dort wo der Pfad eindeutig nach Karriere/Jobs
--    aussieht — andere Subpages werden bewusst verworfen, da sie für Lead-
--    Bewertung keinen Mehrwert haben.
UPDATE leads
SET career_page_url = website
WHERE website ~* '^https?://[^/]+/.+(karriere|karrier|jobs?|stellen|stellenangebot|career|recruiting|bewerb|wir-suchen|offene-stellen)'
  AND career_page_url IS NULL;

-- 2. domain aus website extrahieren, wo domain noch leer ist.
--    Lower-case Hostname, Schema und www. abschneiden, alles ab erstem `/` weg.
UPDATE leads
SET domain = lower(regexp_replace(
       regexp_replace(website, '^https?://(www\.)?', ''),
       '/.*$', ''))
WHERE domain IS NULL AND website IS NOT NULL;

-- 3. Spalte `website` ersatzlos entfernen.
ALTER TABLE leads DROP COLUMN IF EXISTS website;
