-- 133: lead_appointments — gebuchte Calendly-Termine pro Lead.
--
-- Analog zu lead_calls: eigene Tabelle mit stabilem externen Schlüssel
-- (calendly_invitee_uri, UNIQUE) → Webhook-Retries sind idempotent, und eine
-- spätere Absage aktualisiert denselben Datensatz. Der Timeline-Eintrag selbst
-- wird über audit_logs (lead.appointment_booked / lead.appointment_canceled)
-- gerendert; diese Tabelle ist die strukturierte Source-of-Truth.

CREATE TABLE IF NOT EXISTS public.lead_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  calendly_invitee_uri text UNIQUE NOT NULL,   -- Idempotenz-/Update-Key
  calendly_event_uri text,
  event_type_uri text,                          -- Zuordnung zu calendly_event_mappings
  event_type_name text,                         -- Anzeige in der Timeline
  invitee_email text,
  invitee_name text,
  status text NOT NULL DEFAULT 'booked',        -- 'booked' | 'canceled'
  scheduled_at timestamptz,
  join_url text,
  cancel_reason text,
  raw jsonb,                                    -- Original-Payload (Debug/Nachverarbeitung)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_appointments_lead_id_idx ON public.lead_appointments(lead_id);
CREATE INDEX IF NOT EXISTS lead_appointments_scheduled_idx ON public.lead_appointments(scheduled_at);

ALTER TABLE public.lead_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_appointments_read ON public.lead_appointments;
CREATE POLICY lead_appointments_read ON public.lead_appointments
  FOR SELECT USING (auth.role() = 'authenticated');
-- Schreibend nur via Service-Role (Webhook) — keine direkten User-Writes.
