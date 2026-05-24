-- 093: Negative-Feedback für die Signatur-Extraktion. Wenn der User einen
-- automatisch angelegten Kontakt verwirft („nicht wieder anlegen"), landet
-- (lead_id, email) hier — die Sync-Pipeline überspringt diese Adresse dann
-- bei künftigen Mails und spart den LLM-Call.

create table if not exists public.signature_rejections (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  email       text not null,
  rejected_by uuid references auth.users(id),
  rejected_at timestamptz not null default now(),
  unique (lead_id, email)
);

create index if not exists signature_rejections_lead_id_idx on public.signature_rejections(lead_id);

alter table public.signature_rejections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'signature_rejections'
      and policyname = 'signature_rejections_authenticated_all'
  ) then
    create policy signature_rejections_authenticated_all on public.signature_rejections
      for all to authenticated using (true) with check (true);
  end if;
end
$$;
