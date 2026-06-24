-- 128: Arbeitsverträge (Werkstudent / Angestellter) + digitaler Personalfragebogen.
-- Eigenes Modell statt der Kundenvertrags-Tabelle `contracts` (kein lead_id, keine
-- SEPA/Raten/Kosten — wir zahlen den Mitarbeiter). Signier-Engine (Token-Link,
-- Unterschriften-Pad, Chromium-PDF, Bucket `contracts`) wird wiederverwendet.
-- Öffentliche Signier-/Fragebogen-Route nutzt den Service-Client (umgeht RLS) und
-- filtert strikt nach Token — RLS deckt nur die authentifizierte Admin-UI ab.

CREATE TABLE IF NOT EXISTS public.employment_contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant              text NOT NULL DEFAULT 'angestellter',  -- 'werkstudent' | 'angestellter'
  status               text NOT NULL DEFAULT 'draft',         -- draft|sent|viewed|signed|cancelled
  token                text UNIQUE,                            -- NULL bis Link/Versand

  -- Mitarbeiter (vom Arbeitgeber vorerfasst, vom MA beim Signieren bestätigt)
  employee_first_name  text,
  employee_last_name   text,
  employee_street      text,
  employee_zip         text,
  employee_city        text,
  employee_email       text,

  -- Eckdaten
  start_date           date,
  fixed_term           boolean NOT NULL DEFAULT false,        -- Befristung
  end_date             date,                                   -- nur bei fixed_term
  probation_months     integer NOT NULL DEFAULT 3,

  -- Vergütung (Cent, integer — keine Float-Beträge)
  pay_model            text NOT NULL DEFAULT 'monthly',       -- 'hourly' | 'monthly'
  hourly_wage_cents    integer NOT NULL DEFAULT 0,            -- bei pay_model='hourly'
  monthly_salary_cents integer NOT NULL DEFAULT 0,            -- bei pay_model='monthly'
  commission_per_appointment_cents integer NOT NULL DEFAULT 0, -- Provision je qualifiziertem Termin

  -- Arbeitszeit / Urlaub
  weekly_hours         numeric NOT NULL DEFAULT 30,
  workdays_per_week    integer NOT NULL DEFAULT 5,
  vacation_days        integer NOT NULL DEFAULT 28,

  -- Klausel-Schalter
  travel_cost_reimbursed boolean NOT NULL DEFAULT true,       -- Reisekosten zu Pflichtterminen erstattet?
  notice_period_model  text NOT NULL DEFAULT 'monat_zum_monatsende', -- 'gesetzlich' | 'monat_zum_monatsende'

  -- Signatur + finales PDF im privaten Bucket `contracts` (Präfix employment/<id>/)
  signature_path       text,                                  -- employment/<id>/signature.png
  pdf_path             text,                                  -- employment/<id>/vertrag.pdf

  -- Eingefrorene Konditionen + Template-Version beim Aktivieren des Links
  terms_snapshot       jsonb,

  sent_at              timestamptz,
  viewed_at            timestamptz,
  signed_at            timestamptz,
  expires_at           timestamptz,

  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employment_contracts_token_idx  ON public.employment_contracts(token);
CREATE INDEX IF NOT EXISTS employment_contracts_status_idx ON public.employment_contracts(status);

CREATE OR REPLACE FUNCTION public.employment_contracts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS employment_contracts_set_updated_at ON public.employment_contracts;
CREATE TRIGGER employment_contracts_set_updated_at
  BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.employment_contracts_touch();

ALTER TABLE public.employment_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employment_contracts_select ON public.employment_contracts;
CREATE POLICY employment_contracts_select ON public.employment_contracts
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS employment_contracts_write ON public.employment_contracts;
CREATE POLICY employment_contracts_write ON public.employment_contracts
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─── employment_contract_events: Historie/Timeline ─────────────────

CREATE TABLE IF NOT EXISTS public.employment_contract_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_contract_id uuid NOT NULL REFERENCES public.employment_contracts(id) ON DELETE CASCADE,
  event                  text NOT NULL,   -- created|sent|viewed|signed|downloaded|resent|extended|cancelled|questionnaire_submitted
  actor_user_id          uuid REFERENCES auth.users(id),   -- NULL = Mitarbeiter (öffentliche Route)
  meta                   jsonb NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employment_contract_events_idx
  ON public.employment_contract_events(employment_contract_id, created_at);

ALTER TABLE public.employment_contract_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employment_contract_events_select ON public.employment_contract_events;
CREATE POLICY employment_contract_events_select ON public.employment_contract_events
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS employment_contract_events_write ON public.employment_contract_events;
CREATE POLICY employment_contract_events_write ON public.employment_contract_events
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ─── employment_questionnaires: digitaler Personalfragebogen (1:1) ──

CREATE TABLE IF NOT EXISTS public.employment_questionnaires (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employment_contract_id uuid NOT NULL UNIQUE
                           REFERENCES public.employment_contracts(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'pending',   -- 'pending' | 'submitted'

  -- Unkritische Felder (Geburtsdaten, Familienstand, Ausbildung, KV, Kinder, VWL …)
  data                   jsonb NOT NULL DEFAULT '{}',

  -- Sensible Felder: AES-256-GCM verschlüsselt, nie Klartext
  steuer_id_encrypted    text,
  iban_encrypted         text,
  iban_last4             text,            -- sichere Anzeige ohne Entschlüsseln
  bic                    text,
  sv_nummer_encrypted    text,

  -- Fertig ausgefülltes Personalfragebogen-PDF (Präfix employment/<id>/)
  pdf_path               text,            -- employment/<id>/personalfragebogen.pdf

  submitted_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employment_questionnaires_contract_idx
  ON public.employment_questionnaires(employment_contract_id);

DROP TRIGGER IF EXISTS employment_questionnaires_set_updated_at ON public.employment_questionnaires;
CREATE TRIGGER employment_questionnaires_set_updated_at
  BEFORE UPDATE ON public.employment_questionnaires
  FOR EACH ROW EXECUTE FUNCTION public.employment_contracts_touch();

ALTER TABLE public.employment_questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employment_questionnaires_select ON public.employment_questionnaires;
CREATE POLICY employment_questionnaires_select ON public.employment_questionnaires
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS employment_questionnaires_write ON public.employment_questionnaires;
CREATE POLICY employment_questionnaires_write ON public.employment_questionnaires
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Storage: bestehender privater Bucket `contracts` wird mit Präfix employment/<id>/
-- wiederverwendet (Bucket + Policies stammen aus 099_contracts.sql).
