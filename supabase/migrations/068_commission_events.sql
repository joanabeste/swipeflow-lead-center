-- 068: commission_events — Append-only Ledger der tatsaechlich verdienten Provisionen.
-- Pro (Regel, Lead) genau ein Eintrag (UNIQUE) — verhindert Doppelauszahlung bei
-- Status-Toggle (z.B. zurueck und wieder vor).

CREATE TABLE IF NOT EXISTS public.commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.commission_rules(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (char_length(currency) = 3),
  trigger_status_id text REFERENCES public.custom_lead_statuses(id) ON DELETE SET NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_events_unique_rule_lead UNIQUE (rule_id, lead_id)
);

CREATE INDEX IF NOT EXISTS commission_events_user_earned_idx
  ON public.commission_events(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS commission_events_lead_idx
  ON public.commission_events(lead_id);

ALTER TABLE public.commission_events ENABLE ROW LEVEL SECURITY;

-- Lesen: eigene Events sehen, Admin sieht alle.
DROP POLICY IF EXISTS commission_events_select_own_or_admin ON public.commission_events;
CREATE POLICY commission_events_select_own_or_admin ON public.commission_events
  FOR SELECT USING (user_id = auth.uid() OR public.zeit_is_admin());

-- Schreiben: Service-Role (Server Action mit createServiceClient) umgeht RLS;
-- normale User haben hier explizit keinen INSERT/UPDATE/DELETE-Path.
-- Optional Admin-Korrekturen ueber UI moeglich.
DROP POLICY IF EXISTS commission_events_update_admin ON public.commission_events;
CREATE POLICY commission_events_update_admin ON public.commission_events
  FOR UPDATE USING (public.zeit_is_admin());

DROP POLICY IF EXISTS commission_events_delete_admin ON public.commission_events;
CREATE POLICY commission_events_delete_admin ON public.commission_events
  FOR DELETE USING (public.zeit_is_admin());
