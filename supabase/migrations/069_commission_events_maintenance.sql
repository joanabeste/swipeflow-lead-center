-- 069: commission_events pflegbar machen (Admin-Wartung).
-- Ergaenzt Storno (reversibel), manuelle Eintraege (ohne Regel) und einen
-- Index fuer die Monats-Queries. Bestehende Daten bleiben unveraendert.

-- Storno: NULL = aktiv. voided_at gesetzt → zaehlt nicht mehr zur Auszahlung.
ALTER TABLE public.commission_events
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Manuelle Eintraege: vom Admin von Hand angelegt (Bonus / nicht automatisch
-- erfasst). Marker = rule_id IS NULL. created_by haelt den anlegenden Admin,
-- note die Begruendung/Beschreibung.
ALTER TABLE public.commission_events
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text;

-- rule_id nullable: manuelle Eintraege haben keine Regel. Die UNIQUE-Bedingung
-- (rule_id, lead_id) bleibt gueltig — NULLs gelten als verschieden, daher sind
-- mehrere manuelle Eintraege pro Lead moeglich.
ALTER TABLE public.commission_events
  ALTER COLUMN rule_id DROP NOT NULL;

-- Monats-Abfragen (Admin-Ledger + persoenliche Ansicht) filtern auf earned_at.
CREATE INDEX IF NOT EXISTS commission_events_earned_idx
  ON public.commission_events(earned_at DESC);

-- Aktive (nicht stornierte) Events je Nutzer schneller summieren.
CREATE INDEX IF NOT EXISTS commission_events_active_user_idx
  ON public.commission_events(user_id, earned_at DESC) WHERE voided_at IS NULL;
