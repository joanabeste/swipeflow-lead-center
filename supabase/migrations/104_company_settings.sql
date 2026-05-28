-- 104: Firmen-/Gläubigerdaten editierbar machen.
--
-- Bisher steckten die SEPA-Gläubigerdaten (Name, Anschrift, Gläubiger-ID) nur in
-- Env-Vars (SEPA_CREDITOR_*) und ließen sich nur per Redeployment ändern. Diese
-- Singleton-Tabelle macht sie im Frontend (Verträge → Einstellungen) editierbar.
--
-- Gelesen/geschrieben wird serverseitig über die Service-Role (umgeht RLS) — auch
-- die öffentliche Signier-Route (/vertrag) braucht die Gläubigerdaten fürs PDF.
-- Die RLS-Policy deckt nur den (sonst nicht genutzten) direkten authenticated-Zugriff ab.

CREATE TABLE IF NOT EXISTS public.company_settings (
  id text PRIMARY KEY DEFAULT 'default',
  sepa_creditor_id text,
  sepa_creditor_name text,
  sepa_creditor_address text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_settings_singleton CHECK (id = 'default')
);

-- Singleton-Zeile anlegen, damit ein einfaches UPDATE/Upsert immer greift.
INSERT INTO public.company_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_settings_rw ON public.company_settings;
CREATE POLICY company_settings_rw ON public.company_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
