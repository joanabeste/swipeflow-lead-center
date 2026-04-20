-- E-Mail-MVP: SMTP-Zugangsdaten pro User + Versand-Log.
--
-- SMTP-Passwort ist AES-256-GCM verschlüsselt (iv.tag.cipher base64,
-- Format wie bei Webex-Token in `integration_credentials`). Schlüssel:
-- CREDENTIALS_ENCRYPTION_KEY.

-- Ein Eintrag pro User — deshalb user_id als PK.
create table if not exists user_smtp_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  host text not null,
  port int not null,
  secure boolean not null default false,   -- true = implicit TLS (465), false = STARTTLS (587/25)
  username text not null,
  password_encrypted text not null,
  from_name text not null,
  from_email text not null,
  verified_at timestamptz,
  last_test_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_smtp_credentials enable row level security;

-- User sieht nur eigene Credentials.
create policy "user_smtp_credentials_own_select" on user_smtp_credentials
  for select using (auth.uid() = user_id);

-- Schreibzugriff nur über Service-Role (Server-Actions verschlüsseln dort
-- das Passwort, der Client sieht den Klartext nie in der DB).

-- Versendete E-Mails — Grundstock für späteres Tracking.
create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  contact_id uuid references lead_contacts(id) on delete set null,
  sent_by uuid references profiles(id) on delete set null,
  to_email text not null,
  from_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'sent',
    -- sent | failed
  error text,
  sent_at timestamptz not null default now(),
  constraint email_messages_status_ok check (status in ('sent', 'failed'))
);

create index if not exists email_messages_lead_idx on email_messages(lead_id, sent_at desc);
create index if not exists email_messages_sent_by_idx on email_messages(sent_by, sent_at desc);

alter table email_messages enable row level security;

-- User sieht nur eigene Sendungen.
create policy "email_messages_own_select" on email_messages
  for select using (auth.uid() = sent_by);
