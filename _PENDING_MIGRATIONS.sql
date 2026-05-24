-- BUNDLED PENDING MIGRATIONS — ausfuehren im Supabase SQL-Editor
-- Provisions-/Auszahlungs-Modul: 065, 066, 067, 068


-- ===========================================
-- 065_profiles_wage.sql
-- ===========================================
-- 065: profiles um Stundenlohn-Felder fuer das Provisions-/Auszahlungs-Modul erweitern.
-- Nicht-destruktiv, additive Felder.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_wage_cents integer
    CHECK (hourly_wage_cents IS NULL OR hourly_wage_cents >= 0);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wage_currency text DEFAULT 'EUR'
    CHECK (wage_currency IS NULL OR char_length(wage_currency) = 3);

-- ===========================================
-- 066_commission_rules.sql
-- ===========================================
-- 066: commission_rules — Admin-konfigurierbare Provisions-Regeln.
-- Eine Regel knuepft an einen custom_lead_status: wird der Status erreicht,
-- bekommt der zustaendige Mitarbeiter (leads.assigned_to, siehe 067) den Betrag.

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_status_id text NOT NULL REFERENCES public.custom_lead_statuses(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (char_length(currency) = 3),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','role','user')),
  scope_role text CHECK (scope_role IS NULL OR scope_role IN ('admin','sales','viewer','employee')),
  scope_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_rules_scope_consistency CHECK (
    (scope = 'all' AND scope_role IS NULL AND scope_user_id IS NULL) OR
    (scope = 'role' AND scope_role IS NOT NULL AND scope_user_id IS NULL) OR
    (scope = 'user' AND scope_user_id IS NOT NULL AND scope_role IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS commission_rules_status_idx
  ON public.commission_rules(trigger_status_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS commission_rules_scope_user_idx
  ON public.commission_rules(scope_user_id) WHERE scope_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.commission_rules_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS commission_rules_set_updated_at ON public.commission_rules;
CREATE TRIGGER commission_rules_set_updated_at
  BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.commission_rules_touch();

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

-- Lesen: alle authentifizierten User. Mitarbeiter sollen sehen koennen, wofuer
-- sie Provision bekommen koennen (Transparenz).
DROP POLICY IF EXISTS commission_rules_select_all ON public.commission_rules;
CREATE POLICY commission_rules_select_all ON public.commission_rules
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Schreiben: nur Admins.
DROP POLICY IF EXISTS commission_rules_insert_admin ON public.commission_rules;
CREATE POLICY commission_rules_insert_admin ON public.commission_rules
  FOR INSERT WITH CHECK (public.zeit_is_admin());

DROP POLICY IF EXISTS commission_rules_update_admin ON public.commission_rules;
CREATE POLICY commission_rules_update_admin ON public.commission_rules
  FOR UPDATE USING (public.zeit_is_admin());

DROP POLICY IF EXISTS commission_rules_delete_admin ON public.commission_rules;
CREATE POLICY commission_rules_delete_admin ON public.commission_rules
  FOR DELETE USING (public.zeit_is_admin());

-- ===========================================
-- 067_leads_assigned_to.sql
-- ===========================================
-- 067: leads.assigned_to — Wer ist fuer einen Lead zustaendig?
-- Wird vom Provisions-System gelesen (066/068): erreicht der Lead einen
-- Trigger-Status, bekommt der assigned_to-User die Provision.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_assigned_to_idx
  ON public.leads(assigned_to) WHERE assigned_to IS NOT NULL;

-- ===========================================
-- 068_commission_events.sql
-- ===========================================
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

-- ===========================================
-- 075_section_permissions.sql (NACHTRAG)
-- ===========================================
-- 075: Sektion-Berechtigungen pro User. Admins haben immer Zugriff (Override im Code).
-- Defaults setzen sich nach bestehender role: admin/sales/viewer → vertrieb+fulfillment, employee → zeit.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_vertrieb boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_fulfillment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_zeit boolean NOT NULL DEFAULT true;

-- Defaults: Mitarbeiter (role='employee') nur Zeit. Bestehende Admins/Sales bleiben auf alles.
UPDATE public.profiles
  SET can_vertrieb = false, can_fulfillment = false
  WHERE role = 'employee'
    AND can_vertrieb = true AND can_fulfillment = true;
