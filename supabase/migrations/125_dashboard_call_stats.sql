-- 125: Dashboard-Aggregation der Anrufe (umgeht das PostgREST-1000-Zeilen-Limit).
--
-- Die Dashboard-Widgets zaehlten Anrufe bisher, indem sie die Roh-Zeilen aus
-- lead_calls ohne .range() luden — PostgREST liefert dann aber nur die ersten
-- 1000 Zeilen, sodass bei >1000 Anrufen die Zahlen (z.B. „heute pro Person")
-- still zu niedrig waren.
--
-- Diese Funktion aggregiert direkt in der DB pro Berlin-Kalendertag, Ersteller,
-- Richtung und Status. Bewusst KEINE Kategorisierung hier — die exakte
-- missed/inbound/outbound- bzw. status-Logik bleibt im JS, das diese Zeilen
-- konsumiert. Ergebnis sind nur wenige Zeilen (Tage × Nutzer × Richtung × Status).
--
-- Aufruf erfolgt ueber den Service-Client (RLS umgangen) → kein security definer
-- noetig. Idempotent (create or replace) → gefahrlos mehrfach ausfuehrbar.

create or replace function public.dashboard_call_stats(p_since timestamptz)
returns table (day date, created_by uuid, direction text, status text, cnt bigint)
language sql
stable
as $$
  select
    (started_at at time zone 'Europe/Berlin')::date as day,
    created_by,
    direction,
    status,
    count(*)::bigint as cnt
  from public.lead_calls
  where started_at >= p_since
  group by 1, 2, 3, 4;
$$;
