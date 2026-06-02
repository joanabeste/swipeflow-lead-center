-- 115: Provenienz der Telefonnummer auf dem Lead.
--
-- Hintergrund: Beim Scrapen/Importieren landet teils eine falsche Nummer im CRM
-- (z.B. eine Privatnummer), waehrend die offizielle Firmennummer auf der Website
-- (Impressum) steht. Die Anreicherung darf die offizielle Nummer kuenftig
-- uebernehmen UND eine bestehende, gescrapte Nummer ersetzen -- aber eine von
-- Hand eingetragene/bestaetigte Nummer NIE automatisch ueberschreiben.
--
-- phone_source steuert genau das:
--   'import'     = aus CSV/Scrape-Import uebernommen        → ueberschreibbar
--   'enrichment' = von der KI aus Impressum/Kontakt gezogen → ueberschreibbar
--   'manual'     = im CRM von Hand eingegeben/editiert       → NIE auto-ueberschreiben
--   NULL         = unbekannt (Altbestand)                    → ueberschreibbar
--
-- Kein NOT NULL / Default: Altbestand bleibt NULL und damit ueberschreibbar
-- (Scope "nur ab jetzt", kein Backfill). Guard-Logik siehe lib/enrichment/enrich-lead.ts.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS phone_source text
    CHECK (phone_source IS NULL OR phone_source IN ('import', 'enrichment', 'manual'));
