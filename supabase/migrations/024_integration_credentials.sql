-- Verschlüsselter Token-Storage für externe Integrationen (Webex, später weitere).
-- Ein Eintrag pro Provider. AES-256-GCM Payload (Format: iv.tag.cipher, base64).
create table if not exists integration_credentials (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  token_encrypted text not null,
  token_expires_at timestamptz,
  scopes text[],
  last_verified_at timestamptz,
  last_verify_error text,
  extra jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table integration_credentials enable row level security;

drop policy if exists "integration_credentials_admin_all" on integration_credentials;
create policy "integration_credentials_admin_all" on integration_credentials
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
