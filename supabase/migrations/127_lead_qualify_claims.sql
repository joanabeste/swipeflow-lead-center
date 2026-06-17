-- 127: Lead-Reservierung fuer das Qualifizieren-Cockpit.
--
-- Problem: Mehrere Nutzer qualifizieren parallel. Bisher laedt jeder dieselbe
-- Queue (gleiche Sortierung, Start bei 0) → sie bearbeiten dieselben Leads.
--
-- Loesung: Beim Oeffnen des Cockpits reserviert sich jeder Nutzer einen
-- DISJUNKTEN Batch. `lead_id` ist Primary Key → hoechstens ein Besitzer pro Lead.
-- Die Vergabe nutzt `FOR UPDATE SKIP LOCKED` (Postgres-Work-Queue-Muster): zwei
-- gleichzeitige Aufrufe koennen technisch nie denselben Lead greifen.
--
-- Freigabe: aktiv beim Schliessen (Server-Action/Beacon) ODER per TTL (expires_at).
-- Die Claim-Funktion loescht abgelaufene Reservierungen selbst (selbstheilend) →
-- ein abgebrochener Nutzer blockiert nichts laenger als die TTL. Ein Cron raeumt
-- nur noch hygienisch hinterher. `assigned_to` bleibt unberuehrt (haengt an Provisionen).

create table if not exists public.lead_qualify_claims (
  lead_id    uuid primary key references public.leads(id) on delete cascade,
  claimed_by uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists lq_claims_by_user_idx on public.lead_qualify_claims(claimed_by);
create index if not exists lq_claims_expires_idx on public.lead_qualify_claims(expires_at);

-- Nur Service-Client / security-definer-RPC greifen zu (kein direkter Client-Zugriff).
alter table public.lead_qualify_claims enable row level security;

-- Atomare Batch-Reservierung: gibt abgelaufene frei, verlaengert die eigenen,
-- fuellt bis p_limit auf und liefert den aktuellen Batch des Nutzers zurueck.
create or replace function public.claim_qualify_leads(
  p_user uuid,
  p_limit int default 50,
  p_ttl_seconds int default 600
)
returns table (id uuid, rating text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_have int;
begin
  -- 1) Abgelaufene Reservierungen global freigeben (selbstheilend).
  delete from public.lead_qualify_claims where expires_at <= now();

  -- 2) Eigene aktive Reservierungen verlaengern (Reopen wirkt wie Heartbeat).
  update public.lead_qualify_claims
     set expires_at = now() + make_interval(secs => p_ttl_seconds)
   where claimed_by = p_user;

  -- 3) Bis p_limit auffuellen.
  select count(*) into v_have from public.lead_qualify_claims where claimed_by = p_user;

  if v_have < p_limit then
    with cand as (
      select l.id
      from public.leads l
      where l.deleted_at is null
        and l.crm_status_id is null
        and l.status not in ('qualified', 'exported')
        and l.lifecycle_stage = 'lead'
        and (l.vertical = 'webdesign' or l.traffic_light_rating is not null)
        and not exists (
          select 1 from public.lead_qualify_claims c where c.lead_id = l.id
        )
      order by l.traffic_light_score desc nulls last, l.id
      limit (p_limit - v_have)
      for update skip locked
    )
    insert into public.lead_qualify_claims (lead_id, claimed_by, expires_at)
    select cand.id, p_user, now() + make_interval(secs => p_ttl_seconds)
    from cand
    on conflict (lead_id) do nothing;
  end if;

  -- 4) Aktuellen Batch zurueckgeben — nur Leads, die noch in der Queue sind
  --    (bereits qualifizierte fallen raus, auch wenn die Claim-Zeile noch existiert).
  return query
    select l.id, l.traffic_light_rating::text
    from public.lead_qualify_claims c
    join public.leads l on l.id = c.lead_id
    where c.claimed_by = p_user
      and l.deleted_at is null
      and l.crm_status_id is null
      and l.status not in ('qualified', 'exported')
      and l.lifecycle_stage = 'lead'
    order by l.traffic_light_score desc nulls last, l.id;
end;
$$;

grant execute on function public.claim_qualify_leads(uuid, int, int) to authenticated, service_role;
