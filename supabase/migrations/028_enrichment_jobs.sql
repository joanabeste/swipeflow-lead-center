-- Background-Enrichment: Batch-Jobs laufen in der API-Function via `after()`,
-- ihr Fortschritt + die Teilergebnisse werden hier persistiert, damit die
-- Client-UI pollen und der globale Indicator aktive Jobs anzeigen kann.
--
-- Ein Modal-Close unterbricht den Job NICHT mehr — die Function läuft bis
-- `completed`/`failed`, unabhängig vom Browser-Zustand.

create table if not exists enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,

  status text not null default 'pending',
    -- pending | running | completed | failed

  total int not null,
  processed int not null default 0,

  config jsonb not null,
  service_mode text not null,
  lead_ids uuid[] not null,

  -- Angehängt pro abgeschlossenem Lead; jedes Element ist ein EnrichResult.
  results jsonb not null default '[]'::jsonb,

  current_lead_name text,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint enrichment_jobs_status_ok
    check (status in ('pending', 'running', 'completed', 'failed'))
);

create index if not exists enrichment_jobs_user_idx
  on enrichment_jobs(user_id, created_at desc);

create index if not exists enrichment_jobs_active_idx
  on enrichment_jobs(user_id, status)
  where status in ('pending', 'running');

alter table enrichment_jobs enable row level security;

-- Nutzer sehen nur ihre eigenen Jobs.
drop policy if exists "users_select_own_jobs" on enrichment_jobs;
create policy "users_select_own_jobs" on enrichment_jobs
  for select using (auth.uid() = user_id);

-- Insert/Update nur via Service-Role (Worker). Kein Direct-Insert für Clients.
-- Deshalb bewusst KEINE insert/update Policy — Service-Role umgeht RLS.
