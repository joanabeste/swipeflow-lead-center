-- 121: Lead-Links/Profile — beliebig viele zusätzliche URLs pro Lead.
--
-- Ein Lead hat nur EIN `website`-Feld. Diese Tabelle hält weitere Webseiten und
-- Social-Profile (Facebook, Instagram, LinkedIn, …). Bewusst getrennt von
-- leads.website, damit Social-/Verzeichnis-Domains das Domain-Dedup nicht
-- verfälschen. FK auf leads(id) → wird beim Zusammenführen via merge_lead (118)
-- automatisch auf den behaltenen Lead umgehängt.

CREATE TABLE IF NOT EXISTS public.lead_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- facebook|instagram|linkedin|xing|youtube|tiktok|twitter|google_maps|directory|website|other
  type        text NOT NULL DEFAULT 'website',
  url         text NOT NULL,
  label       text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Dieselbe URL nicht doppelt pro Lead (idempotenter Upsert via API/Frontend).
  UNIQUE (lead_id, url)
);

CREATE INDEX IF NOT EXISTS lead_links_lead_id_idx ON public.lead_links(lead_id);

ALTER TABLE public.lead_links ENABLE ROW LEVEL SECURITY;

-- Lesen für eingeloggte Nutzer; Schreibzugriff läuft über den Service-Client
-- (Server-Actions / API), der RLS umgeht — analog zu 119.
DROP POLICY IF EXISTS "lead_links_read_all" ON public.lead_links;
CREATE POLICY "lead_links_read_all" ON public.lead_links
  FOR SELECT TO authenticated USING (true);
