-- Lead Center: Enrichment-Schema
-- Neue Tabellen für Kontakte, Stellenanzeigen und Anreicherungs-Log

-- ============================================================
-- Neue Spalten auf leads
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_source text;

-- ============================================================
-- Tabellen
-- ============================================================

-- Kontakte pro Lead (Ansprechpartner)
CREATE TABLE public.lead_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text,
  email       text,
  phone       text,
  source_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_contacts_lead ON public.lead_contacts (lead_id);

-- Offene Stellen pro Lead
CREATE TABLE public.lead_job_postings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title       text NOT NULL,
  url         text,
  location    text,
  posted_date text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_job_postings_lead ON public.lead_job_postings (lead_id);

-- Anreicherungs-Log (eine Zeile pro Enrichment-Versuch)
CREATE TABLE public.lead_enrichments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  source          text,
  career_page_url text,
  raw_response    jsonb,
  error_message   text,
  pages_fetched   jsonb,
  created_by      uuid REFERENCES public.profiles(id),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_enrichments_lead ON public.lead_enrichments (lead_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_enrichments ENABLE ROW LEVEL SECURITY;

-- Lead Contacts
CREATE POLICY "lead_contacts_select" ON public.lead_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_contacts_insert" ON public.lead_contacts
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));
CREATE POLICY "lead_contacts_delete" ON public.lead_contacts
  FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'sales'));

-- Lead Job Postings
CREATE POLICY "lead_job_postings_select" ON public.lead_job_postings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_job_postings_insert" ON public.lead_job_postings
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));
CREATE POLICY "lead_job_postings_delete" ON public.lead_job_postings
  FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'sales'));

-- Lead Enrichments
CREATE POLICY "lead_enrichments_select" ON public.lead_enrichments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_enrichments_insert" ON public.lead_enrichments
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'sales'));
CREATE POLICY "lead_enrichments_update" ON public.lead_enrichments
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'sales'));
