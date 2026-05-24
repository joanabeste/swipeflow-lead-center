-- 072: customer_contacts — Ansprechpartner pro Kunde.

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contacts_lead_idx ON public.customer_contacts(lead_id);
-- Nur ein primaerer Ansprechpartner pro Lead.
CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_one_primary
  ON public.customer_contacts(lead_id) WHERE is_primary = true;

CREATE OR REPLACE FUNCTION public.customer_contacts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS customer_contacts_set_updated_at ON public.customer_contacts;
CREATE TRIGGER customer_contacts_set_updated_at
  BEFORE UPDATE ON public.customer_contacts
  FOR EACH ROW EXECUTE FUNCTION public.customer_contacts_touch();

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_contacts_select ON public.customer_contacts;
CREATE POLICY customer_contacts_select ON public.customer_contacts
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS customer_contacts_write ON public.customer_contacts;
CREATE POLICY customer_contacts_write ON public.customer_contacts
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
