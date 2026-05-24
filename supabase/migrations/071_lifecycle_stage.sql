-- 071: Lead-Lifecycle-Stage. Additiv, kein Datenverlust.
-- lifecycle_stage 'customer' qualifiziert einen Lead als Kunde im Fulfillment-Modul.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('lead', 'deal', 'customer', 'archived')),
  ADD COLUMN IF NOT EXISTS became_customer_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_lifecycle_idx ON public.leads(lifecycle_stage);
