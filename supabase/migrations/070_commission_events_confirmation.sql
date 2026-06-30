-- 070: Provisionen bestaetigen. Auto-gebuchte Provisionen sind zunaechst nur
-- "voraussichtlich"; der Admin bestaetigt sie (z.B. wenn der Termin stattfand).
-- Status-Logik: voided_at gesetzt → Storniert; sonst confirmed_at gesetzt →
-- Bestaetigt; sonst → Voraussichtlich.

ALTER TABLE public.commission_events
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Manuell angelegte Eintraege (ohne Regel) gelten als sofort bestaetigt —
-- Bestand entsprechend nachziehen (nur nicht stornierte, noch unbestaetigte).
UPDATE public.commission_events
  SET confirmed_at = earned_at
  WHERE rule_id IS NULL
    AND voided_at IS NULL
    AND confirmed_at IS NULL;

-- Bestaetigte, aktive Provisionen je Nutzer schneller summieren.
CREATE INDEX IF NOT EXISTS commission_events_confirmed_user_idx
  ON public.commission_events(user_id, earned_at DESC)
  WHERE voided_at IS NULL AND confirmed_at IS NOT NULL;
