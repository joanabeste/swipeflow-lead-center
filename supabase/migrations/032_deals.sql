-- Deal-Pipeline: Deals sind nicht-abgeschlossene Verkaufschancen, die
-- einem Lead (Firma) zugeordnet sind. Stages sind analog zu
-- `custom_lead_statuses` frei konfigurierbar.

-- Deal-Stages (z.B. Neu, Qualifiziert, Angebot, Verhandlung, Gewonnen, Verloren)
create table if not exists deal_stages (
  id text primary key,
  label text not null,
  description text,
  color text not null default '#6b7280',
  display_order int not null default 0,
  -- "won" und "lost" sind terminale Stages (kein Drag zurück erwartet)
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table deal_stages enable row level security;
drop policy if exists "deal_stages_read_all" on deal_stages;
create policy "deal_stages_read_all" on deal_stages
  for select to authenticated using (true);
-- Schreibrechte nur über Service-Client (Admin-Action).

-- Default-Stages seeden (idempotent — on conflict do nothing)
insert into deal_stages (id, label, color, display_order, kind) values
  ('new',         'Neu',           '#6366f1', 10, 'open'),
  ('qualified',   'Qualifiziert',  '#8b5cf6', 20, 'open'),
  ('proposal',    'Angebot',       '#3b82f6', 30, 'open'),
  ('negotiation', 'Verhandlung',   '#f59e0b', 40, 'open'),
  ('won',         'Gewonnen',      '#10b981', 90, 'won'),
  ('lost',        'Verloren',      '#ef4444', 99, 'lost')
on conflict (id) do nothing;

-- Deals selbst
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  title text not null,
  description text,
  amount_cents bigint not null default 0,
  currency text not null default 'EUR',
  stage_id text not null references deal_stages(id),
  assigned_to uuid references profiles(id) on delete set null,
  expected_close_date date,
  actual_close_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_amount_non_negative check (amount_cents >= 0)
);

create index if not exists deals_lead_idx on deals(lead_id);
create index if not exists deals_stage_idx on deals(stage_id);
create index if not exists deals_assigned_idx on deals(assigned_to);
create index if not exists deals_updated_idx on deals(updated_at desc);

alter table deals enable row level security;
drop policy if exists "deals_read_authenticated" on deals;
create policy "deals_read_authenticated" on deals
  for select to authenticated using (true);
-- Schreibzugriff via Service-Client (Server-Actions).

-- Audit-Trail pro Deal: welche Felder wurden wann von wem geändert.
-- Ähnlich zu `lead_changes`.
create table if not exists deal_changes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  changed_by uuid references profiles(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists deal_changes_deal_idx on deal_changes(deal_id, created_at desc);

alter table deal_changes enable row level security;
drop policy if exists "deal_changes_read_authenticated" on deal_changes;
create policy "deal_changes_read_authenticated" on deal_changes
  for select to authenticated using (true);
