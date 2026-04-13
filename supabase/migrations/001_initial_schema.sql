-- Lead Center: Initiales Datenbankschema
-- Alle Tabellen im public-Schema, Supabase Auth für Authentifizierung

-- ============================================================
-- Tabellen
-- ============================================================

-- Profiles (erweitert auth.users)
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  name        text NOT NULL,
  role        text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'sales', 'viewer')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Mapping-Templates
CREATE TABLE public.mapping_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  mapping     jsonb NOT NULL,
  delimiter   text DEFAULT ',',
  encoding    text DEFAULT 'utf-8',
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Import-Logs
CREATE TABLE public.import_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name            text NOT NULL,
  file_path            text NOT NULL DEFAULT '',
  row_count            integer NOT NULL DEFAULT 0,
  imported_count       integer NOT NULL DEFAULT 0,
  skipped_count        integer NOT NULL DEFAULT 0,
  duplicate_count      integer NOT NULL DEFAULT 0,
  error_count          integer NOT NULL DEFAULT 0,
  mapping_template_id  uuid REFERENCES public.mapping_templates(id),
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  errors               jsonb DEFAULT '[]',
  created_by           uuid REFERENCES public.profiles(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Leads (Kern-Tabelle)
CREATE TABLE public.leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status              text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'filtered', 'enrichment_pending', 'enriched', 'qualified', 'exported')),
  company_name        text NOT NULL,
  domain              text,
  phone               text,
  email               text,
  street              text,
  city                text,
  zip                 text,
  state               text,
  country             text DEFAULT 'Deutschland',
  industry            text,
  company_size        text,
  legal_form          text,
  register_id         text,
  website             text,
  description         text,
  hubspot_company_id  text,
  source_import_id    uuid REFERENCES public.import_logs(id),
  blacklist_hit       boolean NOT NULL DEFAULT false,
  blacklist_reason    text,
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_company_name ON public.leads (company_name);
CREATE INDEX idx_leads_domain ON public.leads (domain);
CREATE INDEX idx_leads_status ON public.leads (status);
CREATE INDEX idx_leads_source_import ON public.leads (source_import_id);
CREATE INDEX idx_leads_register_id ON public.leads (register_id);

-- Lead-Änderungshistorie
CREATE TABLE public.lead_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(id),
  field_name  text NOT NULL,
  old_value   text,
  new_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_changes_lead ON public.lead_changes (lead_id);

-- Blacklist-Einträge (manuell)
CREATE TABLE public.blacklist_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type  text NOT NULL CHECK (match_type IN ('name', 'domain', 'register_id')),
  match_value text NOT NULL,
  reason      text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_blacklist_entries_unique ON public.blacklist_entries (match_type, lower(match_value));

-- Blacklist-Regeln (automatisch)
CREATE TABLE public.blacklist_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  field       text NOT NULL,
  operator    text NOT NULL CHECK (operator IN ('equals', 'contains', 'starts_with', 'in_list')),
  value       text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Filter-Log
CREATE TABLE public.filter_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  rule_id             uuid REFERENCES public.blacklist_rules(id),
  blacklist_entry_id  uuid REFERENCES public.blacklist_entries(id),
  reason              text NOT NULL,
  overridden          boolean NOT NULL DEFAULT false,
  overridden_by       uuid REFERENCES public.profiles(id),
  overridden_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Export-Logs
CREATE TABLE public.export_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid NOT NULL REFERENCES public.leads(id),
  hubspot_company_id  text,
  status              text NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'duplicate')),
  error_message       text,
  response_data       jsonb,
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Pflichtfeld-Profile
CREATE TABLE public.required_field_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  required_fields jsonb NOT NULL,
  is_default      boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Audit-Logs
CREATE TABLE public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id),
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- ============================================================
-- Helper-Funktion für RLS (nach Tabellen-Erstellung)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filter_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.required_field_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin');
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- Leads
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'sales'));
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- Lead Changes
CREATE POLICY "lead_changes_select" ON public.lead_changes FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_changes_insert" ON public.lead_changes FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));

-- Blacklist Entries
CREATE POLICY "blacklist_entries_select" ON public.blacklist_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "blacklist_entries_write" ON public.blacklist_entries FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'sales'))
  WITH CHECK (get_user_role() IN ('admin', 'sales'));

-- Blacklist Rules
CREATE POLICY "blacklist_rules_select" ON public.blacklist_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "blacklist_rules_write" ON public.blacklist_rules FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'sales'))
  WITH CHECK (get_user_role() IN ('admin', 'sales'));

-- Filter Log
CREATE POLICY "filter_log_select" ON public.filter_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "filter_log_insert" ON public.filter_log FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));

-- Import Logs
CREATE POLICY "import_logs_select" ON public.import_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "import_logs_insert" ON public.import_logs FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));
CREATE POLICY "import_logs_update" ON public.import_logs FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'sales'));

-- Mapping Templates
CREATE POLICY "mapping_templates_select" ON public.mapping_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "mapping_templates_write" ON public.mapping_templates FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'sales'))
  WITH CHECK (get_user_role() IN ('admin', 'sales'));

-- Export Logs
CREATE POLICY "export_logs_select" ON public.export_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "export_logs_insert" ON public.export_logs FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));

-- Required Field Profiles
CREATE POLICY "field_profiles_select" ON public.required_field_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "field_profiles_write" ON public.required_field_profiles FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Audit Logs (read-only for authenticated, insert via service role)
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Storage Bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('csv-uploads', 'csv-uploads', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "csv_uploads_auth" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'csv-uploads')
  WITH CHECK (bucket_id = 'csv-uploads');
