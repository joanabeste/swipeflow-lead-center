-- CRM-Workflow-Stati (frei konfigurierbar durch Admins)
create table if not exists custom_lead_statuses (
  id text primary key,
  label text not null,
  color text not null default '#6b7280',
  description text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed mit den bisherigen HubSpot-Stati
insert into custom_lead_statuses (id, label, color, display_order) values
  ('manuelle-ueberpruefung', 'Manuelle Überprüfung', '#eab308', 10),
  ('todo', 'Todo', '#3b82f6', 20),
  ('recruiting-lead', 'Recruiting Lead', '#10b981', 30),
  ('recruiting-todo', 'Recruiting Todo', '#14b8a6', 40),
  ('webdesign-lead', 'Webdesign Lead', '#8b5cf6', 50),
  ('webdesign-manuelle-ueberpruefung', 'Webdesign — Manuelle Überprüfung', '#a855f7', 60),
  ('new', 'New', '#6b7280', 70),
  ('pipeline', 'Pipeline', '#f97316', 80)
on conflict (id) do nothing;

-- Spalte crm_status_id an leads
alter table leads
  add column if not exists crm_status_id text references custom_lead_statuses(id) on delete set null;

create index if not exists leads_crm_status_id_idx on leads(crm_status_id);

-- Trigger: beim Wechsel auf status='qualified' automatisch crm_status_id='todo' setzen,
-- falls noch keiner gesetzt ist.
create or replace function set_default_crm_status() returns trigger as $$
begin
  if new.status = 'qualified'
     and (old.status is distinct from 'qualified')
     and new.crm_status_id is null
  then
    new.crm_status_id := 'todo';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_default_crm_status on leads;
create trigger leads_default_crm_status
  before update on leads
  for each row execute function set_default_crm_status();

-- RLS
alter table custom_lead_statuses enable row level security;

drop policy if exists "custom_lead_statuses_read_all" on custom_lead_statuses;
create policy "custom_lead_statuses_read_all" on custom_lead_statuses
  for select to authenticated using (true);

drop policy if exists "custom_lead_statuses_admin_write" on custom_lead_statuses;
create policy "custom_lead_statuses_admin_write" on custom_lead_statuses
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
