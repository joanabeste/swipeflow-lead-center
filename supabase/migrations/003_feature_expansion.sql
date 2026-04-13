-- Lead Center: Feature-Expansion
-- Neue Import-Quellen, Enrichment-Config, Cancel-Rules, Spalten-Präferenzen

-- ============================================================
-- Ausschlussregeln (cancel_rules) — VOR leads-Änderung anlegen
-- ============================================================

CREATE TABLE public.cancel_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  category    text NOT NULL CHECK (category IN ('import', 'enrichment', 'both')),
  field       text NOT NULL,
  operator    text NOT NULL CHECK (operator IN (
    'equals', 'contains', 'starts_with', 'in_list',
    'greater_than', 'less_than', 'is_empty', 'is_not_empty'
  )),
  value       text NOT NULL DEFAULT '',
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cancel_rules_active ON public.cancel_rules (is_active) WHERE is_active = true;

-- ============================================================
-- Leads erweitern
-- ============================================================

-- Neue Spalten
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'csv',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancel_rule_id uuid REFERENCES public.cancel_rules(id);

-- Status-Constraint erweitern um 'cancelled'
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('imported', 'filtered', 'cancelled', 'enrichment_pending', 'enriched', 'qualified', 'exported'));

-- Source-Type-Constraint
ALTER TABLE public.leads ADD CONSTRAINT leads_source_type_check
  CHECK (source_type IN ('csv', 'url', 'directory'));

-- ============================================================
-- Import-Logs erweitern
-- ============================================================

ALTER TABLE public.import_logs
  ADD COLUMN IF NOT EXISTS import_type text NOT NULL DEFAULT 'csv',
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE public.import_logs ADD CONSTRAINT import_logs_type_check
  CHECK (import_type IN ('csv', 'url', 'directory'));

-- ============================================================
-- Enrichment-Config auf lead_enrichments
-- ============================================================

ALTER TABLE public.lead_enrichments
  ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}';

-- ============================================================
-- Spalten-Präferenzen auf profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lead_table_columns jsonb;

-- ============================================================
-- Row Level Security für cancel_rules
-- ============================================================

ALTER TABLE public.cancel_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cancel_rules_select" ON public.cancel_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cancel_rules_insert" ON public.cancel_rules
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));

CREATE POLICY "cancel_rules_update" ON public.cancel_rules
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'sales'));

CREATE POLICY "cancel_rules_delete" ON public.cancel_rules
  FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'sales'));

-- ============================================================
-- Profiles: Update-Policy erweitern (User darf eigene Spalten-Prefs setzen)
-- ============================================================

CREATE POLICY "profiles_update_own_prefs" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
