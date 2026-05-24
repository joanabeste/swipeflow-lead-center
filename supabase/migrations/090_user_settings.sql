-- 090: Per-User Settings. Aktuell nur Signatur — kann später um weitere Felder
-- erweitert werden (Notif-Preferences, Default-Views, etc.).

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  signature  text,
  signature_source text check (signature_source in ('extracted','manual')),
  signature_extracted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_settings'
      and policyname = 'user_settings_self'
  ) then
    create policy user_settings_self on public.user_settings
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end
$$;
