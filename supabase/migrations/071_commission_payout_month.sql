-- 071: Auszahlungsmonat. Beim Genehmigen wird die Provision dem aktuellen Monat
-- zugeordnet (payout_at), ohne das Termindatum (earned_at) zu verlieren.
-- attributed_at = COALESCE(payout_at, earned_at) ist die einzige Monats-Achse
-- (voraussichtlich → Termin-Monat; bestaetigt → Auszahlungsmonat).

ALTER TABLE public.commission_events
  ADD COLUMN IF NOT EXISTS payout_at timestamptz;

ALTER TABLE public.commission_events
  ADD COLUMN IF NOT EXISTS attributed_at timestamptz
  GENERATED ALWAYS AS (COALESCE(payout_at, earned_at)) STORED;

-- Invariante "bestaetigt ⟺ payout_at gesetzt" fuer Bestand herstellen.
-- attributed_at bleibt dabei = earned_at (Monat unveraendert).
UPDATE public.commission_events
  SET payout_at = earned_at
  WHERE confirmed_at IS NOT NULL AND payout_at IS NULL;

CREATE INDEX IF NOT EXISTS commission_events_attributed_idx
  ON public.commission_events(attributed_at DESC);

CREATE INDEX IF NOT EXISTS commission_events_attributed_user_idx
  ON public.commission_events(user_id, attributed_at DESC) WHERE voided_at IS NULL;
