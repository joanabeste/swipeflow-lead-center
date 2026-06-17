-- 126: leads.last_call_at — letzter Anruf-Zeitpunkt persistent pro Lead.
--
-- Problem: Das CRM-Board (app/(dashboard)/crm/page.tsx) bestimmte „hat Anruf"
-- bisher, indem es ALLE lead_ids mit Anruf lud und sie INLINE in die PostgREST-URL
-- packte (`or=(status.eq.qualified,id.in.(<viele UUIDs>))`). Sobald genug Leads
-- einen Anruf hatten (~430+), ueberschritt die URL Nodes fetch/undici-Header-Limit
-- (16 KB) → UND_ERR_HEADERS_OVERFLOW, die Query warf, supabase-js lieferte data:null
-- und das Board zeigte 0 Leads (Fehler verschluckt via `leads ?? []`).
--
-- Loesung: den letzten Anruf-Zeitpunkt als Spalte pflegen. Die App filtert dann mit
-- `last_call_at not.is.null` / Zeitvergleichen statt mit Inline-ID-Listen → konstante
-- URL-Groesse, kein Ueberlauf, und kein 10.000-Zeilen-lead_calls-Scan pro Aufruf.
--
-- Trigger haelt die Spalte aktuell (max(started_at) je Lead). Recompute statt
-- inkrementell, damit auch DELETE und Merge-Reassign (lead_calls.lead_id wechselt)
-- korrekt abgedeckt sind. Idempotent (IF NOT EXISTS / OR REPLACE).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_call_at timestamptz;

CREATE OR REPLACE FUNCTION public.leads_sync_last_call_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Bei UPDATE/DELETE den alten Lead neu berechnen (z. B. Merge: lead_id wechselt).
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.lead_id IS NOT NULL THEN
    UPDATE public.leads l
       SET last_call_at = (SELECT max(c.started_at) FROM public.lead_calls c WHERE c.lead_id = OLD.lead_id)
     WHERE l.id = OLD.lead_id;
  END IF;
  -- Bei INSERT/UPDATE den neuen Lead neu berechnen.
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.lead_id IS NOT NULL THEN
    UPDATE public.leads l
       SET last_call_at = (SELECT max(c.started_at) FROM public.lead_calls c WHERE c.lead_id = NEW.lead_id)
     WHERE l.id = NEW.lead_id;
  END IF;
  RETURN NULL; -- AFTER-Trigger: Rueckgabewert wird ignoriert
END;
$$;

DROP TRIGGER IF EXISTS lead_calls_sync_last_call_at ON public.lead_calls;
CREATE TRIGGER lead_calls_sync_last_call_at
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_calls
  FOR EACH ROW EXECUTE FUNCTION public.leads_sync_last_call_at();

-- Backfill aus dem Bestand.
UPDATE public.leads l
   SET last_call_at = s.m
  FROM (SELECT lead_id, max(started_at) AS m FROM public.lead_calls GROUP BY lead_id) s
 WHERE s.lead_id = l.id;

-- Index fuer Scope- (not null) und Zeitfenster-Filter.
CREATE INDEX IF NOT EXISTS leads_last_call_at_idx ON public.leads(last_call_at);
