-- E-Mail-Templates pro User. Variablen werden als `{{name}}` im Body
-- gespeichert und beim Rendern ersetzt (siehe lib/email/templates.ts).

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_user_idx
  on email_templates(user_id, name);

alter table email_templates enable row level security;

-- Nutzer sehen nur ihre eigenen Templates.
create policy "email_templates_own_select" on email_templates
  for select using (auth.uid() = user_id);

-- Schreibzugriff nur über Service-Role (Server-Actions).
