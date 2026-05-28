-- 099: contracts + contract_events — Kundenverträge (zunächst Webdesign).
-- Admin erzeugt einen Vertrag, versendet einen Token-Link, der Kunde füllt
-- Rechnungsdaten + SEPA-Mandat aus und unterschreibt extern (ohne Login).
-- Die öffentliche Route nutzt den Service-Client (umgeht RLS) und filtert
-- strikt nach Token — RLS deckt nur die authentifizierte Admin-UI ab.

CREATE TABLE IF NOT EXISTS public.contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  type                 text NOT NULL DEFAULT 'webdesign',   -- 'webdesign' | 'recruiting' (nur webdesign gebaut)
  status               text NOT NULL DEFAULT 'draft',       -- draft|sent|viewed|signed|cancelled
  token                text UNIQUE,                          -- NULL bis zum Versand

  -- Konditionen (Cent, integer — keine Float-Beträge)
  setup_price_cents    integer NOT NULL DEFAULT 200000,     -- 2000,00 €
  monthly_maint_cents  integer NOT NULL DEFAULT 0,          -- jährlich im Voraus abgerechnet
  payment_mode         text NOT NULL DEFAULT 'einmal',      -- 'einmal' | 'raten' (Raten nur auf Setup)
  installment_count    integer,                             -- nur bei payment_mode='raten'
  payment_method       text NOT NULL DEFAULT 'sepa',        -- 'sepa' | 'rechnung'
  hoster               text NOT NULL DEFAULT 'hetzner',     -- 'hetzner' | 'mittwald' (steuert AV §6)

  -- Vom Kunden ausgefüllt (öffentliche Route)
  billing_company      text,
  billing_street       text,
  billing_zip          text,
  billing_city         text,
  billing_email        text,
  billing_country      text DEFAULT 'Deutschland',

  -- SEPA (nur bei payment_method='sepa')
  sepa_account_holder  text,
  sepa_iban_encrypted  text,                                -- AES-256-GCM, nie Klartext
  sepa_iban_last4      text,                                -- für sichere Anzeige ohne Entschlüsseln
  sepa_bic             text,

  -- Signatur + finales PDF im privaten Bucket (Pfade, keine Bytes)
  signature_path       text,                                -- <id>/signature.png
  pdf_path             text,                                -- <id>/vertrag.pdf

  -- Eingefrorene Konditionen + TEMPLATE_VERSION beim Versand (reproduzierbares PDF)
  terms_snapshot       jsonb,

  sent_at              timestamptz,
  viewed_at            timestamptz,
  signed_at            timestamptz,
  expires_at           timestamptz,

  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_lead_idx   ON public.contracts(lead_id);
CREATE INDEX IF NOT EXISTS contracts_token_idx  ON public.contracts(token);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON public.contracts(status);

CREATE OR REPLACE FUNCTION public.contracts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS contracts_set_updated_at ON public.contracts;
CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_touch();

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS contracts_write ON public.contracts;
CREATE POLICY contracts_write ON public.contracts
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─── contract_events: Historie/Timeline ────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  event         text NOT NULL,   -- created|sent|viewed|signed|downloaded|resent|extended|cancelled
  actor_user_id uuid REFERENCES auth.users(id),   -- NULL = Kunde (öffentliche Route)
  meta          jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_events_contract_idx ON public.contract_events(contract_id, created_at);

ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_events_select ON public.contract_events;
CREATE POLICY contract_events_select ON public.contract_events
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS contract_events_write ON public.contract_events;
CREATE POLICY contract_events_write ON public.contract_events
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─── Storage-Bucket: privat, signed URLs zur Auslieferung ──────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contracts',
  'contracts',
  false,
  10485760,   -- 10 MB
  ARRAY['image/png','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'contracts_authenticated_read'
  ) THEN
    CREATE POLICY contracts_authenticated_read
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'contracts');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'contracts_authenticated_write'
  ) THEN
    CREATE POLICY contracts_authenticated_write
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'contracts');
  END IF;
END
$$;
