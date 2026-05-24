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
