-- Anruf-Log pro Lead (manuell + über PhoneMondo-Webhook aktualisiert)
create table if not exists lead_calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  contact_id uuid references lead_contacts(id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  status text not null default 'initiated' check (status in (
    'initiated', 'ringing', 'answered', 'missed', 'failed', 'ended'
  )),
  duration_seconds int,
  notes text,
  phone_number text,
  mondo_call_id text unique,
  started_at timestamptz default now(),
  ended_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lead_calls_lead_id_idx on lead_calls(lead_id, started_at desc);
create index if not exists lead_calls_mondo_call_id_idx on lead_calls(mondo_call_id);

alter table lead_calls enable row level security;

drop policy if exists "lead_calls_read_all" on lead_calls;
create policy "lead_calls_read_all" on lead_calls
  for select to authenticated using (true);

drop policy if exists "lead_calls_insert_self" on lead_calls;
create policy "lead_calls_insert_self" on lead_calls
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "lead_calls_update_self_or_webhook" on lead_calls;
create policy "lead_calls_update_self_or_webhook" on lead_calls
  for update to authenticated using (
    created_by = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
