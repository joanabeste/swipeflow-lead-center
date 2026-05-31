-- 108: KI-Ampel-Bewertung für Webdesign-Leads (grün/orange/rot).
--
-- Semantik bewusst INVERTIERT — bewertet die Lead-ATTRAKTIVITÄT für Webdesign,
-- NICHT die Website-Qualität:
--   green = heißer Lead (Website sehr alt / muss neu — ODER aktive Firma ganz ohne Website)
--   amber = Mittelding (unsicher / Website okay)
--   red   = uninteressant (Website top → kein Bedarf — ODER Firma liquidiert/inaktiv)
--
-- Reine Kennzeichnung: KEIN Status-Wechsel, kein Auto-Aussortieren.
-- traffic_light_score ist INVERTIERT (grün hoch, rot niedrig) und dient der
-- Sortierung „nach Ampelfarbe" (ORDER BY traffic_light_score DESC = grün→orange→rot).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS traffic_light_rating   text
    CHECK (traffic_light_rating IS NULL OR traffic_light_rating IN ('green','amber','red')),
  ADD COLUMN IF NOT EXISTS traffic_light_score    integer,
  ADD COLUMN IF NOT EXISTS traffic_light_reason   text,
  ADD COLUMN IF NOT EXISTS traffic_light_rated_at timestamptz,
  ADD COLUMN IF NOT EXISTS traffic_light_source   text
    CHECK (traffic_light_source IS NULL OR traffic_light_source IN ('ai','manual','api'));

-- Score-Bereich absichern (separate ADD CONSTRAINT, da ADD COLUMN IF NOT EXISTS
-- keinen benannten Range-Check erlaubt). Idempotent via DO-Block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_traffic_light_score_range'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_traffic_light_score_range
      CHECK (traffic_light_score IS NULL OR (traffic_light_score >= 0 AND traffic_light_score <= 100));
  END IF;
END $$;

-- Filter-/Sort-Index, sparsam auf Webdesign-Leads mit gesetzter Ampel.
CREATE INDEX IF NOT EXISTS leads_traffic_light_rating_idx
  ON leads (traffic_light_rating)
  WHERE vertical = 'webdesign' AND traffic_light_rating IS NOT NULL;
