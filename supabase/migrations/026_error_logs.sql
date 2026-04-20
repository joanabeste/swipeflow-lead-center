-- Diagnose-Tabelle: Server-Errors aus Next.js instrumentation.ts landen hier,
-- sodass sie im SQL-Editor lesbar sind (statt nur Digest in der Prod-Error-Boundary).
create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  path text,
  method text,
  message text,
  stack text,
  digest text,
  created_at timestamptz default now()
);

create index if not exists error_logs_created_at_idx
  on error_logs(created_at desc);

alter table error_logs enable row level security;

drop policy if exists "error_logs_admin_read" on error_logs;
create policy "error_logs_admin_read" on error_logs
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
