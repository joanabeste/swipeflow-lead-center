-- Lead-Aufgaben mit Faelligkeitsdatum (Wiedervorlagen).
-- Pro Lead beliebig viele offene Aufgaben moeglich, jede mit Titel + due_date.
-- done_at IS NULL → offen; NOT NULL → erledigt (Zeitpunkt der Erledigung).

create table if not exists lead_todos (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  title       text not null,
  due_date    date not null,
  done_at     timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists lead_todos_lead_idx on lead_todos(lead_id);

-- Partial Index fuer „heute faellig" / „ueberfaellig"-Queries.
create index if not exists lead_todos_open_due_idx
  on lead_todos(due_date)
  where done_at is null;

alter table lead_todos enable row level security;

-- Lese-Policy analog zu landing_pages: alle authenticated User koennen alle Todos lesen.
drop policy if exists "lead_todos_read_all" on lead_todos;
create policy "lead_todos_read_all" on lead_todos
  for select to authenticated using (true);

-- Schreib-Policies: ebenfalls fuer authenticated, RLS-Service-Client umgeht das ohnehin.
drop policy if exists "lead_todos_insert_authenticated" on lead_todos;
create policy "lead_todos_insert_authenticated" on lead_todos
  for insert to authenticated with check (true);

drop policy if exists "lead_todos_update_authenticated" on lead_todos;
create policy "lead_todos_update_authenticated" on lead_todos
  for update to authenticated using (true) with check (true);

drop policy if exists "lead_todos_delete_authenticated" on lead_todos;
create policy "lead_todos_delete_authenticated" on lead_todos
  for delete to authenticated using (true);
