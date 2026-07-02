-- 134: Bereich (vertical) direkt am Deal.
-- Bisher trug nur `leads.vertical` den Bereich — Deals ohne (oder mit
-- bereichslosem) Lead fielen im Sales-Report in „Nicht zugeordnet". Mit einer
-- eigenen Spalte lässt sich der Bereich pro Deal explizit setzen
-- (Recruiting / Webdesign / Sonstiges) und die „nach Bereich"-Aufteilung wird
-- genauer. Werte identisch zu leads.vertical (Migration 076).

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS vertical text;

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_vertical_check;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_vertical_check
  CHECK (vertical IS NULL OR vertical IN ('webdesign', 'recruiting', 'sonstiges'));
