-- Freitext-Notizen pro Lead (für Sales/CRM)
create table if not exists lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lead_notes_lead_id_idx on lead_notes(lead_id, created_at desc);

alter table lead_notes enable row level security;

-- Alle authentifizierten Nutzer können Notes lesen & anlegen. Nur Ersteller darf ändern/löschen.
drop policy if exists "lead_notes_read_all" on lead_notes;
create policy "lead_notes_read_all" on lead_notes
  for select to authenticated using (true);

drop policy if exists "lead_notes_insert_self" on lead_notes;
create policy "lead_notes_insert_self" on lead_notes
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "lead_notes_update_self" on lead_notes;
create policy "lead_notes_update_self" on lead_notes
  for update to authenticated using (created_by = auth.uid());

drop policy if exists "lead_notes_delete_self_or_admin" on lead_notes;
create policy "lead_notes_delete_self_or_admin" on lead_notes
  for delete to authenticated using (
    created_by = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
