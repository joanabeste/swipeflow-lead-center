-- 132: Calendly-Integration.
--   a) integration_credentials — versionierte Nachbildung der bestehenden Tabelle
--      (bislang nur remote angelegt, von Webex genutzt). Speichert verschlüsselte
--      Provider-Tokens. provider='calendly' kommt neu hinzu.
--   b) calendly_event_mappings — Mapping Calendly-Event-Typ → CRM-Status.

-- ─── a) integration_credentials ───────────────────────────────────────────────
-- Idempotent: existiert die Tabelle bereits (Webex), passiert beim CREATE nichts;
-- die ADD COLUMN IF NOT EXISTS gleichen ein evtl. abweichendes Schema an.
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  provider text PRIMARY KEY,
  token_encrypted text,                 -- Format aus lib/crypto/secrets.ts: iv.tag.cipher (base64)
  token_expires_at timestamptz,
  scopes jsonb DEFAULT '[]'::jsonb,
  last_verified_at timestamptz,
  last_verify_error text,
  meta jsonb DEFAULT '{}'::jsonb,        -- provider-spezifische Zusatzdaten (z.B. Calendly org/user URI, webhook_uri)
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS token_encrypted text;
ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS scopes jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS last_verify_error text;
ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.integration_credentials ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_credentials_admin ON public.integration_credentials;
CREATE POLICY integration_credentials_admin ON public.integration_credentials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
-- Schreibzugriff der Server-Actions/Webhooks läuft über die Service-Role (umgeht RLS).

-- ─── b) calendly_event_mappings ───────────────────────────────────────────────
-- Ordnet jeden Calendly-Event-Typ einem CRM-Status zu. status-IDs sind text-Slugs
-- aus custom_lead_statuses.id (KEIN uuid) — siehe merge_lead-Migrationen.
CREATE TABLE IF NOT EXISTS public.calendly_event_mappings (
  event_type_uri text PRIMARY KEY,      -- Calendly Event-Type URI (stabil)
  event_type_name text NOT NULL,        -- Anzeigename (Cache aus Calendly)
  booked_status_id text,                -- -> custom_lead_statuses.id bei invitee.created
  canceled_status_id text,              -- -> custom_lead_statuses.id bei invitee.canceled (optional)
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendly_event_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendly_event_mappings_admin ON public.calendly_event_mappings;
CREATE POLICY calendly_event_mappings_admin ON public.calendly_event_mappings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
